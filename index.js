/* jshint node: true */
/* jshint browser:true */
"use strict";

var ObjMtlLoader = require('obj-mtl-loader');
var PC2Loader = require('./lib/parse-pc2/index');
var Model = require('./lib/model');
var request = require('xhr-request');
var arrayBufferToBuffer = require('arraybuffer-to-buffer');
var assert = require('chai').assert;

var glContext   = require('gl-context');
var fit         = require('canvas-fit');
var fs          = require('fs');
var turntableCamera = require('turntable-camera');
var Geom    = require('gl-geometry');
var glClear   = require('gl-clear');
var glShader = require('gl-shader');
var glslify  = require('glslify');
var mat4    = require('gl-mat4');
var vec3    = require('gl-vec3');
var quat    = require('gl-quat');

var createOrbitCamera = require("orbit-camera");
var GPControls = require('gp-controls');

var intersect = require('ray-triangle-intersection');
var computeNormals = require('normals');

var gamepad = GPControls({
    '<axis-left-x>': 'x',
	'<axis-left-y>': 'y',
	'<action 1>': 'plant'
});

// Creates a canvas element and attaches
// it to the <body> on your DOM.
var canvas = document.body.appendChild(document.createElement('canvas'));

// A small convenience function for creating
// a new WebGL context - the "render" function
// supplied here is called every frame to draw
// to the screen.
var gl = glContext(canvas, render);

// Resizes the <canvas> to fully fit the window
// whenever the window is resized.
window.addEventListener('resize', fit(canvas), false);

var clear = glClear({ color: [0, 0, 0, 1], depth: true });
gl.enable(gl.CULL_FACE);
gl.enable(gl.DEPTH_TEST);

var shader = glShader(gl,
    glslify('./shaders/flat.vert'),
	glslify('./shaders/flat.frag'));

var eye = [0, 0, -35];
var center = [0, 0, 0];
var up = [1, 0, 0];
var camera = createOrbitCamera(eye, center, up);

console.log('WebGL setup done, loading assets...');
var globe = null, cloud = null;
loadAssets();

var tree;
var animation;

function loadAssets(globeLoaded) {

	// Load globe
	new ObjMtlLoader().load('./assets/globe.obj', './assets/globe.mtl', function(err, objAndMtl) {
		if (err) {
			console.log(err);
			throw err;
		}

		console.log('Globe loaded');
		
		globe = new Model(objAndMtl, gl);
		globe.setup(globe.geom.data.rawVertices);
		globe.model = mat4.create();
	});
	
	// Load cloud
	new ObjMtlLoader().load('./assets/cloud.obj', './assets/cloud.mtl', function(err, objAndMtl) {
		if (err) {
			console.log(err);
			throw err;
		}

		console.log('Cloud loaded');
		
		cloud = new Model(objAndMtl, gl);
		cloud.setup(cloud.geom.data.rawVertices);
	});
	
	loadTree();
}

var cloudsPos = [
	[ 0, 15, 10 ],
	[ -10, -13, 11 ],
	[ -10, -8, 10 ],
	[ -15, 8, 10 ],
	[ 0, -12, -8 ],
	[ +8, 12, -2 ]
];

var treePos = [];

var lastPlant = 0;

var lastDate = Date.now();
var lastx=0, lasty=0;
function render() {

	// Compute the time elasped since last render (in ms)
	var now = Date.now();
	var step = now - lastDate;
	lastDate = now;
	
	// Time coefficient. 1 is the base, will double if frame rate doubles
	var coef = (step === 0) ? 1 : (18/step);
	
	var width = canvas.width;
	var height = canvas.height;

	gl.viewport(0, 0, width, height);
	clear(gl);

	var proj = mat4.create();
	mat4.perspective(proj, Math.PI / 4, width / height, 0.001, 1000);

	if (globe !== null) {
	
		var view = camera.view();

		gamepad.poll();
		if (gamepad.enabled) {
		
			var padx = Math.abs(gamepad.inputs.x) < 0.25 ? 0 : gamepad.inputs.x;
			var pady = Math.abs(gamepad.inputs.y) < 0.25 ? 0 : gamepad.inputs.y;
			
			var x=padx/(100*coef),y=pady/(100*coef);
			camera.rotate([x,y], [0,0]);
			lastx = x;
			lasty = y;
			
			if (gamepad.inputs.plant.pressed) {
			
				// Not more than once per second
				if (Date.now() - lastPlant > 500) {
					lastPlant = Date.now();

					console.log('Plant!');
					
					var pt = [0, 0, 0];
					
					var invView = mat4.create();
					mat4.invert(invView, view);
					
					var dir = vec3.create();
					//vec3.set(dir, eye[0], eye[1], eye[2]);
					var modelDir = vec3.create();
					vec3.transformMat4(modelDir, dir, invView);
					vec3.scale(modelDir, modelDir, -0.5);
					
					// Search for an intersection with a globe triangle
					var data = globe.geom.data;
					var faces = data.rawFaces;
					var intersection = null;
					var intersected;
					for (var f=0; f<faces.length; f++) {
						var i0 = faces[f][0], i1 = faces[f][1], i2 = faces[f][2];
						var tri = [ data.rawVertices[i0], data.rawVertices[i1], data.rawVertices[i2] ];
						intersection = intersect([], pt, modelDir, tri);
						if (intersection !== null) {
						intersected = f;
							break;
						}
					}
					
					if (intersection !== null) {
						console.log('Intersection found:', intersection);
						treePos.push({'pos': intersection, 'intersected': intersected, 'frame': 0});
					}
				}
			}
		}
		
		// Add a constant rotation
		camera.rotate([0.0008 / coef,0], [0,0]);

		// Compute matrices
		// See http://stackoverflow.com/a/21079741/38096
		var normalMatrix = mat4.create();
		var temp = mat4.create();
		mat4.invert(temp, view);
		mat4.transpose(normalMatrix, temp);

		// Set up shader
		globe.geom.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = view;
		shader.uniforms.normalMatrix = normalMatrix;

		shader.uniforms.model = globe.model;
		globe.draw(shader);
		globe.geom.unbind();
		
		cloud.geom.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = view;
		shader.uniforms.normalMatrix = normalMatrix;

		for (var cl=0; cl<cloudsPos.length; cl++) {
			var cloudModel = mat4.create();
			var posarr = cloudsPos[cl];
			var vpos = vec3.create();
			vec3.set(vpos, posarr[0], posarr[1], posarr[2]);
			mat4.translate(cloudModel, mat4.create(), vpos);
			shader.uniforms.model = cloudModel;
			cloud.draw(shader);
		}
		cloud.geom.unbind();
		
		if (tree !== null && treePos.length > 0) {
			
			// No culling for trees since leaves are only one polygon wide
			gl.disable(gl.CULL_FACE);

			for (var tr=0; tr<treePos.length; tr++) {

				var data = tree.geom.data;

				// Compute current animation state
				var currentFrame = animation.length - 1;
				/*
				var currentFrame = treePos[tr].frame;//Math.floor(Date.now() * 0.02) % animation.length;
				if (currentFrame < animation.length - 1) {
					treePos[tr].frame++;
				}
				*/
				var currentFrameVertices = animation[currentFrame];
				assert.isArray(currentFrameVertices);
				assert.equal(currentFrameVertices.length, data.baseVertices.length);

				// Duplicate positions (see comments in onModelLoaded)
				var positions = [];
				for (var j=0; j<data.rawFaces.length; j++) {
					var idx = data.rawFaces[j];
					positions.push(currentFrameVertices[idx[0]]);
					positions.push(currentFrameVertices[idx[1]]);
					positions.push(currentFrameVertices[idx[2]]);
				}
				
				// Compute normals per vertex
				var faceNormals = computeNormals.faceNormals(data.faceIndices, positions);
				var normals = [];
				for (var k=0; k<data.rawFaces.length; k++) {
					var faceNormal = faceNormals[k];
					normals.push(faceNormal);
					normals.push(faceNormal);
					normals.push(faceNormal);
				}

				// Update model with animation data
				// Stupidly inefficient but I won't recode this now :)
				tree.geom.dispose();
				tree.geom = Geom(gl).attr('position', positions).attr('normal', normals).faces(data.faceIndices);
				tree.geom.data = data;

				tree.geom.bind(shader);
				shader.uniforms.proj = proj;
				shader.uniforms.view = view;

				// Build a rotation matrix to rotate the tree such that it is aligned with the triangle normal
				var triNormal = globe.geom.data.rawNormals[treePos[tr].intersected];
				var normal = vec3.fromValues(triNormal[0], triNormal[1], triNormal[2]);
				vec3.normalize(normal, normal);
				
				// Now that intersection point was computed, we do not take camera into account anymore;
				// coordinates are expressed in the globe reference frame
				// (which sits at the origin, untransformed)

				// The intersection point (will be the base of the tree)
				var vpos = vec3.fromValues(treePos[tr].pos[0], treePos[tr].pos[1], treePos[tr].pos[2]);

				// Build a rotation matrix from the tree up vector to the vpos vector (the "local up")
				var localUp = vec3.create();
				vec3.normalize(localUp, vpos);
				
				// Should be the same computation as quat.rotationTo(couldn't get rotationTo to work)
				// Source: http://forums.cgsociety.org/archive/index.php?t-741227.html
				var z2 = vec3.fromValues(0,1,0); // y is up in Blender (for our tree anyway)
				var z1 = normal; //localUp;
				
				var theRotAxis = vec3.create();
				vec3.cross(theRotAxis, z2, z1);
				vec3.normalize(theRotAxis, theRotAxis);
				
				var theAngle = Math.acos(vec3.dot(z2, z1));

				var theQuat = quat.create();
				quat.setAxisAngle(theQuat, theRotAxis, theAngle);
				
				var rot = mat4.create();
				mat4.fromQuat(rot, theQuat);
				
				// Build a translation matrix to go from the origin to the intersection point
				var translate = mat4.create();
				mat4.translate(translate, translate, vpos);
				
				// Scale matrix (tree is too big wrt the globe)
				var scale = mat4.create();
				mat4.scale(scale, scale, vec3.fromValues(0.15,0.15,0.15));

				// Compose transformations
				var treeModel = mat4.create();
				mat4.multiply(treeModel, treeModel, translate);
				mat4.multiply(treeModel, treeModel, rot);
				mat4.multiply(treeModel, treeModel, scale);

				// Draw using this model transformation
				shader.uniforms.model = treeModel;
				
				// Since model matrix is not identity,
				// normalMatrix must be recomputed for each tree
				shader.uniforms.normalMatrix = computeNormalMatrix(view, treeModel);
				
				tree.draw(shader);

				tree.geom.unbind();
			}

			gl.enable(gl.CULL_FACE);
		}
	}
}

function computeNormalMatrix(view, model) {
	var viewModel = mat4.create();
	mat4.multiply(viewModel, view, model);
	
	var temp = mat4.create();
	mat4.invert(temp, viewModel);

	var normalMatrix = mat4.create();
	mat4.transpose(normalMatrix, temp);
	return normalMatrix;
}
		
function loadTree() {

	var objLoader = new ObjMtlLoader();
	objLoader.load('./assets/palmtree_animated_joined.obj', './assets/palmtree_animated_joined.mtl', function(err, objAndMtl) {
		if (err) {
			console.log(err);
			throw err;
		}
		
		console.log('Tree model loaded');

		tree = new Model(objAndMtl, gl);
		tree.setup(tree.geom.data.rawVertices);
	});

	var pc2Loader = new PC2Loader();
	pc2Loader.on('readable', function() {
		var pc2Data = pc2Loader.read();
		if (pc2Data) {
			console.log('Tree animation loaded');
			
			// Convert PC2 animation data
			animation = [];
			for (var i=0; i<pc2Data.frames.length; i++) {
				var frame = [];
				var points = pc2Data.frames[i].points;
				for (var j=0; j<points.length; j++) {
					frame.push([ points[j].x, points[j].y, points[j].z ]);
				}
				animation.push(frame);
			}
		}
	});

	// binary-xhr works, too
	request('./assets/palmtree_animated_joined.pc2', {
		responseType: 'arraybuffer'
	}, function (err, data) {
		if (err) {
			console.log(err);
			throw err;
		}

		// Cannot consume ArrayBuffer content directly...
		// See http://www.html5rocks.com/en/tutorials/webgl/typed_arrays/
		var dataBuffer = arrayBufferToBuffer(data);
		pc2Loader.write(dataBuffer);
	});
}
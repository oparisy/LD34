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
			
			var x=gamepad.inputs.x/(100*coef),y=gamepad.inputs.y/(100*coef);
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
					console.log('modelDir:', modelDir);
					vec3.scale(modelDir, modelDir, -0.5);
					
					// Search for an intersection with a globe triangle
					var data = globe.geom.data;
					var faces = data.rawFaces;
					var intersection = null;
					for (var f=0; f<faces.length; f++) {
						var i0 = faces[f][0], i1 = faces[f][1], i2 = faces[f][2];
						//console.log('i0:',i0,'i1:',i1,'i2:',i2);
						var tri = [ data.rawVertices[i0], data.rawVertices[i1], data.rawVertices[i2] ];
						//console.log('pt:',pt);
						//console.log('modelDir',modelDir);
						//console.log('tri:',tri);
						intersection = intersect([], pt, modelDir, tri);
						if (intersection !== null) {
							break;
						}
					}
					
					if (intersection !== null) {
						console.log('Intersection found:', intersection);
						treePos.push({'pos': intersection, 'frame': 0});
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
				shader.uniforms.normalMatrix = normalMatrix;

				var treeModel = mat4.create();
				var posarr = treePos[tr].pos;
				var vpos = vec3.create();
				vec3.set(vpos, posarr[0], posarr[1], posarr[2]);
				mat4.translate(treeModel, mat4.create(), vpos);
				shader.uniforms.model = treeModel;
				tree.draw(shader);

				tree.geom.unbind();
			}
		}
	}
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
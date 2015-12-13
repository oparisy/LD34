/* jshint node: true */
/* jshint browser:true */
"use strict";

var ObjMtlLoader = require('obj-mtl-loader');
var PC2Loader = require('./lib/parse-pc2/index');
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
var computeNormals = require('normals');

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

var proj = mat4.create();
var camera = turntableCamera();

camera.center[1] = -5; // Up?
camera.distance += 15;
camera.downwards = Math.PI * 0.125; // Will influence camera's height wrt the ground

console.log('WebGL setup done, loading assets...');
var model = null;
var animation = null;
loadAssets(onModelLoaded, onAnimationLoaded);

function onModelLoaded(objAndMtl) {

	// Convert data to the expect format
	var vertices = convertVertices(objAndMtl.vertices);
	var tuple = convertFaces(objAndMtl.faces);
	var rawFaces = tuple[0], rawNormals = tuple[1]; // Could use destructuring assignment. Not sure of its availability
	
	// Duplicate vertices and normals indexes since there is one normal per face
	// (so a member of "vertices" will have as many normals as faces it contributes to)
	// See https://forums.khronos.org/showthread.php/7063-Texture-coordinates-per-face-index-instead-of-per-vertex
	// Having separate faces is mndatory to get a "flat" shading
	// Note that we will not actually use the .obj normals since the .pc2 does not provide them for intermediary poses
	// To keep things simple each face "f" (numbered from 0) will use position and normal at index f, f+1 and f+2
	var faceIndices = [];
	for (var i=0; i<rawFaces.length; i++) {
		faceIndices.push([3*i, 3*i+1, 3*i+2]);
	}
	assert.equal(faceIndices.length, objAndMtl.faces.length);
	assert.equal(faceIndices.length, rawFaces.length);

	// Build rendering model (manage VAO, buffers and draw calls)
	// Note that this object will not actually be drawn (see render)
	model = Geom(gl).attr('position', vertices).faces(rawFaces);
	
	// Attach topology and materials data to model for later use
	var data = {};
	data.rawFaces = rawFaces;
	data.faceIndices = faceIndices;
	data.materials = objAndMtl.materials;
	data.facesMaterials = objAndMtl.facesMaterialsIndex;
	model.data = data;
	
	console.log('Raw model statistics: ' + vertices.length + ' vertices, ' + rawFaces.length + ' faces, ' + model.data.materials.length + ' materials');
	console.log('Materials:', model.data.materials);
	console.log('Faces Materials:', model.data.facesMaterials);

	// We want to be able to access those by name
	for (var j=0; j<model.data.materials.length; j++) {
		var material = model.data.materials[j];
		model.data.materials[material.name] = material;
	}

	// Debugging purpose
	model.data.baseVertices = vertices;

	console.log('Geometry set up');
}

function onAnimationLoaded(pc2Data) {
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

// Convert vertices returned by obj-mtl-loader to a format suitable for gl-geometry
function convertVertices(vertices) {
	assert.isArray(vertices);

	if (vertices.length === 0) {
		return vertices;
	}
	
	assert.isArray(vertices[0]);
	
	if (vertices[0].length === 3) {
		return vertices;
	}
	
	if (vertices[0].length === 4) {
		// Only keep the first 3 components for each vertex
		var result = [];
		for (var i=0; i<vertices.length; i++) {
			result.push([ vertices[i][0], vertices[i][1], vertices[i][2] ]);
		}
		return result;
	}

	throw 'Unhandled vertices format';
}

// Convert vertice and normal indexes returned by obj-mtl-loader to a format suitable for gl-geometry
function convertFaces(faces) {
	assert.isArray(faces);
	
	var verticesIndex = [];
	var normalsIndex = [];
	for (var i=0; i<faces.length; i++) {
		var indices	= faces[i].indices;
		verticesIndex.push([ parseInt(indices[0])-1, parseInt(indices[1])-1, parseInt(indices[2])-1 ]);
		normalsIndex.push(parseInt(faces[i].normal)-1);
	}

	return [verticesIndex, normalsIndex];
}

function render() {
	
	var width = canvas.width;
	var height = canvas.height;

	gl.viewport(0, 0, width, height);
	clear(gl);

	mat4.perspective(proj, Math.PI / 4, width / height, 0.001, 1000);

	// update camera rotation angle
	camera.rotation = Date.now() * 0.0004;

	if (model !== null && animation !== null) {

		var data = model.data;
			
		// Compute current animation state
		var currentFrame = Math.floor(Date.now() * 0.02) % animation.length;
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
		model.dispose();
		model = Geom(gl).attr('position', positions).attr('normal', normals).faces(data.faceIndices);
		model.data = data;

		// Compute matrices
		// See http://stackoverflow.com/a/21079741/38096
		var view = camera.view();
		var normalMatrix = mat4.create();
		var temp = mat4.create();
		mat4.invert(temp, view);
		mat4.transpose(normalMatrix, temp);

		// Set up shader
		model.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = view;
		shader.uniforms.normalMatrix = normalMatrix;

		// Subdivide draw calls by material (we asked the obj exporter to sort faces accordingly)
		var fmat = data.facesMaterials;
		for (var i=0; i<fmat.length; i++) {
			var facesInfo = fmat[i];
			var firstFace = facesInfo.materialStartIndex;
			var nbFaces = ((i == fmat.length - 1) ? (data.faceIndices.length) : fmat[i + 1].materialStartIndex) - firstFace;

			var material = data.materials[facesInfo.materialName];
			var diffuse = material.diffuse;
			var color = [ parseFloat(diffuse[0]), parseFloat(diffuse[1]), parseFloat(diffuse[2]) ];
			shader.uniforms.v_color = color;

			// That was bloody painful to deduce from my strange rendering bugs
			// See http://stackoverflow.com/questions/10221647/how-do-i-use-webgl-drawelements-offset
			var start = firstFace * 3 * 2; // "2" is sizeof(uint16)
			var stop = nbFaces * 3 + start;

			model.draw(gl.TRIANGLES, start, stop);
		}

		model.unbind();
	}	
}

function loadAssets(modelLoaded, animationLoaded) {

	var objLoader = new ObjMtlLoader();
	objLoader.load('./assets/palmtree_animated_joined.obj', './assets/palmtree_animated_joined.mtl', function(err, result) {
		if (err) {
			console.log(err);
			throw err;
		}
		
		console.log('Model loaded');
		modelLoaded(result);
	});

	var pc2Loader = new PC2Loader();
	pc2Loader.on('readable', function() {
		var parsed = pc2Loader.read();
		if (parsed) {
			console.log('Animation loaded');
			animationLoaded(parsed);
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
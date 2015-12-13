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

var shader = glShader(gl,
    glslify('./shaders/demo.vert'),
	glslify('./shaders/demo.frag'));

var proj = mat4.create();
var camera = turntableCamera();

camera.center[1] = -5; // Up?
camera.distance += 15;
camera.downwards = Math.PI * 0.125; // Will influence camera's height wrt the ground

console.log('WebGL setup done, loading assets...');
var model = null;
var animation = null;
loadAssets(onModelLoaded, onAnimationLoaded);

// Debugging purpose
var baseVertices;
var faces;

function onModelLoaded(objAndMtl) {

	baseVertices = convertVertices(objAndMtl.vertices);
	faces = convertFaces(objAndMtl.faces);
	
	model = Geom(gl).attr('position', baseVertices).faces(faces);

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
		// Only keep the first 3 components for eacch vertex
		var result = [];
		for (var i=0; i<vertices.length; i++) {
			result.push([ vertices[i][0], vertices[i][1], vertices[i][2] ]);
		}
		return result;
	}

	throw 'Unhandled vertices format';
}

// Convert vertices returned by obj-mtl-loader to an indices format suitable for gl-geometry
function convertFaces(faces) {
	assert.isArray(faces);
	
	var result = [];
	for (var i=0; i<faces.length; i++) {
	var indices	= faces[i].indices;
		result.push([ parseInt(indices[0])-1, parseInt(indices[1])-1, parseInt(indices[2])-1 ]);
	}

	return result;
}

function render() {
	
	var width = canvas.width;
	var height = canvas.height;

	gl.viewport(0, 0, width, height);
	clear(gl);

	mat4.perspective(proj, Math.PI / 4, width / height, 0.001, 1000);

	// update camera rotation angle
	camera.rotation = Date.now() * 0.0004;

	if (model !== null) {
		
		if (animation !== null) {
		
			// Hardcoded number of frames
			var currentFrame = Math.floor(Date.now() * 0.02) % 30;
			var currentFrameVertices = animation[currentFrame]; //baseVertices;
			assert.isArray(currentFrameVertices);
			assert.equal(currentFrameVertices.length, baseVertices.length);

			/*
			// Force an update
			model._attributes = [];
			model._keys = [];
			model.attr('position', currentFrameVertices);
			*/

			// Stupidly inefficient
			// TODO Should I call model.dispose(); ?
			model = Geom(gl).attr('position', currentFrameVertices).faces(faces);
		}
	
		model.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = camera.view();
		model.draw(gl.TRIANGLES);
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
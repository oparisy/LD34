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

//camera.center[1] = -5; // Up?
camera.distance += 2;
camera.downwards = Math.PI * 0.0125; // Will influence camera's height wrt the ground

console.log('WebGL setup done, loading assets...');
var globe = null;
loadAssets();

function loadAssets(globeLoaded) {

	var objLoader = new ObjMtlLoader();
	objLoader.load('./assets/globe.obj', './assets/globe.mtl', function(err, objAndMtl) {
		if (err) {
			console.log(err);
			throw err;
		}
		
		console.log('Globe loaded');
		
		globe = new Model(objAndMtl, gl);
		globe.setup(globe.geom.data.rawVertices);
	});
}

function render() {
	
	var width = canvas.width;
	var height = canvas.height;

	gl.viewport(0, 0, width, height);
	clear(gl);

	mat4.perspective(proj, Math.PI / 4, width / height, 0.001, 1000);

	// update camera rotation angle
	camera.rotation = Date.now() * 0.0004;

	if (globe !== null) {

		// Compute matrices
		// See http://stackoverflow.com/a/21079741/38096
		var view = camera.view();
		var normalMatrix = mat4.create();
		var temp = mat4.create();
		mat4.invert(temp, view);
		mat4.transpose(normalMatrix, temp);

		// Set up shader
		globe.geom.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = view;
		shader.uniforms.normalMatrix = normalMatrix;

		globe.draw(shader);

		globe.geom.unbind();
	}	
}

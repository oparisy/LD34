/* jshint node: true */
/* jshint browser:true */
"use strict";

var ObjMtlLoader = require('obj-mtl-loader');
var PC2Loader = require('./lib/parse-pc2/index');
var request = require('xhr-request');
var arrayBufferToBuffer = require('arraybuffer-to-buffer');

var glContext   = require('gl-context');
var fit         = require('canvas-fit');
var fs          = require('fs');
var turntableCamera = require('turntable-camera');
var Geom    = require('gl-geometry');
var glClear   = require('gl-clear');
var glShader = require('gl-shader');
var glslify  = require('glslify');
var mat4    = require('gl-mat4');

var objAndMtl;
var objLoader = new ObjMtlLoader();
objLoader.load('./assets/palmtree_animated_joined.obj', './assets/palmtree_animated_joined.mtl', function(err, result) {
	if (err) {
		console.log(err);
		throw err;
	}
	
	objAndMtl = result;
	console.log('Model loaded');
});

var pc2;
var pc2Loader = new PC2Loader();
pc2Loader.on('readable', function() {
	var parsed = pc2Loader.read();
	if (parsed) {
		pc2 = parsed;
		console.log('Animation loaded');
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

// Testing purpose
var bunny   = require('bunny');

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

var shader = glShader(gl,
    glslify('./shaders/demo.vert'),
	glslify('./shaders/demo.frag'));

var proj = mat4.create();
var camera = turntableCamera();
camera.center[1] = 0;
camera.downwards = Math.PI * 0.25;

//var model = null
var model = Geom(gl)
	  .attr('position', bunny.positions)
	  .faces(bunny.cells);

var clear = glClear({ color: [0, 0, 0, 1], depth: true });

console.log('Setup done');

function render() {
	
	var width = canvas.width;
	var height = canvas.height;

	gl.viewport(0, 0, width, height);
	clear(gl);

	mat4.perspective(proj, Math.PI / 4, width / height, 0.001, 1000);

	// update camera rotation angle
	camera.rotation = Date.now() * 0.0004;

	if (model !== null) {
		model.bind(shader);
		shader.uniforms.proj = proj;
		shader.uniforms.view = camera.view();
		model.draw(gl.TRIANGLES);
	}	
}
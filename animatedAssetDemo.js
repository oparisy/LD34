/* jshint node: true */
"use strict";

var ObjMtlLoader = require('obj-mtl-loader');
var PC2Loader = require('./lib/parse-pc2/index');
var request = require('xhr-request');
var arrayBufferToBuffer = require('arraybuffer-to-buffer');

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

// binary-xhr is good, too
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

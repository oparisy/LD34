/* jshint node: true */
"use strict";

var Dissolve = require('dissolve');
var util = require('util');
var assert = require('chai').assert;

/* Implemented with the help of http://mattebb.com/projects/bpython/pointcache/export_pc2.py */
function PC2Parser(options) {
	Dissolve.call(this);
	
	// Read header(32 bytes)
	this.string('cacheSignatureString', 11).tap(checkEqual('cacheSignatureString', 'POINTCACHE2'));
	this.uint8('zero').tap(checkEqual('zero', 0));
	this.uint32le('fileVersion').tap(checkEqual('fileVersion', 1));
	this.uint32le('numPoints'); // Number of points per sample
	this.floatle('startFrame'); // First sampled frame
	this.floatle('sampleRate'); // How frequently to sample (or skip) the frames
	this.uint32le('numSamples'); // How many samples are stored in this file

	this.tap(function() {
	
		var frame = this.vars.startFrame;
		var step = this.vars.sampleRate;
		var guard = this.vars.startFrame + this.vars.numSamples;
		this.loop('frames', function(end) {
			if (frame >= guard) {
				return end(true);
			}

			var count = this.vars.numPoints;
			this.loop('points', function(innerEnd) {
				if (count-- <= 0) {
					return innerEnd(true);
				}

				this.floatle('x');
				this.floatle('y');
				this.floatle('z');
			});

			frame += step;
		});
	});

	// Emit result ("this" is a Transform stream)
	this.tap(function() {
		this.push(this.vars);
	});
}

util.inherits(PC2Parser, Dissolve);

function checkEqual(varName, expected) {
	return function() {
		assert.equal(this.vars[varName], expected);
	};
}

// Usage: var parser = new require('parse-pc2')();
module.exports = PC2Parser;
/* jshint node: true */
"use strict";

// Dump test .pc2 file content to the console
var fs = require('fs');
var traverse = require('traverse');
var inArray = require('in-array');
var Parser = require('./index');

var parser = new Parser();

parser.on('readable', function() {
	var parsed = parser.read();
	if (parsed) {
		var filtered = filter(parsed);
		console.log(JSON.stringify(filtered, null, 4));
	}
});

var buf = fs.readFileSync(__dirname + '/test/palmtree_rigged_ik.pc2');
parser.write(buf);

function filter(obj) {
	var toRemove = [
		'__proto__'
	];
	return traverse(obj).forEach(function(x) {
		if (inArray(toRemove, this.key)) {
			this.remove();
		}
	});
}
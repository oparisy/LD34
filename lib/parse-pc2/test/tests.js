var assert = require('chai').assert;
var fs = require('fs');
var util = require('util');

var Parser = require('../index');

describe('Definition', function(){
  it('should be properly defined', function() {
	var parser = new Parser();
	assert(util.isObject(parser));
  });
});

describe('Parsing', function() {
	// this.timeout(15000);

var filename = __dirname + '/palmtree_rigged_ik.pc2';

	var buf;
	beforeEach(function() {
		// Read test data
		buf = fs.readFileSync(filename);
	});

	it('should parse without error', function() {
		var parser = new Parser();
		parser.on('readable', function() {
			var parsed = parser.read();
		});
		parser.write(buf);
	});

	it('should return a meaningful object', function(done) {
		var parser = new Parser();
		parser.on('readable', function() {
			var parsed = parser.read();
			if (parsed) {
				// Basic sanity checks
				assert.isDefined(parsed);
				assert(util.isObject(parser));
				assert.equal(parsed.cacheSignatureString, 'POINTCACHE2');
				assert.equal(parsed.fileVersion, 1);

				assert.property(parsed, 'numPoints');
				assert.property(parsed, 'startFrame');
				assert.property(parsed, 'sampleRate');
				assert.property(parsed, 'numSamples');

				var storedFrames = parsed.numSamples / parsed.sampleRate;
				var fileSizeInBytes = fs.statSync(filename).size;
				assert.equal((32 + storedFrames * parsed.numPoints * 3 * 4), fileSizeInBytes);
 
 				assert.property(parsed, 'frames');
				assert.isArray(parsed.frames);
				assert.equal(parsed.frames.length, storedFrames);
				
				if (parsed.frames.length > 0) {
					assert.isArray(parsed.frames[0].points);
					assert.equal(parsed.frames[0].points.length, parsed.numPoints);
				}

				done();
			}
		});

		parser.write(buf);		
	});
});

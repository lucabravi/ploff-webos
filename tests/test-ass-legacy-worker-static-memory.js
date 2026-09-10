'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var root = path.join(__dirname, '..');
var workerPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.js');
var memoryPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.mem');
var fullWorkerSourcePath = path.join(root, 'scripts', 'vendor-sources', 'subtitles-octopus-worker-legacy-4.1.0.full.js.gz');
var source = fs.readFileSync(workerPath, 'utf8');
var fullSource = zlib.gunzipSync(fs.readFileSync(fullWorkerSourcePath)).toString('utf8');

function extractStaticMemory(value) {
  var pattern = /l\(e,(\d+),"([A-Za-z0-9+/=]+)"\)/g;
  var segments = [];
  var match;
  var minOffset = Infinity;
  var maxEnd = 0;
  var memory;

  while ((match = pattern.exec(value))) {
    var offset = Number(match[1]);
    var bytes = Buffer.from(match[2], 'base64');
    segments.push({ offset: offset, bytes: bytes });
    minOffset = Math.min(minOffset, offset);
    maxEnd = Math.max(maxEnd, offset + bytes.length);
  }

  assert.ok(segments.length > 2000, 'upstream legacy worker must contain the expected static memory segments');
  assert.strictEqual(minOffset, 1024, 'legacy static memory base offset changed unexpectedly');
  memory = Buffer.alloc(maxEnd - minOffset);
  segments.forEach(function (segment) {
    segment.bytes.copy(memory, segment.offset - minOffset);
  });
  return { baseOffset: minOffset, bytes: memory, segmentCount: segments.length };
}

var expected = extractStaticMemory(fullSource);
assert.ok(fs.existsSync(memoryPath), 'legacy worker static memory must be externalized into a .mem asset');
assert.deepStrictEqual(fs.readFileSync(memoryPath), expected.bytes,
  'external legacy .mem asset must be byte-identical to the upstream embedded Emscripten static memory');
assert.ok(source.length < 2450000,
  'legacy worker JavaScript must stay below 2.45 MB after externalizing static memory');
assert.notStrictEqual(source.indexOf('subtitles-octopus-worker-legacy.mem'), -1,
  'legacy worker must load its external static memory asset');
assert.strictEqual(/l\(e,\d+,"[A-Za-z0-9+/=]{32,}"\)/.test(source), false,
  'legacy worker must not retain large base64 static memory segments in JavaScript');

console.log('Legacy ASS worker static memory checks passed: ' + expected.segmentCount +
  ' segments -> ' + expected.bytes.length + ' binary bytes');

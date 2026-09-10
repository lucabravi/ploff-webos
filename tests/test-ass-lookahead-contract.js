'use strict';
var assert = require('assert');
var fs = require('fs');
var source = fs.readFileSync('app/vendor/subtitles-octopus-worker-legacy.js', 'utf8');
assert.ok(source.indexOf('PloffAssPreparedBoundaryIndices') !== -1,
  'static legacy worker must track prepared boundary states separately from committed playback');
assert.ok(source.indexOf('PloffAssScheduleLookahead') !== -1,
  'static legacy worker must schedule opportunistic lookahead work');
assert.ok(source.indexOf('prepared:ploffPreparedFrame') !== -1,
  'worker canvas packets must distinguish speculative prepared frames');
assert.ok(source.indexOf('renderGeneration:self.PloffAssRenderGeneration') !== -1,
  'worker frames must carry visual renderGeneration');
assert.ok(source.indexOf('if(!ploffPreparedFrame)') !== -1,
  'lookahead rendering must not advance committed boundary state');
assert.ok(source.indexOf('PloffAssLookaheadAttempted[targetIndex]=currentIndex') !== -1,
  'a dropped lookahead boundary must be retryable after playback advances without tight-loop retries');
console.log('ASS lookahead worker contract checks passed');
assert.ok(source.indexOf('PloffAssPreparedCostlyBoundaryIndices||[]).length>=5') !== -1,
  'worker lookahead must allow five memory-bearing prepared states before stopping');
assert.ok(source.indexOf('ploffFallbackIndex<5') !== -1,
  'legacy prepared-state fallback must apply the same five-frame costly quota');

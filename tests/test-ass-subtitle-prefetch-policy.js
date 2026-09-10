'use strict';

var assert = require('assert');
var path = require('path');
var Policy = require(path.join(__dirname, '..', 'app', 'ass-subtitle-prefetch-policy.js'));

assert.strictEqual(Policy.triggerSeconds(300, []), null, 'five-minute media must not prefetch by duration');
assert.strictEqual(Policy.triggerSeconds(360, []), 300, 'six-minute media must use the one-minute lead');
assert.strictEqual(Policy.triggerSeconds(361, []), 241, 'media just above six minutes must prefetch two minutes before the end');
assert.strictEqual(Policy.triggerSeconds(480, []), 360, 'eight-minute media must use the two-minute lead');
assert.strictEqual(Policy.triggerSeconds(481, []), 301, 'media just above eight minutes must use the three-minute lead');
assert.strictEqual(Policy.triggerSeconds(600, []), 420, 'ten-minute media must use the three-minute lead');
assert.strictEqual(Policy.triggerSeconds(601, []), 361, 'media just above ten minutes must use the four-minute lead');

var markers = [
  { type: 'intro', startTimeOffset: 10000, endTimeOffset: 30000 },
  { type: 'credits', startTimeOffset: 500000, endTimeOffset: 560000 },
  { type: 'credits', startTimeOffset: 700000, endTimeOffset: 740000 }
];
assert.strictEqual(Policy.triggerSeconds(900, markers), 470, 'credits must override the duration lead');
assert.strictEqual(Policy.triggerSeconds(900, [{ type: 'credits', startTimeOffset: 800000, endTimeOffset: 860000 }]), 770,
  'an existing credits marker must own the trigger even when it starts later');
assert.strictEqual(Policy.triggerSeconds(900, [{ type: 'credits', startTimeOffset: 10000, endTimeOffset: 20000 }]), 0,
  'credits trigger must clamp to the start of playback');
assert.strictEqual(Policy.due(470, 900, markers), true, 'prefetch must be due at the trigger time');
assert.strictEqual(Policy.due(469.9, 900, markers), false, 'prefetch must not be due before the trigger time');
assert.strictEqual(Policy.due(20, 300, []), false, 'short media without credits must never become due');

console.log('ASS subtitle prefetch policy checks passed');

'use strict';

var assert = require('assert');
var TimelinePolicy = require('../app/player-timeline-policy');

assert.strictEqual(TimelinePolicy.formatTime(0), '0:00', 'short time must render a zero position');
assert.strictEqual(TimelinePolicy.formatTime(65.6), '1:06', 'short time must preserve the existing rounded display');
assert.strictEqual(TimelinePolicy.formatTime(-5), '0:00', 'short time must clamp negative values');

assert.strictEqual(TimelinePolicy.formatLongTime(0), '00:00:00', 'long time must render a zero position');
assert.strictEqual(TimelinePolicy.formatLongTime(3661.9), '01:01:01', 'long time must preserve the existing floored display');

assert.strictEqual(TimelinePolicy.shouldReport({
  hasPlayback: true,
  suppressed: false,
  position: 19.999
}), false, 'positions before twenty seconds must not be reported');

assert.strictEqual(TimelinePolicy.shouldReport({
  hasPlayback: true,
  suppressed: false,
  position: 20
}), true, 'the twenty-second boundary must be reportable');

assert.strictEqual(TimelinePolicy.shouldReport({
  hasPlayback: true,
  suppressed: true,
  position: 30
}), false, 'suppressed sessions must not report progress');

assert.strictEqual(TimelinePolicy.shouldReport({
  hasPlayback: false,
  suppressed: false,
  position: 30
}), false, 'missing playback sessions must not report progress');

assert.strictEqual(TimelinePolicy.shouldReport({
  hasPlayback: true,
  suppressed: false,
  position: NaN
}), false, 'invalid absolute positions must not be reported');

console.log('Player timeline policy checks passed');

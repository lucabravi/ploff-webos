'use strict';

var assert = require('assert');
var SeekController = require('../app/player-seek-controller');

assert.deepStrictEqual(SeekController.decide({
  target: 135,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}), {
  operation: 'native',
  target: 135,
  nativeTime: 15
}, 'a buffered absolute target must seek inside the current relative stream');

assert.strictEqual(SeekController.decide({
  target: 100,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'rebuild', 'a target before the current stream offset must rebuild from that absolute time');

assert.strictEqual(SeekController.decide({
  target: 180,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'rebuild', 'an unbuffered target must rebuild instead of assigning an unsafe native time');

assert.deepStrictEqual(SeekController.decide({
  target: 180,
  duration: 1440,
  nativeDuration: 1440,
  offset: 0,
  directPlay: true,
  buffered: [{ start: 0, end: 30 }],
  seekable: [{ start: 0, end: 1440 }]
}), {
  operation: 'native',
  target: 180,
  nativeTime: 180
}, 'Direct Play must use the browser seekable range even when the target has not been buffered');

assert.strictEqual(SeekController.decide({
  target: 180,
  duration: 1440,
  nativeDuration: 1440,
  offset: 0,
  directPlay: true,
  buffered: [{ start: 0, end: 30 }],
  seekable: [{ start: 0, end: 120 }]
}).operation, 'rebuild', 'Direct Play must fall back when the browser does not expose the requested point as seekable');

assert.strictEqual(SeekController.decide({
  target: 150,
  duration: 1440,
  nativeDuration: 20,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'rebuild', 'a target beyond the current native stream duration must rebuild');

assert.strictEqual(SeekController.decide({
  target: 150.25,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'native', 'the existing quarter-second buffered tolerance must be preserved');

assert.deepStrictEqual(SeekController.decide({
  target: -10,
  duration: 1440,
  offset: 0,
  buffered: [{ start: 0, end: 30 }]
}), {
  operation: 'native',
  target: 0,
  nativeTime: 0
}, 'negative targets must clamp to the start of the media');

assert.deepStrictEqual(SeekController.decide({
  target: 2000,
  duration: 1440,
  offset: 1400,
  buffered: [{ start: 0, end: 40 }]
}), {
  operation: 'native',
  target: 1440,
  nativeTime: 40
}, 'targets beyond the duration must clamp to the end of the media');

assert.strictEqual(SeekController.decide({
  target: 135,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }],
  forceRebuild: true
}).operation, 'rebuild', 'forced stream reconstruction must override a buffered native seek');

assert.strictEqual(SeekController.repair({
  directPlay: true,
  nativeTime: 34,
  buffered: [{ start: 0, end: 40 }]
}), 'rebuild', 'Direct Play clock drift must leave the unstable full-file stream instead of repeatedly seeking it');

assert.strictEqual(SeekController.repair({
  directPlay: false,
  nativeTime: 14,
  buffered: [{ start: 0, end: 30 }]
}), 'rebuild', 'clock drift must rebuild once instead of repeatedly seeking the same unstable HLS stream');

assert.strictEqual(SeekController.reached(180, 179.4), true, 'a completed native seek may tolerate sub-second decoder rounding');
assert.strictEqual(SeekController.reached(180, 26.5), false, 'a seek event at the wrong native position must not be accepted as successful');

assert.strictEqual(SeekController.decide({
  target: NaN,
  duration: 1440,
  offset: 0,
  buffered: [{ start: 0, end: 30 }]
}), null, 'invalid targets must be rejected');

assert.strictEqual(SeekController.decide({
  target: 10,
  duration: 0,
  offset: 0,
  buffered: [{ start: 0, end: 30 }]
}), null, 'unknown or empty durations must be rejected');

console.log('Player seek controller checks passed');

'use strict';

var assert = require('assert');
var SetupScanIndicator = require('../app/setup-scan-indicator');
var messages = [];
var interval = null;
var indicator = SetupScanIndicator.create({
  root: { clearInterval: function (value) { if (value) { value.cleared = true; } }, setInterval: function (callback, delay) { interval = { callback: callback, delay: delay }; return interval; } },
  message: function (dots) { messages.push(dots); }
});

indicator.start();
assert.deepStrictEqual(messages, [1], 'server discovery must show an initial one-dot progress message');
assert.strictEqual(interval.delay, 500, 'server discovery progress must update every half second');
interval.callback();
interval.callback();
interval.callback();
assert.deepStrictEqual(messages, [1, 2, 3, 4], 'server discovery progress must cycle through four dots');
indicator.stop();
assert.strictEqual(interval.cleared, true, 'stopping discovery must clear the timer');
assert.strictEqual(indicator.dots(), 0, 'stopping discovery must reset the indicator');

console.log('Setup scan indicator checks passed');

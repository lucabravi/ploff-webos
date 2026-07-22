'use strict';

var assert = require('assert');
var PlayerBufferingIndicator = require('../app/player-buffering-indicator');

var timers = [];
var position = 10;
var eligible = true;
var shown = 0;
var hidden = 0;
var root = {
  clearTimeout: function (timer) { if (timer) { timer.cleared = true; } },
  setTimeout: function (callback, delay) {
    var timer = { callback: callback, delay: delay, cleared: false };
    timers.push(timer);
    return timer;
  }
};
var indicator = PlayerBufferingIndicator.create({
  root: root,
  isEligible: function () { return eligible; },
  position: function () { return position; },
  onShow: function () { shown += 1; },
  onHide: function () { hidden += 1; }
});

indicator.signal();
assert.strictEqual(timers[0].delay, 500, 'a transient buffering event must wait before showing the spinner');
position = 10.3;
timers[0].callback();
assert.strictEqual(shown, 0, 'continued playback during the grace period must suppress the spinner');

position = 20;
indicator.signal();
timers[1].callback();
assert.strictEqual(shown, 1, 'a stationary player must show the spinner after the grace period');
assert.strictEqual(timers[2].delay, 250, 'a visible spinner must start a lightweight recovery watchdog');
position = 20.3;
timers[2].callback();
assert.strictEqual(hidden, 0, 'one advancing sample must not hide the spinner prematurely');
position = 20.6;
timers[3].callback();
assert.strictEqual(hidden, 1, 'two advancing samples must hide a stale spinner');

position = 30;
indicator.signal();
timers[4].callback();
assert.strictEqual(shown, 2, 'the indicator must be reusable after recovery');
eligible = false;
timers[5].callback();
assert.strictEqual(hidden, 2, 'an ineligible player must clear a visible buffering indicator');

indicator.stop();
assert.strictEqual(indicator.isVisible(), false, 'stopping must leave no visible buffering indicator');
console.log('Player buffering indicator checks passed');

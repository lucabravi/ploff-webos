'use strict';
var assert = require('assert');
var Metrics = require('../app/startup-metrics');
var now = 100;
var metrics = Metrics.create({ now: function () { return now; } });
['player-load-start', 'player-code-ready', 'player-feature-ready'].forEach(function (name, index) {
  now += 5;
  metrics.mark(name);
  metrics.mark(name);
  assert.strictEqual(metrics.snapshot()[['playerLoadStart', 'playerCodeReady', 'playerFeatureReady'][index]], (index + 1) * 5);
});
assert.strictEqual(metrics.mark('https://secret/?token=private'), null);
assert.strictEqual(JSON.stringify(metrics.snapshot()).indexOf('secret'), -1);
console.log('Player startup milestone checks passed');

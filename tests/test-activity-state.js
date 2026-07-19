'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '../app/activity-state.js');

assert.ok(fs.existsSync(modulePath), 'activity state module must exist');
var ActivityState = require(modulePath);

var baseline = [{ id: 'existing' }];
var known = ActivityState.createWaiter('metadata-42', baseline, 1000);
assert.strictEqual(ActivityState.advanceWaiter(known, [{ id: 'existing' }, { id: 'metadata-42' }], 1500), false, 'a matching running activity must keep its waiter open');
assert.strictEqual(ActivityState.advanceWaiter(known, [{ id: 'existing' }], 2000), true, 'a matching activity must complete when its UUID disappears');

var inferred = ActivityState.createWaiter('', baseline, 1000);
assert.strictEqual(ActivityState.advanceWaiter(inferred, [{ id: 'existing' }, { id: 'new-scan' }], 1500), false, 'a refresh without an exposed header must follow activities added after its request');
assert.strictEqual(ActivityState.advanceWaiter(inferred, [{ id: 'existing' }], 2000), true, 'an inferred refresh must complete when its newly observed activities disappear');

var fallback = ActivityState.createWaiter('', baseline, 1000);
assert.strictEqual(ActivityState.advanceWaiter(fallback, baseline, 4499), false, 'an unobserved activity must retain a short discovery window');
assert.strictEqual(ActivityState.advanceWaiter(fallback, baseline, 4500), true, 'a fast unobserved activity must fall back after 3.5 seconds');

assert.strictEqual(
  ActivityState.fingerprint([{ id: '1', progress: 20 }, { id: '2', progress: -1 }]),
  ActivityState.fingerprint([{ id: '1', progress: 20 }, { id: '2', progress: -1 }]),
  'equivalent activity snapshots must not repaint the top bar'
);

console.log('Activity state checks passed');

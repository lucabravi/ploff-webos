'use strict';

var assert = require('assert');
var HomeState = require('../app/home-state');

var rows = [{
  title: 'Continue Watching',
  shape: 'poster',
  items: [
    { ratingKey: '10', title: 'Alpha', meta: 'Season 1', image: '/alpha', progress: 25 },
    { ratingKey: '20', title: 'Beta', meta: 'Movie', image: '/beta', viewed: true }
  ]
}, {
  title: 'Empty',
  shape: 'poster',
  items: []
}];

var normalized = HomeState.normalizeRows(rows);
assert.strictEqual(normalized.length, 1, 'empty Home rows must not enter render state');
assert.strictEqual(HomeState.mediaKey(normalized[0].items[0]), 'rating:10', 'Plex rating keys must provide stable card identity');
assert.strictEqual(HomeState.fingerprintRows(normalized), HomeState.fingerprintRows(HomeState.normalizeRows(rows)), 'equivalent Home data must have a stable fingerprint');

var changedRows = HomeState.normalizeRows(rows);
changedRows[0].items[0].progress = 30;
assert.notStrictEqual(HomeState.fingerprintRows(normalized), HomeState.fingerprintRows(changedRows), 'visible playback progress changes must invalidate Home data');

var selection = HomeState.selectionKey(normalized, { area: 'media', rowIndex: 0, column: 1 });
var reordered = [{ title: 'Continue Watching', shape: 'poster', items: [normalized[0].items[1], normalized[0].items[0]] }];
assert.deepStrictEqual(
  HomeState.restoreFocus(reordered, { area: 'media', navIndex: 0, rowIndex: 0, column: 1 }, selection),
  { area: 'media', navIndex: 0, rowIndex: 0, column: 0 },
  'Home refreshes must preserve focus by media identity when cards move'
);

var requests = [];
var results = [];
var coordinator = HomeState.createRefreshCoordinator(function (callback) {
  requests.push(callback);
}, function (error, nextRows, changed, initial) {
  results.push({ error: error, rows: nextRows, changed: changed, initial: initial });
});

coordinator.refresh();
coordinator.refresh();
assert.strictEqual(requests.length, 1, 'overlapping Home refreshes must share one active request');
requests[0](null, rows);
assert.strictEqual(requests.length, 2, 'a refresh requested during an active load must run once after it settles');
assert.strictEqual(results[0].changed, true, 'the first Home response must render');
assert.strictEqual(results[0].initial, true, 'the first Home response must be identified as initial data');
requests[1](null, rows);
assert.strictEqual(results[1].changed, false, 'identical background responses must not repaint Home');

coordinator.refresh();
requests[2](null, changedRows);
assert.strictEqual(results[2].changed, true, 'changed Home responses must be delivered for reconciliation');
assert.strictEqual(results[2].initial, false, 'later changed responses must remain background updates');

coordinator.refresh();
coordinator.reset();
requests[3](null, rows);
assert.strictEqual(results.length, 3, 'responses from a reset server or profile generation must be ignored');

function fakeClock() {
  var nextId = 1;
  var timers = [];
  return {
    setTimeout: function (callback, delay) {
      var timer = { id: nextId, callback: callback, delay: delay, active: true };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: function (id) {
      timers.forEach(function (timer) { if (timer.id === id) { timer.active = false; } });
    },
    activeTimers: function () { return timers.filter(function (timer) { return timer.active; }); },
    runNext: function () {
      var timer = this.activeTimers()[0];
      if (!timer) { return; }
      timer.active = false;
      timer.callback();
    }
  };
}

var clock = fakeClock();
var pollEligible = false;
var pollLoading = false;
var pollRefreshes = 0;
var poller = HomeState.createPoller(clock, {
  interval: 10000,
  canRefresh: function () { return pollEligible; },
  isLoading: function () { return pollLoading; },
  refresh: function () { pollRefreshes += 1; }
});

poller.schedule();
assert.strictEqual(clock.activeTimers().length, 0, 'Home polling must not arm while the Home is not eligible');
pollEligible = true;
poller.schedule();
assert.strictEqual(clock.activeTimers().length, 1, 'Home polling must use one timer while eligible');
assert.strictEqual(clock.activeTimers()[0].delay, 10000, 'Home polling must use the configured ten-second interval');
poller.schedule();
assert.strictEqual(clock.activeTimers().length, 1, 'rescheduling Home polling must replace the previous timer');
clock.runNext();
assert.strictEqual(pollRefreshes, 1, 'an eligible Home poll must trigger one refresh');
poller.schedule();
pollLoading = true;
clock.runNext();
assert.strictEqual(pollRefreshes, 1, 'Home polling must not overlap an active refresh');
assert.strictEqual(clock.activeTimers().length, 1, 'a busy Home poll must retry on the next interval');
pollLoading = false;
pollEligible = false;
clock.runNext();
assert.strictEqual(clock.activeTimers().length, 0, 'Home polling must stop when the view becomes ineligible');
pollEligible = true;
poller.schedule();
poller.stop();
assert.strictEqual(clock.activeTimers().length, 0, 'stopping Home polling must cancel its pending timer');

console.log('Home state checks passed');

'use strict';

var assert = require('assert');
var PlexClient = require('../app/plex-client');

function emptyDocument() {
  return {
    documentElement: { childNodes: [] },
    getElementsByTagName: function () { return []; }
  };
}

var previousXhr = global.XMLHttpRequest;
var previousDomParser = global.DOMParser;
var previousSetTimeout = global.setTimeout;
var previousClearTimeout = global.clearTimeout;
var xhrs = [];
var timers = {};
var nextTimer = 1;
var callbacks = 0;
var lateRowCompletion;

global.DOMParser = function () {
  this.parseFromString = function () { return emptyDocument(); };
};
global.XMLHttpRequest = function () {
  xhrs.push(this);
  this.open = function () {};
  this.send = function () {};
  this.abort = function () { this.aborted = true; };
};
global.setTimeout = function (callback) {
  var id = nextTimer;
  nextTimer += 1;
  timers[id] = callback;
  return id;
};
global.clearTimeout = function (id) { delete timers[id]; };

var request = PlexClient.loadHome({ apiBaseUrl: '/plex-api', token: '' }, function () { callbacks += 1; });
assert.ok(request && typeof request.abort === 'function', 'Home loading must expose a composite abort handle');
assert.strictEqual(xhrs.length, 1, 'Home loading starts with the sections request');

xhrs[0].status = 200;
xhrs[0].readyState = 4;
xhrs[0].responseText = '<sections/>';
xhrs[0].onreadystatechange();
assert.strictEqual(xhrs.length, 2, 'the base Home row request starts after sections are available');
assert.strictEqual(Object.keys(timers).length, 1, 'Home loading arms one recommendation deadline');
lateRowCompletion = xhrs[1].onreadystatechange;

request.abort();
assert.strictEqual(xhrs[1].aborted, true, 'aborting Home must abort nested row requests');
assert.strictEqual(Object.keys(timers).length, 0, 'aborting Home must clear the recommendation deadline');

xhrs[1].status = 200;
xhrs[1].readyState = 4;
xhrs[1].responseText = '<rows/>';
lateRowCompletion();
assert.strictEqual(callbacks, 0, 'aborted Home work must not publish a late result');

global.XMLHttpRequest = previousXhr;
global.DOMParser = previousDomParser;
global.setTimeout = previousSetTimeout;
global.clearTimeout = previousClearTimeout;

console.log('Plex Home lifecycle checks passed');

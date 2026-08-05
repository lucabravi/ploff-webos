'use strict';

var assert = require('assert');
var PlexHttp = require('../app/plex-http');

var requests = [];
var root = {
  XMLHttpRequest: function () {
    requests.push(this);
    this.headers = {};
    this.open = function (method, url) { this.method = method; this.url = url; };
    this.setRequestHeader = function (name, value) { this.headers[name] = value; };
    this.send = function (body) { this.body = body; };
    this.abort = function () { this.aborted = true; };
  }
};

var success;
PlexHttp.request(root, {
  method: 'POST', url: 'https://plex.example/test', timeout: 2500,
  headers: { Accept: 'application/json', 'X-Plex-Token': 'token' }, body: 'payload',
  statusError: function (status) { return new Error('status ' + status); },
  networkError: 'network', timeoutError: 'timeout'
}, function (error, text, xhr) {
  assert.ifError(error);
  success = { text: text, xhr: xhr };
});
assert.strictEqual(requests[0].method, 'POST');
assert.strictEqual(requests[0].url, 'https://plex.example/test');
assert.strictEqual(requests[0].timeout, 2500);
assert.deepStrictEqual(requests[0].headers, { Accept: 'application/json', 'X-Plex-Token': 'token' });
assert.strictEqual(requests[0].body, 'payload');
requests[0].status = 200;
requests[0].responseText = 'ok';
requests[0].readyState = 4;
requests[0].onreadystatechange();
assert.strictEqual(success.text, 'ok');
assert.strictEqual(success.xhr, requests[0]);
assert.strictEqual(requests[0].onreadystatechange, null, 'completed requests must release their ready-state callback');
assert.strictEqual(requests[0].onerror, null, 'completed requests must release their network callback');
assert.strictEqual(requests[0].ontimeout, null, 'completed requests must release their timeout callback');

var statusError;
PlexHttp.request(root, { url: '/status', statusError: function (status) { return new Error('status ' + status); } }, function (error) { statusError = error; });
requests[1].status = 503;
requests[1].readyState = 4;
requests[1].onreadystatechange();
assert.strictEqual(statusError.message, 'status 503');

var networkError;
PlexHttp.request(root, { url: '/network', networkError: 'network failure' }, function (error) { networkError = error; });
requests[2].onerror();
assert.strictEqual(networkError.message, 'network failure');

var timeoutError;
PlexHttp.request(root, { url: '/timeout', timeoutError: 'timeout failure' }, function (error) { timeoutError = error; });
requests[3].ontimeout();
assert.strictEqual(timeoutError.message, 'timeout failure');

var cancelledCallbacks = 0;
var cancelled = PlexHttp.request(root, { url: '/cancel' }, function () { cancelledCallbacks += 1; });
requests[4].abort = function () {
  this.aborted = true;
  this.status = 0;
  this.readyState = 4;
  this.onreadystatechange();
};
cancelled.abort();
assert.strictEqual(requests[4].aborted, true);
assert.strictEqual(cancelledCallbacks, 0);
assert.strictEqual(requests[4].onreadystatechange, null, 'aborted requests must release their ready-state callback');
assert.strictEqual(requests[4].onerror, null, 'aborted requests must release their network callback');
assert.strictEqual(requests[4].ontimeout, null, 'aborted requests must release their timeout callback');

var deferred;
var syncCallbacks = 0;
var failingRoot = {
  setTimeout: function (callback) { deferred = callback; return 1; },
  XMLHttpRequest: function () {
    this.open = function () { throw new Error('invalid endpoint'); };
    this.abort = function () {};
  }
};
PlexHttp.request(failingRoot, { url: '/broken' }, function (error) {
  assert.strictEqual(error.message, 'invalid endpoint');
  syncCallbacks += 1;
});
assert.strictEqual(syncCallbacks, 0);
deferred();
assert.strictEqual(syncCallbacks, 1);

console.log('Plex HTTP checks passed');

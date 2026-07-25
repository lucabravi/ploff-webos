'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '../app/network-policy.js');

assert.ok(fs.existsSync(modulePath), 'network policy module must exist');
var NetworkPolicy = require(modulePath);

function normalizeUri(value) {
  return String(value || '').replace(/\/+$/, '');
}

function isPrivateCandidate(uri) {
  return /^http:\/\/192\.168\.1\.20:32400$/i.test(uri);
}

var browserOffline = { status: 'unknown', internetAvailable: false };
var routes = [
  { uri: 'http://192.168.1.20:32400/', local: true, relay: false },
  { uri: 'https://plex.example', local: false, relay: false },
  { uri: 'https://relay.plex.tv', local: false, relay: true }
];

assert.strictEqual(NetworkPolicy.allowsFailover(browserOffline, routes, 'http://192.168.1.20:32400', normalizeUri, isPrivateCandidate), true, 'browser-offline unknown state must retain a metadata-marked LAN route');
assert.strictEqual(NetworkPolicy.allowsFailover(browserOffline, routes, 'https://plex.example', normalizeUri, isPrivateCandidate), false, 'browser-offline unknown state must block a metadata-marked remote route');
assert.strictEqual(NetworkPolicy.allowsFailover(browserOffline, routes, 'https://relay.plex.tv', normalizeUri, isPrivateCandidate), false, 'browser-offline unknown state must block a metadata-marked Relay route');
assert.strictEqual(NetworkPolicy.allowsFailover(browserOffline, [{ uri: 'http://192.168.1.20:32400', local: false, relay: false }], 'http://192.168.1.20:32400', normalizeUri, isPrivateCandidate), false, 'route metadata must override a local-URI heuristic when it marks the route remote');
assert.strictEqual(NetworkPolicy.allowsFailover(browserOffline, [], 'http://192.168.1.20:32400', normalizeUri, isPrivateCandidate), true, 'URI discovery must remain the LAN fallback when route metadata is absent');
assert.strictEqual(NetworkPolicy.allowsFailover({ status: 'unknown', internetAvailable: null }, routes, 'https://plex.example', normalizeUri, isPrivateCandidate), true, 'unknown Internet availability must preserve the existing failover candidates');

var scheduled;
var probes = 0;
var cloudAllowed = true;
var timerRoot = {
  setTimeout: function (callback) {
    scheduled = callback;
    return 1;
  }
};

NetworkPolicy.deferCloudWork(timerRoot, function () { return cloudAllowed; }, function () { probes += 1; });
cloudAllowed = false;
scheduled();
assert.strictEqual(probes, 0, 'Internet loss after remote verification is scheduled must prevent the probe');

cloudAllowed = true;
NetworkPolicy.deferCloudWork(timerRoot, function () { return cloudAllowed; }, function () { probes += 1; });
scheduled();
assert.strictEqual(probes, 1, 'scheduled remote verification must still run while cloud access remains available');

var retryStarted = false;
var retryProbes = 0;
function scheduleRetryableProbe() {
  if (retryStarted) { return; }
  retryStarted = true;
  NetworkPolicy.deferCloudWork(timerRoot, function () { return cloudAllowed; }, function () {
    retryProbes += 1;
  }, function () {
    retryStarted = false;
  });
}

cloudAllowed = true;
scheduleRetryableProbe();
cloudAllowed = false;
scheduled();
assert.strictEqual(retryProbes, 0, 'scheduled remote verification must skip its probe after Internet loss');
assert.strictEqual(retryStarted, false, 'an Internet-loss skip must clear the in-session verification sentinel for retry');
cloudAllowed = true;
scheduleRetryableProbe();
scheduleRetryableProbe();
scheduled();
assert.strictEqual(retryProbes, 1, 'cloud recovery must retry the skipped remote verification exactly once');
scheduleRetryableProbe();
assert.strictEqual(retryProbes, 1, 'a completed remote verification must not create a duplicate probe in the same session');

console.log('Network policy checks passed');

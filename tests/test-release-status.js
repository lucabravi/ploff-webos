'use strict';

var assert = require('assert');
var ReleaseStatus = require('../app/release-status');

function storage(initial) {
  var values = initial || {};
  return {
    getItem: function (key) { return values[key] || null; },
    setItem: function (key, value) { values[key] = value; },
    values: values
  };
}

function requestHarness() {
  var requests = [];
  return {
    create: function () {
      var request = {
        readyState: 0, status: 0, responseText: '', aborted: false,
        open: function (_method, url) { request.url = url; },
        setRequestHeader: function () {},
        send: function () { requests.push(request); },
        abort: function () { request.aborted = true; }
      };
      return request;
    },
    requests: requests,
    respond: function (index, status, payload) {
      var request = requests[index];
      request.status = status;
      request.responseText = JSON.stringify(payload || {});
      request.readyState = 4;
      request.onreadystatechange();
    }
  };
}

assert.strictEqual(ReleaseStatus.compareVersions('1.0.6', '1.0.5'), 1);
assert.strictEqual(ReleaseStatus.compareVersions('v1.0.5', '1.0.5'), 0);
assert.strictEqual(ReleaseStatus.compareVersions('1.0.4', '1.0.5'), -1);

var semverPrecedence = [
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-alpha.beta',
  '1.0.0-beta',
  '1.0.0-beta.2',
  '1.0.0-beta.11',
  '1.0.0-rc.1',
  '1.0.0'
];
semverPrecedence.forEach(function (version, index) {
  if (index + 1 >= semverPrecedence.length) { return; }
  assert.strictEqual(ReleaseStatus.compareVersions(version, semverPrecedence[index + 1]), -1, version + ' must sort before ' + semverPrecedence[index + 1]);
  assert.strictEqual(ReleaseStatus.compareVersions(semverPrecedence[index + 1], version), 1, semverPrecedence[index + 1] + ' must sort after ' + version);
});
assert.strictEqual(ReleaseStatus.compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0, 'build metadata must not affect precedence');
assert.strictEqual(ReleaseStatus.compareVersions('v2.3.4-rc.10+tv', '2.3.4-rc.2'), 1, 'numeric prerelease identifiers must compare numerically');
assert.strictEqual(ReleaseStatus.compareVersions('2.3.4-1', '2.3.4-alpha'), -1, 'numeric prerelease identifiers must sort before non-numeric identifiers');
assert.strictEqual(ReleaseStatus.compareVersions('2.3.4-alpha', '2.3.4-alpha.1'), -1, 'a shorter matching prerelease sequence must sort first');
assert.strictEqual(ReleaseStatus.compareVersions('development', '1.0.5'), -1, 'malformed versions must retain the legacy numeric fallback');
assert.strictEqual(ReleaseStatus.compareVersions('1.0', '1.0.0'), 0, 'partial versions must retain the legacy numeric fallback');


(function interruptedCheckDoesNotRemainChecking() {
  var store = storage();
  store.setItem(ReleaseStatus.CACHE_KEY, JSON.stringify({ status: 'checking', attemptedAt: 1234 }));
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return 1235; } });
  assert.strictEqual(manager.snapshot().status, 'unknown');
}());

(function cachedStatusMatchesInstalledVersion() {
  var store = storage();
  store.setItem(ReleaseStatus.CACHE_KEY, JSON.stringify({ status: 'available', latestVersion: '1.0.6', checkedAt: 10, attemptedAt: 10 }));
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.6' });
  assert.strictEqual(manager.snapshot().status, 'current', 'an installed update must clear the stale cached available state before the lazy check');

  store = storage();
  store.setItem(ReleaseStatus.CACHE_KEY, JSON.stringify({ status: 'current', latestVersion: '1.0.7', checkedAt: 10, attemptedAt: 10 }));
  manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.6' });
  assert.strictEqual(manager.snapshot().status, 'available', 'cached release metadata must be re-evaluated against the current installed build');
}());

(function cachedCheckIsLazy() {
  var now = 1000000;
  var store = storage();
  store.setItem(ReleaseStatus.CACHE_KEY, JSON.stringify({ status: 'current', latestVersion: '1.0.5', checkedAt: now - 10, attemptedAt: now - 10 }));
  var harness = requestHarness();
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return now; }, request: harness.create });
  assert.strictEqual(manager.check(false), false);
  assert.strictEqual(harness.requests.length, 0);
}());

(function dueCheckFindsRelease() {
  var now = 200000000;
  var store = storage();
  var harness = requestHarness();
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return now; }, request: harness.create });
  assert.strictEqual(manager.check(false), true);
  assert.strictEqual(manager.snapshot().status, 'checking');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(manager.snapshot(), 'attemptedAt'), false, 'attempt timing must remain private persistence state');
  harness.respond(0, 200, { tag_name: 'v1.0.6', html_url: 'https://example.test/release' });
  assert.strictEqual(manager.snapshot().status, 'available');
  assert.strictEqual(manager.snapshot().latestVersion, '1.0.6');
  assert.strictEqual(manager.snapshot().checkedAt, now);
}());

(function offlineAttemptIsThrottled() {
  var now = 300000000;
  var store = storage();
  var manager = ReleaseStatus.create({ root: { navigator: { onLine: false } }, storage: store, installedVersion: '1.0.5', now: function () { return now; } });
  assert.strictEqual(manager.check(false), false);
  assert.strictEqual(manager.snapshot().status, 'offline');
  assert.strictEqual(manager.check(false), false);
}());

(function staleRequestCannotOverwriteManualCheck() {
  var now = 400000000;
  var store = storage();
  var harness = requestHarness();
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return now; }, request: harness.create });
  manager.check(false);
  manager.check(true);
  assert.strictEqual(harness.requests[0].aborted, true);
  harness.respond(0, 200, { tag_name: '9.0.0' });
  assert.strictEqual(manager.snapshot().status, 'checking');
  harness.respond(1, 200, { tag_name: '1.0.5' });
  assert.strictEqual(manager.snapshot().status, 'current');
}());

(function cacheIsBoundedMetadata() {
  var now = 500000000;
  var store = storage();
  var harness = requestHarness();
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return now; }, request: harness.create });
  manager.check(false);
  harness.respond(0, 200, { tag_name: '1.0.6', html_url: 'https://example.test/release', body: new Array(1000).join('x') });
  var cached = JSON.parse(store.getItem(ReleaseStatus.CACHE_KEY));
  assert.deepStrictEqual(Object.keys(cached).sort(), ['attemptedAt', 'checkedAt', 'latestVersion', 'releaseUrl', 'status']);
  assert.strictEqual(JSON.stringify(cached).indexOf('body'), -1);
}());

(function synchronousTransportFailuresAreContained() {
  var manager = ReleaseStatus.create({
    storage: storage(), installedVersion: '1.0.5', now: function () { return 600000000; },
    request: function () { throw new Error('factory unavailable'); }
  });
  assert.strictEqual(manager.check(false), false, 'a synchronous request factory failure must not escape startup');
  assert.strictEqual(manager.snapshot().status, 'error');

  manager = ReleaseStatus.create({
    storage: storage(), installedVersion: '1.0.5', now: function () { return 600000001; },
    request: function () {
      return {
        open: function () { throw new Error('blocked transport'); },
        abort: function () {}
      };
    }
  });
  assert.strictEqual(manager.check(false), true, 'a created request still counts as an attempted update check');
  assert.strictEqual(manager.snapshot().status, 'error', 'a synchronous XHR open failure must become a non-blocking update error');
}());

(function backwardClockDoesNotSuppressChecksForever() {
  var store = storage();
  var harness = requestHarness();
  store.setItem(ReleaseStatus.CACHE_KEY, JSON.stringify({ status: 'current', attemptedAt: 800000000 }));
  var manager = ReleaseStatus.create({ storage: store, installedVersion: '1.0.5', now: function () { return 700000000; }, request: harness.create });
  assert.strictEqual(manager.check(false), true, 'a corrected device clock must allow a fresh update check');
}());

console.log('Release status checks passed');

'use strict';

var assert = require('assert');
var Vault = require('../app/credential-vault');

function storage(initial) {
  var values = initial || {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    values: values
  };
}

var browserStorage = storage();
Vault.prepare({}, browserStorage, function (result, mode) {
  assert.strictEqual(result, browserStorage, 'browser development keeps the normal storage adapter');
  assert.strictEqual(mode, 'browser', 'browser development must be identifiable');
});

var legacy = '{"ownerToken":"legacy-secret"}';
var local = storage({ 'ploff.auth.v1': legacy });
var records = [];
var requests = [];
var webos = {
  webOS: {
    service: {
      request: function (uri, options) {
        requests.push({ uri: uri, method: options.method, parameters: options.parameters });
        if (options.method === 'putKind') { options.onSuccess({ returnValue: true }); }
        else if (options.method === 'find') { options.onSuccess({ returnValue: true, results: records.slice() }); }
        else if (options.method === 'del') { records = []; options.onSuccess({ returnValue: true }); }
        else if (options.method === 'put') { records = options.parameters.objects.slice(); options.onSuccess({ returnValue: true }); }
        return {};
      }
    }
  }
};

Vault.prepare(webos, local, function (secure, mode) {
  assert.strictEqual(mode, 'db8-private', 'webOS must use the private DB8 backend');
  assert.strictEqual(secure.getItem(Vault.AUTH_KEY), legacy, 'legacy credentials must remain available during migration');
  assert.strictEqual(local.getItem(Vault.AUTH_KEY), null, 'plaintext credentials must be removed from localStorage');
  assert.strictEqual(records[0].payload, legacy, 'legacy credentials must migrate into private DB8');
  secure.setItem(Vault.AUTH_KEY, '{"ownerToken":"new-secret"}');
  assert.strictEqual(records[0].payload, '{"ownerToken":"new-secret"}', 'credential updates must replace the private DB8 record');
  secure.removeItem(Vault.AUTH_KEY);
  assert.strictEqual(records.length, 0, 'disconnect must remove private credential data');
});

assert.ok(requests.some(function (request) {
  return request.method === 'putKind' && request.parameters.private === true;
}), 'the credential kind must be registered as private');

var blockedStorage = {
  getItem: function () { throw new Error('blocked'); },
  setItem: function () { throw new Error('blocked'); },
  removeItem: function () { throw new Error('blocked'); }
};
Vault.prepare(webos, blockedStorage, function (secure) {
  assert.strictEqual(secure.getItem('ploff.settings.v1'), null, 'private storage fallback reads must fail closed');
  assert.doesNotThrow(function () {
    secure.setItem('ploff.settings.v1', '{}');
    secure.removeItem('ploff.settings.v1');
  }, 'private storage fallback writes must not escape when localStorage is unavailable');
});

var timeoutCallbacks = [];
var timeoutCleared = false;
var timeoutMode = '';
var stalledWebos = {
  setTimeout: function (callback, delay) {
    timeoutCallbacks.push({ callback: callback, delay: delay });
    return timeoutCallbacks.length - 1;
  },
  clearTimeout: function () { timeoutCleared = true; },
  webOS: { service: { request: function () { return {}; } } }
};
Vault.prepare(stalledWebos, storage({ 'ploff.auth.v1': legacy }), function (_secure, mode) { timeoutMode = mode; });
assert.strictEqual(timeoutCallbacks[0].delay, Vault.PREPARE_TIMEOUT, 'credential preparation must use its bounded startup timeout');
assert.strictEqual(timeoutCallbacks[1].delay, Vault.CALL_TIMEOUT, 'silent DB8 calls must also have a bounded operation timeout');
assert.strictEqual(timeoutMode, '', 'a pending DB8 request must get a chance to complete before fallback');
timeoutCallbacks[0].callback();
assert.strictEqual(timeoutMode, 'session', 'a silent DB8 service must not block application startup forever');
assert.strictEqual(timeoutCleared, true, 'the fallback timer must be cleared when credential preparation settles');
var timeoutIdle = false;
Vault.whenIdle(function () { timeoutIdle = true; });
assert.strictEqual(timeoutIdle, true, 'timed-out credential preparation must release the global write state');

var failingWebos = {
  webOS: {
    service: {
      request: function (_uri, options) {
        if (options.method === 'putKind') { options.onSuccess({ returnValue: true }); }
        else { options.onFailure({ errorText: 'DB8 unavailable' }); }
        return {};
      }
    }
  }
};
var fallbackIdle = false;
Vault.prepare(failingWebos, storage(), function (secure, mode) {
  assert.strictEqual(mode, 'session', 'a DB8 read failure must fall back to session-only credential storage');
  secure.setItem(Vault.AUTH_KEY, '{"ownerToken":"session"}');
  secure.removeItem(Vault.AUTH_KEY);
  Vault.whenIdle(function () { fallbackIdle = true; });
});
assert.strictEqual(fallbackIdle, true, 'session-only credential writes must not leave an impossible persistent write pending');

var writeTimers = [];
var writeCancelCount = 0;
var writeStorage = null;
var writeWebos = {
  setTimeout: function (callback, delay) {
    writeTimers.push({ callback: callback, delay: delay, active: true });
    return writeTimers.length - 1;
  },
  clearTimeout: function (id) { if (writeTimers[id]) { writeTimers[id].active = false; } },
  webOS: {
    service: {
      request: function (_uri, options) {
        if (options.method === 'putKind') { options.onSuccess({ returnValue: true }); }
        else if (options.method === 'find') { options.onSuccess({ returnValue: true, results: [] }); }
        return { cancel: function () { writeCancelCount += 1; } };
      }
    }
  }
};
Vault.prepare(writeWebos, storage(), function (secure, mode) {
  assert.strictEqual(mode, 'db8-private', 'successful DB8 preparation must retain persistent credential mode');
  writeStorage = secure;
});
writeStorage.setItem(Vault.AUTH_KEY, '{"ownerToken":"silent-write"}');
var writeIdle = false;
Vault.whenIdle(function () { writeIdle = true; });
assert.strictEqual(writeIdle, false, 'a pending DB8 credential write must delay destructive reloads');
var activeWriteTimers = writeTimers.filter(function (entry) { return entry.active && entry.delay === Vault.CALL_TIMEOUT; });
assert.strictEqual(activeWriteTimers.length, 1, 'a silent DB8 put must have a bounded operation timeout');
assert.strictEqual(writeTimers.length > 0, true, 'credential writes must register a native operation timeout');
assert.strictEqual(writeIdle, false, 'the active DB8 put must keep idle waiters blocked');
activeWriteTimers[0].active = false;
activeWriteTimers[0].callback();
assert.strictEqual(writeIdle, true, 'silent DB8 writes must eventually release credential idle waiters');
assert.strictEqual(writeCancelCount, 1, 'a timed-out DB8 put should cancel its native request handle');


function db8Harness(initialRecords, behavior) {
  var records = (initialRecords || []).slice();
  var methods = [];
  var options = behavior || {};
  var nextId = 1;
  var nextRev = 1;

  records.forEach(function (record) {
    var revision = Number(record && record._rev);
    if (isFinite(revision) && revision >= nextRev) { nextRev = revision + 1; }
  });

  function clone(record) {
    var result = {};
    Object.keys(record || {}).forEach(function (key) { result[key] = record[key]; });
    return result;
  }

  function removeIds(ids) {
    records = records.filter(function (record) { return ids.indexOf(record._id) < 0; });
  }

  return {
    root: {
      webOS: {
        service: {
          request: function (_uri, request) {
            var method = request.method;
            var parameters = request.parameters || {};
            var object;
            var match;
            var revision;
            methods.push({ method: method, parameters: parameters });
            if (method === 'putKind') {
              request.onSuccess({ returnValue: true });
            } else if (method === 'find') {
              request.onSuccess({ returnValue: true, results: records.map(clone) });
            } else if (method === 'merge') {
              object = parameters.objects && parameters.objects[0];
              match = object && records.filter(function (record) { return record._id === object._id; })[0];
              if (!match || options.failMerge) {
                request.onFailure({ errorText: 'merge failed' });
              } else {
                Object.keys(object).forEach(function (key) {
                  if (key !== '_id') { match[key] = object[key]; }
                });
                revision = nextRev;
                nextRev += 1;
                match._rev = revision;
                request.onSuccess({ returnValue: true, results: [{ id: match._id, rev: revision }] });
              }
            } else if (method === 'del') {
              if (options.failDelete) {
                request.onFailure({ errorText: 'delete failed' });
              } else {
                if (parameters.ids) { removeIds(parameters.ids); }
                else { records = []; }
                request.onSuccess({ returnValue: true, count: 1 });
              }
            } else if (method === 'put') {
              if (options.failPut) {
                request.onFailure({ errorText: 'put failed' });
              } else {
                object = clone(parameters.objects[0]);
                if (!object._id) { object._id = 'generated-' + nextId; nextId += 1; }
                revision = nextRev;
                nextRev += 1;
                object._rev = revision;
                records.push(object);
                request.onSuccess({ returnValue: true, results: [{ id: object._id, rev: revision }] });
              }
            }
            return {};
          }
        }
      }
    },
    methods: methods,
    records: function () { return records.map(clone); }
  };
}

var duplicateDb = db8Harness([
  { _id: 'old-primary', _rev: 10, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"old"}' },
  { _id: 'new-primary', _rev: 12, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"new"}' },
  { _id: 'empty-primary', _rev: 13, _kind: Vault.KIND, slot: 'primary', payload: '' }
]);
Vault.prepare(duplicateDb.root, storage(), function (secure, mode) {
  assert.strictEqual(mode, 'db8-private', 'duplicate DB8 records must keep private credential mode');
  assert.strictEqual(secure.getItem(Vault.AUTH_KEY), '{"ownerToken":"new"}', 'duplicate DB8 reads must choose the newest valid payload by revision');
});
var duplicateIdle = false;
Vault.whenIdle(function () { duplicateIdle = true; });
assert.strictEqual(duplicateIdle, true, 'duplicate cleanup must participate in the credential write queue');
assert.deepStrictEqual(duplicateDb.records().map(function (record) { return record._id; }), ['new-primary'], 'duplicate and invalid primary records must be cleaned without deleting the selected record');

var stableDb = db8Harness([
  { _id: 'stable-primary', _rev: 20, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"before"}' }
]);
Vault.prepare(stableDb.root, storage(), function (secure) {
  secure.setItem(Vault.AUTH_KEY, '{"ownerToken":"after"}');
});
var stableIdle = false;
Vault.whenIdle(function () { stableIdle = true; });
assert.strictEqual(stableIdle, true, 'stable-id credential updates must release idle waiters');
assert.ok(stableDb.methods.some(function (entry) { return entry.method === 'merge'; }), 'known DB8 record ids must be updated in place');
assert.strictEqual(stableDb.methods.filter(function (entry) { return entry.method === 'put'; }).length, 0, 'known DB8 record ids must not create replacement rows');
assert.strictEqual(stableDb.records()[0].payload, '{"ownerToken":"after"}', 'in-place credential updates must persist the new payload');

var ambiguousDb = db8Harness([
  { _rev: 30, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"before"}' },
  { _id: 'stale-empty', _rev: 29, _kind: Vault.KIND, slot: 'primary', payload: '' }
], { failDelete: true });
Vault.prepare(ambiguousDb.root, storage(), function (secure) {
  secure.setItem(Vault.AUTH_KEY, '{"ownerToken":"after"}');
});
var ambiguousIdle = false;
Vault.whenIdle(function () { ambiguousIdle = true; });
assert.strictEqual(ambiguousIdle, true, 'fallback puts must settle even when duplicate cleanup deletes fail');
assert.ok(ambiguousDb.methods.some(function (entry) { return entry.method === 'put'; }), 'missing stable identity must fall back to a put');
assert.ok(ambiguousDb.methods.some(function (entry) { return entry.method === 'del'; }), 'duplicate cleanup must still be attempted after a successful put');
var recoveredPayload = '';
Vault.prepare(ambiguousDb.root, storage(), function (secure) { recoveredPayload = secure.getItem(Vault.AUTH_KEY); });
assert.strictEqual(recoveredPayload, '{"ownerToken":"after"}', 'a successful put must remain authoritative even when duplicate deletion fails');

var failedPutDb = db8Harness([], { failPut: true });
var failedPutStorage = null;
Vault.prepare(failedPutDb.root, storage(), function (secure) {
  failedPutStorage = secure;
  secure.setItem(Vault.AUTH_KEY, '{"ownerToken":"volatile"}');
});
var failedPutIdle = false;
Vault.whenIdle(function () { failedPutIdle = true; });
assert.strictEqual(failedPutIdle, true, 'failed DB8 puts must release idle waiters');
assert.strictEqual(failedPutStorage.getItem(Vault.AUTH_KEY), '{"ownerToken":"volatile"}', 'failed DB8 puts must preserve the in-session credential value');
assert.strictEqual(failedPutDb.records().length, 0, 'failed DB8 puts must not invent persistent record identity');

var removeDb = db8Harness([
  { _id: 'remove-old', _rev: 40, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"old"}' },
  { _id: 'remove-new', _rev: 41, _kind: Vault.KIND, slot: 'primary', payload: '{"ownerToken":"new"}' }
]);
var removeStorage = null;
Vault.prepare(removeDb.root, storage(), function (secure) {
  removeStorage = secure;
  secure.removeItem(Vault.AUTH_KEY);
});
var removeIdle = false;
Vault.whenIdle(function () { removeIdle = true; });
assert.strictEqual(removeIdle, true, 'credential removal must wait for persistent deletion');
assert.strictEqual(removeStorage.getItem(Vault.AUTH_KEY), null, 'credential removal must clear the in-session payload immediately');
assert.strictEqual(removeDb.records().length, 0, 'credential removal must delete every primary record, including duplicates');
assert.strictEqual(removeDb.methods.filter(function (entry) { return entry.method === 'put'; }).length, 0, 'credential removal must never recreate an empty credential row');

console.log('Credential vault checks passed');

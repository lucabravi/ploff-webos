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
assert.strictEqual(activeWriteTimers.length, 1, 'a silent DB8 delete must have a bounded operation timeout');
activeWriteTimers[0].active = false;
activeWriteTimers[0].callback();
activeWriteTimers = writeTimers.filter(function (entry) { return entry.active && entry.delay === Vault.CALL_TIMEOUT; });
assert.strictEqual(activeWriteTimers.length, 1, 'the subsequent silent DB8 put must receive its own bounded timeout');
activeWriteTimers[0].active = false;
activeWriteTimers[0].callback();
assert.strictEqual(writeIdle, true, 'silent DB8 writes must eventually release credential idle waiters');
assert.strictEqual(writeCancelCount, 2, 'timed-out DB8 operations should cancel their native request handles');

console.log('Credential vault checks passed');

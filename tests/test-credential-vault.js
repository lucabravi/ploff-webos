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

console.log('Credential vault checks passed');

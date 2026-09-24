'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var PreviewDevAuth = require('../scripts/preview-dev-auth');

function cookieDocument() {
  var values = {};
  var document = {};
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: function () {
      return Object.keys(values).map(function (name) {
        return name + '=' + values[name];
      }).join('; ');
    },
    set: function (assignment) {
      var parts = String(assignment || '').split(';');
      var separator = parts[0].indexOf('=');
      var name;
      var value;
      if (separator < 0) { return; }
      name = parts[0].slice(0, separator);
      value = parts[0].slice(separator + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(String(assignment || ''))) {
        delete values[name];
      } else {
        values[name] = value;
      }
    }
  });
  return document;
}

function blockedStorage() {
  return {
    getItem: function () { throw new Error('storage blocked'); },
    setItem: function () { throw new Error('storage blocked'); },
    removeItem: function () { throw new Error('storage blocked'); }
  };
}

function vaultSpy() {
  return {
    prepare: function (root, storage, callback) {
      callback(storage, 'browser');
    }
  };
}

function rootAwareVaultSpy() {
  return {
    prepare: function (root, storage, callback) {
      callback(storage, root && root.webOS ? 'native' : 'browser');
    }
  };
}

var documentRef = cookieDocument();
var firstVault = vaultSpy();
var firstRoot = { document: documentRef, PloffCredentialVault: firstVault };
var firstStorage = null;
var secondVault;
var secondStorage = null;
var nativeStorage = { marker: true };
var nativeVault;
var nativeReceived = null;

assert.strictEqual(PreviewDevAuth.install(firstRoot), true, 'preview auth must install in a browser root');
firstVault.prepare(firstRoot, blockedStorage(), function (storage) { firstStorage = storage; });
assert.ok(firstStorage, 'preview auth must provide a credential storage adapter');
firstStorage.setItem('ploff.auth.v1', '{"ownerToken":"persisted"}');

secondVault = vaultSpy();
assert.strictEqual(PreviewDevAuth.install({ document: documentRef, PloffCredentialVault: secondVault }), true, 'preview auth must install after a reload');
secondVault.prepare({ document: documentRef }, blockedStorage(), function (storage) { secondStorage = storage; });
assert.strictEqual(secondStorage.getItem('ploff.auth.v1'), '{"ownerToken":"persisted"}', 'preview auth must survive a browser reload');
secondStorage.removeItem('ploff.auth.v1');
assert.strictEqual(secondStorage.getItem('ploff.auth.v1'), null, 'preview auth removal must clear the cookie');

var shimVault = rootAwareVaultSpy();
var shimStorage = null;
var shimMode = null;
var shimRoot = {
  document: documentRef,
  webOS: { service: { request: function () {} } },
  PloffCredentialVault: shimVault
};
assert.strictEqual(PreviewDevAuth.install(shimRoot), true, 'preview auth must stay active with the browser webOS service shim');
shimVault.prepare(shimRoot, blockedStorage(), function (storage, mode) {
  shimStorage = storage;
  shimMode = mode;
});
assert.strictEqual(shimMode, 'browser', 'the preview adapter must keep the browser vault path when only the webOS shim exists');
shimStorage.setItem('ploff.auth.v1', '{"ownerToken":"shim-persisted"}');
assert.strictEqual(shimStorage.getItem('ploff.auth.v1'), '{"ownerToken":"shim-persisted"}', 'the browser webOS shim path must persist credentials in the cookie');

nativeVault = vaultSpy();
assert.strictEqual(PreviewDevAuth.install({
  document: documentRef,
  webOS: { service: { request: function () {} } },
  PalmServiceBridge: function () {},
  PloffCredentialVault: nativeVault
}), false, 'preview auth must stay disabled when webOS DB8 is available');
nativeVault.prepare({ webOS: { service: { request: function () {} } }, PalmServiceBridge: function () {} }, nativeStorage, function (storage) {
  nativeReceived = storage;
});
assert.strictEqual(nativeReceived, nativeStorage, 'TV credential storage must remain untouched');

assert.ok(/preview-dev-auth\.js/.test(fs.readFileSync(path.join(__dirname, '../scripts/preview-local.sh'), 'utf8')),
  'the local preview must load the development-only auth helper');
assert.strictEqual(fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8').indexOf('preview-dev-auth.js'), -1,
  'the development-only auth helper must not be imported by the shipped HTML');

console.log('Preview development auth checks passed');

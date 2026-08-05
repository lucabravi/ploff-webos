'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Bootstrap = require('../app/coordinator/application-bootstrap');

function eventTarget() {
  return {
    listeners: {},
    addEventListener: function (name, handler) { this.listeners[name] = handler; },
    removeEventListener: function (name, handler) {
      if (this.listeners[name] === handler) { delete this.listeners[name]; }
    }
  };
}

(function waitsForCredentialsAndTearsDownInReverseOrder() {
  var root = eventTarget();
  var document = {};
  var prepared = null;
  var calls = [];
  var application = { destroy: function () { calls.push('application:destroy'); } };
  root.localStorage = { name: 'storage' };
  root.PloffApplicationEvents = {
    bind: function (entries) {
      calls.push('events:bind:' + entries[0].name);
      return { destroy: function () { calls.push('events:destroy'); } };
    }
  };
  root.PloffCredentialVault = {
    prepare: function (receivedRoot, storage, callback) {
      calls.push('credentials:prepare');
      assert.strictEqual(receivedRoot, root);
      assert.strictEqual(storage, root.localStorage);
      prepared = callback;
    }
  };

  var handle = Bootstrap.start(root, document, {
    createApplication: function (receivedRoot, receivedDocument, credentialStorage) {
      calls.push('application:create');
      assert.strictEqual(receivedRoot, root);
      assert.strictEqual(receivedDocument, document);
      assert.deepStrictEqual(credentialStorage, { secure: true });
      return application;
    },
    onReady: function (created) {
      calls.push('application:ready');
      assert.strictEqual(created, application);
    }
  });

  assert.strictEqual(handle.instance(), null, 'product logic must not start before credential storage is ready');
  assert.deepStrictEqual(calls, ['events:bind:unload', 'credentials:prepare']);
  prepared({ secure: true });
  assert.strictEqual(handle.instance(), application);
  assert.deepStrictEqual(calls, [
    'events:bind:unload', 'credentials:prepare', 'application:create', 'application:ready'
  ]);
  handle.destroy();
  handle.destroy();
  assert.deepStrictEqual(calls.slice(-2), ['application:destroy', 'events:destroy'], 'teardown must reverse bootstrap creation order');
}());

(function destroyBeforeCredentialCompletionPreventsLateStartup() {
  var root = eventTarget();
  var prepared;
  var creates = 0;
  root.localStorage = {};
  root.PloffApplicationEvents = { bind: function () { return { destroy: function () {} }; } };
  root.PloffCredentialVault = { prepare: function (_root, _storage, callback) { prepared = callback; } };
  var handle = Bootstrap.start(root, {}, { createApplication: function () { creates += 1; return {}; } });
  handle.destroy();
  prepared({});
  assert.strictEqual(creates, 0, 'a late credential callback must not resurrect a destroyed application');
}());

(function duplicateCredentialCompletionStartsOnlyOneApplication() {
  var root = eventTarget();
  var prepared;
  var creates = 0;
  root.localStorage = {};
  root.PloffApplicationEvents = { bind: function () { return { destroy: function () {} }; } };
  root.PloffCredentialVault = { prepare: function (_root, _storage, callback) { prepared = callback; } };
  var handle = Bootstrap.start(root, {}, { createApplication: function () { creates += 1; return { destroy: function () {} }; } });
  prepared({ secure: true });
  prepared({ secure: true });
  assert.strictEqual(creates, 1, 'duplicate credential readiness callbacks must not create a second application');
  handle.destroy();
}());


(function applicationConstructionFailureUsesErrorBoundary() {
  var root = eventTarget();
  var prepared;
  var errors = [];
  root.localStorage = {};
  root.PloffApplicationEvents = { bind: function () { return { destroy: function () {} }; } };
  root.PloffCredentialVault = { prepare: function (_root, _storage, callback) { prepared = callback; } };
  var handle = Bootstrap.start(root, {}, {
    createApplication: function () { throw new Error('composition failed'); },
    onError: function (error) { errors.push(error.message); }
  });
  prepared({ secure: true });
  assert.deepStrictEqual(errors, ['composition failed'], 'composition failures must report through the bootstrap error boundary');
  assert.strictEqual(handle.instance(), null, 'failed composition must not publish a partial application');
  handle.destroy();
}());

(function missingDependenciesFailWithoutStartingProductLogic() {
  var errors = [];
  var creates = 0;
  var handle = Bootstrap.start({}, {}, {
    createApplication: function () { creates += 1; },
    onError: function (error) { errors.push(error.message); }
  });
  assert.strictEqual(creates, 0);
  assert.strictEqual(errors.length, 1);
  handle.destroy();
}());

(function finalArchitectureBoundary() {
  var project = path.join(__dirname, '..');
  var bootstrapSource = fs.readFileSync(path.join(project, 'app/coordinator/application-bootstrap.js'), 'utf8');
  var controllerSource = fs.readFileSync(path.join(project, 'app/coordinator/application-controller.js'), 'utf8');
  assert.ok(bootstrapSource.split('\n').length < 100, 'the generated-entry bootstrap must remain minimal');
  assert.ok(/PloffCredentialVault\.prepare/.test(bootstrapSource), 'bootstrap must own the credential readiness gate');
  assert.ok(!/PlexClient|MediaLabels|PlayerSeekController|PlaybackQueueModel|SearchModel|LibraryContainers/.test(bootstrapSource), 'bootstrap must not contain product algorithms or media-domain logic');
  assert.ok(/ApplicationSession\.create/.test(controllerSource), 'the application controller must create one shared application session');
  assert.ok(/constructOwner\(function \(\) \{[\s\S]*ApplicationEvents\.bind/.test(controllerSource), 'application DOM events must be registered in the composition ownership stack');
  assert.ok(!/\.addEventListener\(/.test(controllerSource), 'application wiring must not bypass ApplicationEvents');
  assert.strictEqual(fs.existsSync(path.join(project, 'app/source')), false, 'legacy lexical fragments must be removed');
  assert.strictEqual(fs.existsSync(path.join(project, 'app/.modular-coordinator')), true, 'the final modular baseline marker must be active');
}());

console.log('Application bootstrap checks passed');

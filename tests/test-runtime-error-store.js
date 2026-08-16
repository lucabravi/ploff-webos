'use strict';

var assert = require('assert');
var RuntimeErrorStore = require('../app/runtime-error-store');

var handlers = {};
var added = [];
var removed = [];
var root = {
  addEventListener: function (name, handler) {
    handlers[name] = handler;
    added.push(name);
  },
  removeEventListener: function (name, handler) {
    removed.push(name + ':' + (handlers[name] === handler));
  }
};

var store = RuntimeErrorStore.create({
  root: root,
  DiagnosticsState: {
    sanitizeText: function (value) {
      return String(value || '').replace(/https?:\/\/[^\s]+/g, '[url]').replace(/token=[^\s&]+/g, 'token=[redacted]');
    }
  }
});

assert.ok(added.indexOf('error') >= 0, 'the store must listen for uncaught JavaScript errors');
assert.ok(added.indexOf('unhandledrejection') >= 0, 'the store must listen for unhandled promise rejections when available');

handlers.error({
  type: 'error',
  message: 'UI failed token=secret',
  filename: 'https://192.168.0.7:32400/app.js?X-Plex-Token=secret',
  lineno: 12,
  colno: 4,
  error: { stack: 'Error: UI failed\n at https://192.168.0.7:32400/app.js:12:4' }
});
handlers.unhandledrejection({ reason: { message: 'Promise failed', stack: 'Error: Promise failed' } });

var snapshot = store.snapshot();
assert.strictEqual(snapshot.length, 2, 'the store must expose captured runtime errors');
assert.strictEqual(snapshot[0].line, 12, 'error line must be retained');
assert.strictEqual(snapshot[0].column, 4, 'error column must be retained');
assert.ok(snapshot[0].message.indexOf('token=secret') === -1, 'error messages must be sanitized');
assert.ok(snapshot[0].source.indexOf('192.168.0.7') === -1, 'error sources must not expose IP addresses');
assert.ok(snapshot[0].stack.indexOf('192.168.0.7') === -1, 'error stacks must not expose IP addresses');
assert.strictEqual(snapshot[1].type, 'unhandledrejection', 'rejections must be labeled separately');

var index;
for (index = 0; index < 20; index += 1) {
  store.record({ type: 'error', message: 'error ' + index });
}
assert.strictEqual(store.snapshot().length, 12, 'the error history must remain bounded');
assert.strictEqual(store.snapshot()[0].message, 'error 8', 'the error history must retain the newest entries');

store.destroy();
assert.ok(removed.indexOf('error:true') >= 0, 'destroy must remove the error listener');
assert.ok(removed.indexOf('unhandledrejection:true') >= 0, 'destroy must remove the rejection listener');
store.record({ type: 'error', message: 'late error' });
assert.strictEqual(store.snapshot().length, 0, 'destroyed stores must clear and ignore late errors');

console.log('Runtime error store checks passed');

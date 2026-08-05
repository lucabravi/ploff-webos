'use strict';

var assert = require('assert');
var ApplicationEvents = require('../app/application-events');
var calls = [];
var target = {
  addEventListener: function (name, handler, options) { calls.push(['add', name, handler, options]); },
  removeEventListener: function (name, handler, options) { calls.push(['remove', name, handler, options]); }
};
var binding = ApplicationEvents.bind([
  { target: target, name: 'keydown', handler: function () {}, options: false },
  { target: target, name: 'wheel', handler: function () {}, options: { passive: false } }
]);

assert.strictEqual(calls.length, 2, 'binds every declared event once');
assert.strictEqual(calls[1][3].passive, false, 'preserves legacy wheel listener options');
binding.destroy();
assert.strictEqual(calls.length, 4, 'removes every bound event during teardown');
assert.strictEqual(calls[2][0], 'remove', 'teardown removes listeners rather than adding duplicates');

(function partialBindingFailureRollsBackPriorListeners() {
  var events = [];
  var first = {
    addEventListener: function (name) { events.push('add:first:' + name); },
    removeEventListener: function (name) { events.push('remove:first:' + name); throw new Error('cleanup failed'); }
  };
  var second = {
    addEventListener: function (name) { events.push('add:second:' + name); throw new Error('bind failed'); },
    removeEventListener: function (name) { events.push('remove:second:' + name); }
  };

  assert.throws(function () {
    ApplicationEvents.bind([
      { target: first, name: 'keydown', handler: function () {} },
      { target: second, name: 'click', handler: function () {} }
    ]);
  }, /bind failed/, 'the original listener binding error must survive rollback cleanup failures');
  assert.deepStrictEqual(events, [
    'add:first:keydown',
    'add:second:click',
    'remove:first:keydown'
  ], 'a partial bind must remove every listener that was successfully registered before the failure');
}());

(function teardownContinuesAfterOneRemovalFailure() {
  var removals = [];
  function removable(name, fail) {
    return {
      addEventListener: function () {},
      removeEventListener: function () {
        removals.push(name);
        if (fail) { throw new Error('remove failed: ' + name); }
      }
    };
  }
  var owned = ApplicationEvents.bind([
    { target: removable('first', false), name: 'one', handler: function () {} },
    { target: removable('second', true), name: 'two', handler: function () {} },
    { target: removable('third', false), name: 'three', handler: function () {} }
  ]);

  assert.doesNotThrow(function () { owned.destroy(); }, 'event teardown must not stop when one listener removal throws');
  assert.deepStrictEqual(removals, ['third', 'second', 'first'], 'event teardown must continue in reverse binding order');
  owned.destroy();
  assert.strictEqual(removals.length, 3, 'event teardown must remain idempotent after a removal failure');
}());

console.log('Application event binding checks passed');

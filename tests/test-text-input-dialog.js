'use strict';

var assert = require('assert');
var Dialog = require('../app/text-input-dialog');

function element(id) {
  return {
    id: id, className: '', value: '', textContent: '', attributes: {},
    setAttribute: function (key, value) { this.attributes[key] = value; },
    focus: function () { this.focused = true; }
  };
}

var nodes = {};
[
  'text-input-dialog', 'text-input-dialog-title', 'text-input-dialog-hint',
  'text-input-dialog-field', 'text-input-dialog-cancel', 'text-input-dialog-apply'
].forEach(function (id) { nodes[id] = element(id); });
var root = {
  setTimeout: function (callback) { root.pending = callback; return 1; },
  clearTimeout: function () { root.pending = null; }
};
var applied = '';
var dialog = Dialog.create({
  root: root,
  document: { getElementById: function (id) { return nodes[id] || null; } },
  t9Enabled: function () { return true; }
});

dialog.open({ value: '', maximum: 20, apply: function (value) { applied = value; } });
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, 'b', 'T9 must preview the active multi-tap character');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(dialog.snapshot().focus, 2, 'down from the editor must reach Apply');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(applied, 'b', 'applying must flush the pending T9 character');

dialog.open({ value: 'TV', apply: function (value) { applied = value; } });
dialog.handleKey({ keyCode: 8, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, 'T', 'backspace must edit committed text');
nodes['text-input-dialog-field'].value = 'Bedroom';
nodes['text-input-dialog-field'].oninput();
dialog.focus(2);
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(applied, 'Bedroom', 'native keyboard input must share the same canonical value');

console.log('Text input dialog tests passed');

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Dialog = require('../app/text-input-dialog');

function element(id) {
var value = {
    id: id, className: '', value: '', textContent: '', attributes: {}, style: {}, children: [], focusCount: 0,
    setAttribute: function (key, next) { this.attributes[key] = String(next); },
    getAttribute: function (key) { return this.attributes[key]; },
    appendChild: function (child) { this.children.push(child); child.parentNode = this; return child; },
    focus: function () { this.focused = true; this.focusCount += 1; }
  };
  Object.defineProperty(value, 'innerHTML', {
    configurable: true,
    get: function () { return ''; },
    set: function () { this.children = []; this.textContent = ''; }
  });
  return value;
}

var nodes = {};
[
  'text-input-dialog', 'text-input-dialog-title', 'text-input-dialog-hint',
  'text-input-dialog-field', 'text-input-dialog-t9-legend', 'text-input-dialog-keyboard',
  'text-input-dialog-cancel', 'text-input-dialog-apply'
].forEach(function (id) { nodes[id] = element(id); });
var root = {
  setTimeout: function (callback) { root.pending = callback; return 1; },
  clearTimeout: function () { root.pending = null; }
};
var applied = '';
var t9Preference = true;
var dialog = Dialog.create({
  root: root,
  document: {
    getElementById: function (id) { return nodes[id] || null; },
    createElement: function (tagName) { var item = element(''); item.tagName = String(tagName || '').toUpperCase(); return item; },
    createTextNode: function (text) { var item = element(''); item.textContent = String(text || ''); return item; }
  },
  t: function (key) { return key; },
  t9Enabled: function () { return t9Preference; }
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

var nativeFocusCount = nodes['text-input-dialog-field'].focusCount;
t9Preference = false;
dialog.open({
  value: '', maximum: 20, keyboard: 'ploff', nativeKeyboard: false, t9: true,
  apply: function (value) { applied = value; }
});
assert.strictEqual(nodes['text-input-dialog-field'].focusCount, nativeFocusCount, 'Ploff keyboard mode must not focus the native input or summon the LG keyboard');
assert.strictEqual(nodes['text-input-dialog-field'].readOnly, true, 'Ploff keyboard mode must keep the text field display-only');
assert.strictEqual(nodes['text-input-dialog-t9-legend'].className.indexOf('is-hidden'), -1, 'Ploff keyboard must show the T9 layout beside the keyboard');
assert.strictEqual(nodes['text-input-dialog-t9-legend'].children.length, 4, 'Ploff T9 layout must show four numeric rows');
assert.strictEqual(nodes['text-input-dialog-keyboard'].className.indexOf('is-hidden'), -1, 'Ploff keyboard mode must reveal the in-app keyboard');
assert.strictEqual(nodes['text-input-dialog-keyboard'].children.length, 5, 'Ploff keyboard mode must render the same five keyboard rows used by Search');
assert.notStrictEqual(nodes['text-input-dialog-keyboard'].children[0].children[0].className.indexOf('is-focused'), -1, 'Ploff keyboard mode must start with a visible remote focus');
assert.strictEqual(nodes['text-input-dialog-keyboard'].children[3].children[0].getAttribute('data-text-input-key'), 'shift', 'Ploff keyboard must expose a dedicated shift key on the letter row');
assert.strictEqual(nodes['text-input-dialog-keyboard'].children[3].children[0].children[0].textContent, 'textInput.shift', 'Ploff shift must be labelled independently from the Search symbols control');
assert.strictEqual(nodes['text-input-dialog-keyboard'].children[4].children[2].getAttribute('data-text-input-key'), 'symbols', 'Ploff keyboard must keep a separate symbols key');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(dialog.snapshot().uppercase, true, 'Ploff shift must enable uppercase without entering symbol mode');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, 'Z', 'Ploff shift must append an uppercase letter');
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, 'ZB', 'Ploff shift must uppercase the remote T9 preview');
var pendingT9 = root.pending;
pendingT9();
assert.strictEqual(nodes['text-input-dialog-field'].value, 'ZB', 'Ploff shift must uppercase the committed remote T9 character');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(dialog.snapshot().symbolMode, true, 'Ploff symbols must remain available beside uppercase');
assert.strictEqual(nodes['text-input-dialog-keyboard'].children[2].children[0].getAttribute('data-text-input-key'), 'shift', 'Ploff symbol mode must expose a return-to-letters control');
dialog.open({
  value: '', maximum: 20, keyboard: 'ploff', nativeKeyboard: false, t9: true,
  apply: function (value) { applied = value; }
});
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, '2', 'OK on an in-app keyboard key must edit the alias without native input');
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
dialog.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
assert.strictEqual(nodes['text-input-dialog-field'].value, '2b', 'remote numeric keys must keep using T9 while the in-app keyboard is active');
dialog.focus(1);
dialog.handleKey({ keyCode: 38, preventDefault: function () {} }, 'up');
assert.strictEqual(dialog.snapshot().keyboardRow, 4, 'Up from dialog actions must return to the final keyboard row');
assert.strictEqual(dialog.snapshot().keyboardColumn, 0, 'Up from Cancel must return to the left action on the final keyboard row');
dialog.focus(2);
dialog.handleKey({ keyCode: 38, preventDefault: function () {} }, 'up');
assert.strictEqual(dialog.snapshot().keyboardColumn, 1, 'Up from Apply must return to the right action on the final keyboard row');
dialog.close(false);
assert.notStrictEqual(nodes['text-input-dialog-t9-legend'].className.indexOf('is-hidden'), -1, 'closing the dialog must hide the T9 layout');
dialog.open({ value: 'Native', maximum: 20 });
assert.strictEqual(nodes['text-input-dialog-field'].readOnly, false, 'ordinary text dialogs must retain the native LG keyboard path');
assert.notStrictEqual(nodes['text-input-dialog-keyboard'].className.indexOf('is-hidden'), -1, 'ordinary text dialogs must keep the Ploff keyboard hidden');
assert.notStrictEqual(nodes['text-input-dialog-t9-legend'].className.indexOf('is-hidden'), -1, 'ordinary text dialogs must keep the T9 layout hidden');

var shellHtml = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
assert.ok(shellHtml.indexOf('t9-input.js?v=dev') < shellHtml.indexOf('text-input-dialog.js?v=dev'), 'T9 must load before the text input dialog captures its browser dependency');
assert.ok(shellHtml.indexOf('id="text-input-dialog-keyboard"') !== -1, 'the shell must provide the in-app keyboard host for text dialogs');

console.log('Text input dialog tests passed');

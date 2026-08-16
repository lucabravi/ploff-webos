'use strict';

var assert = require('assert');
var SafeAreaDialog = require('../app/safe-area-dialog');

function node(id) {
  return {
    id: id,
    className: '',
    textContent: '',
    attributes: {},
    focusCount: 0,
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    getAttribute: function (name) { return this.attributes[name] || ''; },
    removeAttribute: function (name) { delete this.attributes[name]; },
    focus: function () { this.focusCount += 1; }
  };
}

var ids = [
  'safe-area-dialog', 'safe-area-dialog-title', 'safe-area-dialog-hint',
  'safe-area-edge-top', 'safe-area-edge-right', 'safe-area-edge-bottom', 'safe-area-edge-left',
  'safe-area-edge-top-label', 'safe-area-edge-right-label', 'safe-area-edge-bottom-label', 'safe-area-edge-left-label',
  'safe-area-edge-top-value', 'safe-area-edge-right-value', 'safe-area-edge-bottom-value', 'safe-area-edge-left-value',
  'safe-area-reset', 'safe-area-cancel', 'safe-area-apply'
];
var nodes = {};
var focusCalls = 0;
ids.forEach(function (id) { nodes[id] = node(id); });
var focusNodes = [nodes['safe-area-edge-top'], nodes['safe-area-edge-right'], nodes['safe-area-edge-bottom'], nodes['safe-area-edge-left'], nodes['safe-area-reset'], nodes['safe-area-cancel'], nodes['safe-area-apply']];
focusNodes.forEach(function (item, index) { item.setAttribute('data-safe-area-index', index); });

var document = {
  getElementById: function (id) { return nodes[id] || null; },
  querySelectorAll: function (selector) {
    return selector === '[data-safe-area-index]' ? focusNodes : [];
  }
};
var changes = [];
var applied = null;
var cancelled = 0;
var dialog = SafeAreaDialog.create({
  document: document,
  insets: [0, 1, 2, 3, 4, 5],
  t: function (key) { return key; },
  pointerActive: function () { return false; },
  clearFocus: function () {
    focusCalls += 1;
    focusNodes.forEach(function (item) {
      item.className = String(item.className || '').replace(/\s?is-focused/g, '');
    });
  }
});

dialog.open({ safeAreaTop: 0, safeAreaRight: 1, safeAreaBottom: 2, safeAreaLeft: 3 }, {
  change: function (value) { changes.push(value); },
  apply: function (value) { applied = value; },
  cancel: function () { cancelled += 1; }
});

assert.strictEqual(dialog.snapshot().open, true, 'safe-area calibration must open as an owned modal');
assert.strictEqual(dialog.snapshot().focus, 0, 'calibration must start on the first edge control');
assert.strictEqual(nodes['safe-area-dialog'].attributes['aria-hidden'], 'false', 'open calibration must be exposed to assistive technology');
assert.strictEqual(nodes['safe-area-edge-top-value'].textContent, '0%', 'each edge value must be rendered next to its delimiter');
assert.ok(nodes['safe-area-edge-top'].className.indexOf('is-focused') !== -1, 'the first edge must receive visible focus');

dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().focus, 1, 'Right from Top must move spatially to the right edge');
assert.strictEqual(dialog.snapshot().values.safeAreaTop, 0, 'edge values must not change while navigating');
dialog.handleKey({ keyCode: 38, preventDefault: function () {} }, 'up');
assert.strictEqual(dialog.snapshot().focus, 0, 'Up from Right must return to Top');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
assert.strictEqual(dialog.snapshot().editing, true, 'OK must enter value-editing mode');
assert.ok(nodes['safe-area-edge-top'].className.indexOf('is-editing') !== -1, 'editing mode must be visibly distinct');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().values.safeAreaTop, 1, 'Right must expand the selected edge while editing');
assert.strictEqual(changes.length, 1, 'draft changes must be reported without persisting them');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
assert.strictEqual(dialog.snapshot().editing, false, 'a second OK must confirm the edge value and resume navigation');

dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(dialog.snapshot().focus, 2, 'Down from Top must move spatially to Bottom');
dialog.handleKey({ keyCode: 37, preventDefault: function () {} }, 'left');
assert.strictEqual(dialog.snapshot().focus, 3, 'Left from Bottom must move to the left edge');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().focus, 1, 'Right from Left must cross to the right edge');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(dialog.snapshot().focus, 2, 'Down from Right must move to Bottom');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(dialog.snapshot().focus, 4, 'down must reach the reset action after the four edge controls');
dialog.handleKey({ keyCode: 38, preventDefault: function () {} }, 'up');
assert.strictEqual(dialog.snapshot().focus, 2, 'Up from the action row must return to Bottom');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
assert.deepStrictEqual(dialog.snapshot().values, { safeAreaTop: 0, safeAreaRight: 0, safeAreaBottom: 0, safeAreaLeft: 0 }, 'reset must update the draft without saving it');

dialog.focusAction(6);
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
assert.strictEqual(applied.safeAreaTop, 0, 'apply must return the current draft to the owner');
assert.strictEqual(dialog.snapshot().open, false, 'apply must close the modal');

dialog.open({ safeAreaTop: 4, safeAreaRight: 0, safeAreaBottom: 0, safeAreaLeft: 0 }, {
  change: function () {}, apply: function () {}, cancel: function () { cancelled += 1; }
});
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
dialog.handleKey({ keyCode: 461, preventDefault: function () {} }, 'back');
assert.strictEqual(dialog.snapshot().open, true, 'Back while editing must return to edge navigation without closing the modal');
assert.strictEqual(dialog.snapshot().editing, false, 'Back must leave value-editing mode');
dialog.handleKey({ keyCode: 461, preventDefault: function () {} }, 'back');
assert.strictEqual(cancelled, 1, 'Back must cancel the uncommitted calibration');
assert.strictEqual(dialog.snapshot().open, false, 'Back must close the calibration modal');
assert.ok(focusCalls > 0, 'the dialog must clear the previous application focus before taking ownership');

console.log('Safe-area dialog checks passed');

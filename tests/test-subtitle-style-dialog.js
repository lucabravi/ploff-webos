'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var SubtitleStyleDialog = require('../app/subtitle-style-dialog');

function node(id) {
  return {
    id: id, className: '', textContent: '', attributes: {}, style: {}, focusCount: 0,
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    removeAttribute: function (name) { delete this.attributes[name]; },
    focus: function () { this.focusCount += 1; }
  };
}

var ids = ['subtitle-style-dialog', 'subtitle-style-dialog-title', 'subtitle-style-dialog-preview',
  'subtitle-style-dialog-preview-text', 'subtitle-style-background', 'subtitle-style-background-label', 'subtitle-style-background-value',
  'subtitle-style-position', 'subtitle-style-position-label', 'subtitle-style-position-value',
  'subtitle-style-edge', 'subtitle-style-edge-label', 'subtitle-style-edge-value',
  'subtitle-style-size', 'subtitle-style-size-label', 'subtitle-style-size-value',
  'subtitle-style-reset', 'subtitle-style-cancel', 'subtitle-style-apply'];
var nodes = {};
var focusNodes;
ids.forEach(function (id) { nodes[id] = node(id); });
focusNodes = [nodes['subtitle-style-background'], nodes['subtitle-style-position'], nodes['subtitle-style-edge'],
  nodes['subtitle-style-size'], nodes['subtitle-style-reset'], nodes['subtitle-style-cancel'], nodes['subtitle-style-apply']];
focusNodes.forEach(function (item, index) { item.setAttribute('data-subtitle-style-index', index); });

var documentRef = {
  getElementById: function (id) { return nodes[id] || null; },
  querySelectorAll: function (selector) { return selector === '[data-subtitle-style-index]' ? focusNodes : []; }
};
var applied = null;
var cancelled = 0;
var dialog = SubtitleStyleDialog.create({
  document: documentRef,
  t: function (key) { return key; },
  backgrounds: ['off', 'low', 'opaque'], positions: [5, 7, 10], edges: ['shadow', 'outline', 'both', 'double-outline-shadow'], sizes: [75, 100, 125, 150],
  clearFocus: function () {
    focusNodes.forEach(function (item) { item.className = String(item.className || '').replace(/\s?is-focused/g, ''); });
  }
});

dialog.open({ subtitleBackground: 'low', subtitlePosition: 7, subtitleEdge: 'shadow', subtitleSize: 100 }, {
  apply: function (value) { applied = value; }, cancel: function () { cancelled += 1; }
});
assert.strictEqual(dialog.snapshot().open, true, 'subtitle styling must open as one owned modal');
assert.ok(/is-focused/.test(nodes['subtitle-style-background'].className), 'the active control must remain visibly focused');
assert.strictEqual(nodes['subtitle-style-dialog-preview'].style.getPropertyValue ? nodes['subtitle-style-dialog-preview'].style.getPropertyValue('--subtitle-position') : nodes['subtitle-style-dialog-preview'].style['--subtitle-position'], '7%', 'the preview must use the current subtitle position');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().values.subtitleBackground, 'opaque', 'Left and Right must change the focused visual property');
dialog.handleKey({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(dialog.snapshot().focus, 1, 'Down must move to the next property');
dialog.focusAction(2);
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().values.subtitleEdge, 'double-outline-shadow', 'the subtitle appearance dialog must expose the stronger double-outline choice');
var subtitleShadow = nodes['subtitle-style-dialog-preview'].style.getPropertyValue ? nodes['subtitle-style-dialog-preview'].style.getPropertyValue('--subtitle-shadow') : nodes['subtitle-style-dialog-preview'].style['--subtitle-shadow'];
assert.ok(subtitleShadow.indexOf('4px') !== -1, 'the double-outline preview must use a visibly thicker four-pixel black edge');
dialog.focusAction(3);
dialog.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual(dialog.snapshot().values.subtitleSize, 125, 'subtitle size must use the same live choice model as the other style properties');
dialog.focusAction(6);
dialog.handleKey({ keyCode: 13, preventDefault: function () {} }, 'ok');
assert.strictEqual(applied.subtitleBackground, 'opaque', 'Apply must return the edited draft');
assert.strictEqual(applied.subtitleSize, 125, 'Apply must return the edited global subtitle size');
assert.strictEqual(dialog.snapshot().open, false, 'Apply must close the editor');

dialog.open({ subtitleBackground: 'off', subtitlePosition: 5, subtitleEdge: 'outline', subtitleSize: 100 }, {
  apply: function () {}, cancel: function () { cancelled += 1; }
});
dialog.handleKey({ keyCode: 461, preventDefault: function () {} }, 'back');
assert.strictEqual(cancelled, 1, 'Back must cancel without applying');

var styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
assert.ok(/\.subtitle-style-dialog-controls\s*\{[^}]*display\s*:\s*block\s*;/.test(styles), 'subtitle appearance controls must be stacked vertically');
assert.ok(/\.subtitle-style-control\s*\{[^}]*width\s*:\s*100%\s*;/.test(styles), 'each subtitle appearance control must occupy its own row');

console.log('Subtitle style dialog checks passed');

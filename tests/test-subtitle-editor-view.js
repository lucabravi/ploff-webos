'use strict';

var assert = require('assert');
var SubtitleEditorView = require('../app/subtitle-editor-view');
function node(name) { return { id: name, className: '', textContent: '', innerHTML: '', style: {}, children: [], attributes: {}, appendChild: function (child) { this.children.push(child); }, focus: function () { this.focused = true; }, getAttribute: function (key) { return this.attributes[key] || ''; } }; }
var nodes = {};
['subtitle-preview-overlay', 'subtitle-editor', 'subtitle-editor-status', 'subtitle-editor-track', 'subtitle-editor-size', 'subtitle-editor-offset', 'subtitle-editor-timeline-progress'].forEach(function (id) { nodes[id] = node(id); });
var controls = [node('track'), node('loop'), node('apply')];
controls[0].attributes['data-subtitle-editor'] = 'track'; controls[1].attributes['data-subtitle-editor'] = 'loop'; controls[2].attributes['data-subtitle-editor'] = 'apply';
var documentRef = {
  getElementById: function (id) { return nodes[id]; }, querySelectorAll: function () { return controls; },
  createElement: function (tag) { return node(tag); }, createTextNode: function (text) { return { textContent: text }; }
};
var view = SubtitleEditorView.create({ document: documentRef, SubtitleSync: { active: function () { return [{ text: '<i>Hello</i><br>World' }]; } } });
view.setOpen(true);
view.render({ status: 'Ready', track: 'Italian', size: 125, offsetMs: 200, progress: 42, index: 1, loop: true, pointerActive: false });
assert.strictEqual(nodes['subtitle-editor'].className, 'subtitle-editor', 'opening the editor must expose its surface');
assert.strictEqual(nodes['subtitle-editor-offset'].textContent, '+200 ms', 'subtitle offsets must use a signed readable label');
assert.strictEqual(nodes['subtitle-editor-timeline-progress'].style.width, '42%', 'preview progress must be bounded and rendered');
assert.ok(controls[1].className.indexOf('is-focused') !== -1 && controls[1].className.indexOf('is-active') !== -1, 'loop focus and active state must compose');
view.renderOverlay([], 1000, 0, 125);
assert.strictEqual(nodes['subtitle-preview-overlay'].children[0].textContent, 'Hello', 'subtitle preview must strip embedded markup');
assert.strictEqual(nodes['subtitle-preview-overlay'].style.fontSize, '53px', 'subtitle preview must apply the selected size');

console.log('Subtitle editor view checks passed');

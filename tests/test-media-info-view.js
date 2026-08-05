'use strict';

var assert = require('assert');
var MediaInfoView = require('../app/media-info-view');

function node(id) {
  return {
    id: id, className: 'is-hidden', textContent: '', innerHTML: '', scrollTop: 40, children: [],
    appendChild: function (child) { this.children.push(child); },
    removeChild: function (child) { this.children.splice(this.children.indexOf(child), 1); },
    attributes: {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getAttribute: function (key) { return this.attributes[key] || ''; },
    get firstChild() { return this.children[0]; }
  };
}
var nodes = { 'media-info-dialog': node('media-info-dialog'), 'media-info-dialog-title': node('media-info-dialog-title'), 'media-info-dialog-content': node('media-info-dialog-content'), 'media-info-dialog-hint': node('media-info-dialog-hint'), 'media-info-dialog-close': node('media-info-dialog-close') };
var view = MediaInfoView.create({
  document: {
    getElementById: function (id) { return nodes[id]; },
    createElement: function (tagName) { return { tagName: tagName, className: '', textContent: '', children: [], appendChild: function (child) { this.children.push(child); } }; }
  },
  t: function (key) { return key; }
});

assert.strictEqual(view.open({ sections: [
  { title: 'File', column: 'left', rows: [{ label: 'Name', value: 'Movie.mkv' }] },
  { title: 'Video', column: 'left', rows: [{ label: 'Codec', value: 'HEVC' }] },
  { title: 'Audio', column: 'right', rows: [{ label: 'Track', value: 'Italiano' }] },
  { title: 'Subtitles', column: 'right', rows: [{ label: 'Track', value: 'English' }] }
] }), true, 'the media dialog must open with a model');
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog', 'opening must make the dialog visible');
assert.strictEqual(nodes['media-info-dialog-close'].textContent, 'common.close', 'the media dialog must expose the shared localized Close command');
assert.strictEqual(nodes['media-info-dialog'].getAttribute('aria-hidden'), 'false', 'opening must expose dialog semantics');
assert.strictEqual(nodes['media-info-dialog-content'].children.length, 2, 'the dialog must render independent technical columns');
assert.strictEqual(nodes['media-info-dialog-content'].children[0].className, 'media-info-dialog-column media-info-dialog-column-left', 'file and video sections must stack in the left column');
assert.strictEqual(nodes['media-info-dialog-content'].children[1].className, 'media-info-dialog-column media-info-dialog-column-right', 'audio and subtitle sections must stack in the right column');
assert.strictEqual(nodes['media-info-dialog-content'].children[0].children.length, 2, 'the left technical column must retain its own section stack');
assert.strictEqual(nodes['media-info-dialog-content'].children[1].children.length, 2, 'the right technical column must retain its own section stack');
view.scroll(1);
assert.ok(nodes['media-info-dialog-content'].scrollTop > 40, 'the dialog must support remote scrolling');
view.close();
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog is-hidden', 'closing must restore the hidden state');
assert.strictEqual(nodes['media-info-dialog'].getAttribute('aria-hidden'), 'true', 'closing must hide dialog semantics');

console.log('Media info view checks passed');

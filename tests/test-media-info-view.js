'use strict';

var assert = require('assert');
var MediaInfoView = require('../app/media-info-view');

function node(id) {
  return {
    id: id, className: 'is-hidden', textContent: '', innerHTML: '', scrollTop: 40, children: [],
    appendChild: function (child) { this.children.push(child); },
    removeChild: function (child) { this.children.splice(this.children.indexOf(child), 1); },
    get firstChild() { return this.children[0]; }
  };
}
var nodes = { 'media-info-dialog': node('media-info-dialog'), 'media-info-dialog-title': node('media-info-dialog-title'), 'media-info-dialog-content': node('media-info-dialog-content'), 'media-info-dialog-hint': node('media-info-dialog-hint') };
var view = MediaInfoView.create({
  document: {
    getElementById: function (id) { return nodes[id]; },
    createElement: function (tagName) { return { tagName: tagName, className: '', textContent: '', children: [], appendChild: function (child) { this.children.push(child); } }; }
  },
  t: function (key) { return key; }
});

assert.strictEqual(view.open({ sections: [{ title: 'File', rows: [{ label: 'Name', value: 'Movie.mkv' }] }] }), true, 'the media dialog must open with a model');
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog', 'opening must make the dialog visible');
assert.strictEqual(nodes['media-info-dialog-content'].children.length, 1, 'the dialog must render section content');
view.scroll(1);
assert.ok(nodes['media-info-dialog-content'].scrollTop > 40, 'the dialog must support remote scrolling');
view.close();
assert.strictEqual(nodes['media-info-dialog'].className, 'media-info-dialog is-hidden', 'closing must restore the hidden state');

console.log('Media info view checks passed');

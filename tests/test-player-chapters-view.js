'use strict';

var assert = require('assert');
var PlayerChaptersView = require('../app/player-chapters-view');
var nodes = {};
var cards = [];
function basicNode(id) {
  return { id: id, className: '', innerHTML: '', children: [], scrollLeft: 0, clientWidth: 600, appendChild: function (child) { this.children.push(child); if (id === 'player-chapters-list') { cards.push(child); } }, focus: function () { this.focused = true; } };
}
['player-view', 'player-chapters-drawer', 'player-chapters-list', 'player-chapters-hint'].forEach(function (id) { nodes[id] = basicNode(id); });
function element(tag, className, text) {
  var result = basicNode(''); result.tagName = tag; result.className = className; result.textContent = text || ''; result.attributes = {};
  result.setAttribute = function (key, value) { this.attributes[key] = String(value); };
  result.getElementsByTagName = function (name) { return name === 'img' ? this.children.filter(function (child) { return child.tagName === 'img'; }) : []; };
  result.getBoundingClientRect = function () { return { width: 300, height: 132 }; };
  result.offsetWidth = 300; return result;
}
var loaded = [];
var cancelled = [];
var documentRef = { getElementById: function (id) { return nodes[id]; }, querySelectorAll: function () { return cards; } };
var view = PlayerChaptersView.create({
  document: documentRef, element: element, t: function () { return 'Chapter'; }, formatTime: function (value) { return String(value); }, pointerActive: function () { return false; },
  ProgressiveImages: { previewSize: function () { return { width: 96, height: 42 }; } },
  posterLoader: { load: function (image, specification) { loaded.push(specification); }, prioritize: function (image) { image.prioritized = true; }, cancelScope: function (scope) { cancelled.push(scope); } }
});
var chapters = [{ title: 'Opening', startTimeOffset: 10000, thumb: '/one' }, { title: '', startTimeOffset: 20000, thumb: '/two' }];
view.render(chapters, { open: true, index: 1 });
assert.strictEqual(cards.length, 2, 'chapter rendering must create one card per Plex chapter');
assert.strictEqual(cards[1].children[1].children[0].textContent, 'Chapter 2', 'untitled chapters must use the localized fallback');
assert.strictEqual(loaded[0].source, '/two', 'the focused chapter preview must load first');
assert.ok(cards[1].className.indexOf('is-focused') !== -1 && cards[1].focused, 'remote focus must follow chapter state');
view.renderHint(true, true);
assert.ok(nodes['player-chapters-hint'].className.indexOf('is-focused') !== -1, 'chapter hint rendering must expose focus');
view.close();
assert.deepStrictEqual(cancelled, ['chapters'], 'closing chapters must cancel scoped image work');
assert.strictEqual(nodes['player-chapters-drawer'].className, 'player-chapters-drawer is-hidden', 'closing chapters must hide the drawer');

console.log('Player chapters view checks passed');

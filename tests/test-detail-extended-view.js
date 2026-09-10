'use strict';

var assert = require('assert');
var DetailExtendedView = require('../app/detail-extended-view');
var ProgressiveImages = require('../app/progressive-images');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '', children: [],
    attributes: {}, style: {}, parentNode: null, clientWidth: 220, clientHeight: 124,
    appendChild: function (child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild: function (child) { var index = this.children.indexOf(child); if (index >= 0) { this.children.splice(index, 1); } },
    setAttribute: function (key, val) { this.attributes[key] = String(val); },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    focus: function () { this.focused = true; },
    getBoundingClientRect: function () { return { width: this.clientWidth, height: this.clientHeight }; }
  };
  value.querySelectorAll = function (selector) { return find(value, selector); };
  value.querySelector = function (selector) { return find(value, selector)[0] || null; };
  Object.defineProperty(value, 'innerHTML', { get: function () { return ''; }, set: function () { value.children = []; } });
  return value;
}

function matches(value, selector) {
  var attribute = selector.match(/^\.([a-z0-9-]+)\[([^=]+)\]$/i);
  if (attribute) { return (' ' + value.className + ' ').indexOf(' ' + attribute[1] + ' ') !== -1 && value.hasAttribute(attribute[2]); }
  if (selector.charAt(0) === '.') { return (' ' + value.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1; }
  if (selector.charAt(0) === '[') { return value.hasAttribute(selector.slice(1, -1)); }
  return false;
}

function find(root, selector, output) {
  var result = output || [];
  root.children.forEach(function (child) { if (matches(child, selector)) { result.push(child); } find(child, selector, result); });
  return result;
}

var roots = {
  'detail-extended-pane': node('div'),
  'detail-extended-anchor': node('div'),
  'detail-extended-title': node('h2'),
  'detail-extended-genres-label': node('span'),
  'detail-extended-genres-value': node('span'),
  'detail-extended-directors-label': node('span'),
  'detail-extended-directors-value': node('span'),
  'detail-cast-section': node('section'),
  'detail-cast-title': node('h3'),
  'detail-cast-strip': node('div'),
  'detail-extras-section': node('section'),
  'detail-extras-title': node('h3'),
  'detail-extras-status': node('div'),
  'detail-extras-strip': node('div')
};
var allRootIds = Object.keys(roots);
var documentRef = {
  getElementById: function (id) { return roots[id] || null; },
  querySelector: function (selector) {
    var index;
    var result;
    for (index = 0; index < allRootIds.length; index += 1) {
      result = find(roots[allRootIds[index]], selector)[0];
      if (result) { return result; }
    }
    return null;
  }
};
var batches = [];
var cancelled = [];
var view = DetailExtendedView.create({
  document: documentRef,
  element: function (tagName, className, text) { return node(tagName, className, text); },
  ProgressiveImages: ProgressiveImages,
  posterLoader: {
    loadBatch: function (jobs) { batches.push(jobs); },
    cancelScope: function (scope) { cancelled.push(scope); }
  },
  t: function (key) { return key; }
});
var cast = [];
var index;
for (index = 0; index < 48; index += 1) {
  cast.push({ id: 'person-' + index, name: 'Actor ' + index, role: 'Role ' + index, thumb: 'https://example.test/person-' + index + '.jpg' });
}
var detail = { ratingKey: 'movie-1', genres: ['Fantasy', 'Anime'], directors: ['Director One'], cast: cast };

assert.strictEqual(typeof view.setDetail, 'function', 'extended view must accept already-loaded detail metadata');
view.setDetail(detail);
assert.strictEqual(roots['detail-cast-strip'].children.length, 0, 'cast DOM must not be created before the user enters extended detail');
assert.strictEqual(batches.length, 0, 'cast artwork must not be requested before extended detail is entered');

view.enter();
assert.strictEqual(roots['detail-extended-genres-value'].textContent, 'Fantasy • Anime', 'genres must render immediately from cached detail metadata');
assert.strictEqual(roots['detail-extended-directors-value'].textContent, 'Director One', 'directors must render immediately from cached detail metadata');
assert.ok(roots['detail-cast-strip'].children.length <= 8, 'large Plex casts must use a bounded DOM window');
assert.ok(roots['detail-cast-strip'].children.length >= 6, 'the cast window must fill the TV row');
assert.ok(batches.length > 0 && batches[batches.length - 1].length <= 8, 'only the bounded cast window may request artwork');
assert.strictEqual(view.snapshot().row, 'cast', 'cast must be the initial focus row when present');
assert.strictEqual(view.atTop(), true, 'the initial cast row is the top extended row');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '0', 'extended entry must focus the first cast occurrence');

view.navigate('right');
assert.strictEqual(view.snapshot().castIndex, 1, 'Right must advance through cast without leaving the extended viewport');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '1');

view.setExtrasLoading(true);
assert.strictEqual(roots['detail-extras-status'].textContent, 'detail.extrasLoading', 'lazy extras loading must have a non-blocking status');
view.setExtras([
  { ratingKey: 'extra-1', title: 'Trailer One', subtype: 'trailer', duration: 133000, image: '/extra-1.jpg' },
  { ratingKey: 'extra-2', title: 'Behind the scenes', subtype: 'behindTheScenes', duration: 30000, image: '/extra-2.jpg' }
]);
assert.strictEqual(roots['detail-extras-strip'].children.length, 2, 'small extras collections must preserve every Plex occurrence');
assert.deepStrictEqual(roots['detail-extras-strip'].children.map(function (card) { return card.getAttribute('data-extra-key'); }), ['extra-1', 'extra-2'], 'extras order and occurrence identity must remain Plex order');
assert.strictEqual(roots['detail-extras-section'].className.indexOf('is-hidden'), -1, 'the extras section must remain visible when Plex returns occurrences');
assert.strictEqual(typeof view.select, 'function', 'extended detail must expose logical row selection for pointer routing');
assert.strictEqual(view.select('extras', 1), true, 'pointer routing must be able to select an extra occurrence directly');
assert.strictEqual(view.selectedExtra().ratingKey, 'extra-2', 'direct extra selection must update the playable occurrence');
assert.ok(/(?:^|\s)is-focused(?:\s|$)/.test(view.focusTarget().className), 'direct extra selection must update the visible focus ring');
assert.strictEqual(view.select('extras', 0), true, 'direct extra selection must support returning to the first occurrence');
assert.strictEqual(view.select('cast', 1), true, 'pointer routing must be able to restore the cast row');
assert.strictEqual(view.navigate('down').row, 'extras', 'Down from cast must move into extras when available');
assert.strictEqual(view.atTop(), false, 'extras are below the top extended row');
assert.strictEqual(view.focusTarget().getAttribute('data-extra-position'), '0', 'the first extra must receive focus on row entry');
assert.strictEqual(view.selectedExtra().ratingKey, 'extra-1', 'the extended view must expose the currently selected playable extra without exposing its internal array');
assert.strictEqual(view.navigate('up').row, 'cast', 'Up from extras must return to cast');
assert.strictEqual(view.navigate('up').leave, true, 'Up from the top extended row must request a return to the primary viewport');

view.setExtras([]);
assert.ok(roots['detail-extras-section'].className.indexOf('is-hidden') !== -1, 'an empty Plex extras response must remove the extras row instead of leaving an empty surface');

view.reset();
assert.strictEqual(roots['detail-cast-strip'].children.length, 0, 'reset must clear cast DOM');
assert.strictEqual(roots['detail-extras-strip'].children.length, 0, 'reset must clear extras DOM');
assert.strictEqual(cancelled[cancelled.length - 1], 'detail-extended', 'reset must cancel pending extended artwork');

view.enter();
assert.strictEqual(view.snapshot().row, 'anchor', 'extended entry without cached metadata must remain immediately focusable');
view.setDetail(detail);
assert.strictEqual(view.snapshot().row, 'cast', 'late root metadata must promote focus from the anchor to cast without reopening the viewport');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '0', 'late cast metadata must expose the first cast occurrence to remote focus');

view.reset();
view.setDetail({ ratingKey: 'movie-extras-only', genres: [], directors: [], cast: [] });
view.enter();
assert.strictEqual(view.snapshot().row, 'anchor', 'extended entry without cast or loaded extras must begin on the anchor');
view.setExtras([{ ratingKey: 'extra-only-1', title: 'Trailer only', subtype: 'trailer', duration: 10000, image: '/extra-only-1.jpg' }]);
assert.strictEqual(view.snapshot().row, 'extras', 'late extras without cast must promote the logical row to extras');
assert.ok(/(?:^|\s)is-focused(?:\s|$)/.test(view.focusTarget().className), 'late extras promotion must render the first extra with visible focus immediately');

console.log('Detail extended view checks passed');

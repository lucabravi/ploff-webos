'use strict';

var assert = require('assert');
var DetailExtendedView = require('../app/detail-extended-view');
var ProgressiveImages = require('../app/progressive-images');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '', children: [],
    attributes: {}, style: {}, parentNode: null, clientWidth: 220, clientHeight: 124,
    appendChild: function (child) { if (child.parentNode && child.parentNode.removeChild) { child.parentNode.removeChild(child); } child.parentNode = this; this.children.push(child); return child; },
    insertBefore: function (child, before) {
      var index;
      if (!before) { return this.appendChild(child); }
      if (child.parentNode && child.parentNode.removeChild) { child.parentNode.removeChild(child); }
      index = this.children.indexOf(before);
      if (index < 0) { throw new Error('Reference child is not mounted'); }
      child.parentNode = this;
      this.children.splice(index, 0, child);
      return child;
    },
    removeChild: function (child) { var index = this.children.indexOf(child); if (index >= 0) { this.children.splice(index, 1); } child.parentNode = null; },
    setAttribute: function (key, val) { this.attributes[key] = String(val); },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    focus: function () { this.focused = true; },
    getBoundingClientRect: function () {
      var bounds = value.bounds || {};
      var left = typeof bounds.left === 'number' ? bounds.left : 0;
      var top = typeof bounds.top === 'number' ? bounds.top : 0;
      var right = typeof bounds.right === 'number' ? bounds.right : left + (typeof bounds.width === 'number' ? bounds.width : value.clientWidth);
      var bottom = typeof bounds.bottom === 'number' ? bounds.bottom : top + (typeof bounds.height === 'number' ? bounds.height : value.clientHeight);
      return { left: left, right: right, width: right - left, top: top, bottom: bottom, height: bottom - top };
    }
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
  'detail-extended-directors-row': node('div', 'detail-extended-metadata-row'),
  'detail-extended-directors-label': node('span'),
  'detail-extended-directors-value': node('span'),
  'detail-cast-section': node('section'),
  'detail-cast-title': node('h3'),
  'detail-cast-viewport': node('div'),
  'detail-cast-strip': node('div'),
  'detail-cast-overflow-left': node('button', 'detail-cast-overflow-button'),
  'detail-cast-overflow-right': node('button', 'detail-cast-overflow-button'),
  'detail-extras-section': node('section'),
  'detail-extras-title': node('h3'),
  'detail-extras-status': node('div'),
  'detail-extras-strip': node('div'),
  'detail-extras-viewport': node('div'),
  'detail-extras-overflow-left': node('button', 'detail-row-overflow-button'),
  'detail-extras-overflow-right': node('button', 'detail-row-overflow-button')
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
  },
  defaultView: {
    listeners: {},
    addEventListener: function (name, handler) { this.listeners[name] = handler; },
    removeEventListener: function (name, handler) { if (this.listeners[name] === handler) { this.listeners[name] = null; } }
  }
};
roots['detail-cast-viewport'].appendChild(roots['detail-cast-strip']);
roots['detail-cast-viewport'].appendChild(roots['detail-cast-overflow-left']);
roots['detail-cast-viewport'].appendChild(roots['detail-cast-overflow-right']);
roots['detail-extras-viewport'].appendChild(roots['detail-extras-strip']);
roots['detail-extras-viewport'].appendChild(roots['detail-extras-overflow-left']);
roots['detail-extras-viewport'].appendChild(roots['detail-extras-overflow-right']);
roots['detail-cast-overflow-left'].clientWidth = 44;
roots['detail-cast-overflow-right'].clientWidth = 44;
var batches = [];
var cancelled = [];
var cancelledImages = [];
var prioritizedImages = [];
var view = DetailExtendedView.create({
  document: documentRef,
  element: function (tagName, className, text) { return node(tagName, className, text); },
  ProgressiveImages: {
    renderedSize: function (image, fallbackWidth, fallbackHeight) {
      if (image && image.parentNode && /(?:^|\s)is-buffered(?:\s|$)/.test(image.parentNode.className)) {
        return { width: fallbackWidth, height: fallbackHeight };
      }
      return ProgressiveImages.renderedSize(image, fallbackWidth, fallbackHeight);
    },
    previewSize: ProgressiveImages.previewSize
  },
  posterLoader: {
    loadBatch: function (jobs) { batches.push(jobs); },
    cancel: function (image) { cancelledImages.push(image); },
    cancelScope: function (scope) { cancelled.push(scope); },
    prioritize: function (image, priority) { prioritizedImages.push({ image: image, priority: priority }); }
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
assert.strictEqual(roots['detail-extended-directors-row'].className.indexOf('is-hidden'), -1, 'the directors row must remain visible when directors are present');
assert.ok(roots['detail-cast-strip'].children.length <= 13, 'large Plex casts must use a bounded visible window and six-card prefetch range');
assert.ok(roots['detail-cast-strip'].children.length >= 6, 'the cast window must fill the TV row');
assert.ok(batches.length > 0 && batches[batches.length - 1].length <= 13, 'only the bounded cast window and prefetch range may request artwork');
var firstAheadCastJob = batches[batches.length - 1].filter(function (job) { return job.target.parentNode.getAttribute('data-cast-position') === '6'; })[0];
assert.ok(firstAheadCastJob && firstAheadCastJob.specification.previewOnly === true && firstAheadCastJob.specification.priority === 2, 'the six next cast images must be queued as low-priority previews');
assert.strictEqual(view.snapshot().row, 'cast', 'cast must be the initial focus row when present');
assert.strictEqual(view.atTop(), true, 'the initial cast row is the top extended row');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '0', 'extended entry must focus the first cast occurrence');
assert.strictEqual(roots['detail-cast-overflow-left'].className.indexOf('is-visible'), -1, 'the left cast arrow must stay hidden at the start of the list');
assert.notStrictEqual(roots['detail-cast-overflow-right'].className.indexOf('is-visible'), -1, 'the right cast arrow must appear when more cast members overflow');
var initiallyVisibleCastCards = roots['detail-cast-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); });
roots['detail-cast-viewport'].bounds = { left: 100, right: 1600, width: 1500 };
initiallyVisibleCastCards[0].bounds = { left: 106, right: 306, width: 200 };
initiallyVisibleCastCards[5].bounds = { left: 1200, right: 1400, width: 200 };
roots['detail-cast-overflow-right'].bounds = { left: 1430, right: 1474, width: 44 };
view.select('cast', 0);
assert.strictEqual(roots['detail-cast-overflow-left'].style.left, '-68px', 'the left arrow gap must be calculated from the current right arrow and card geometry, not a fixed pixel gap');
initiallyVisibleCastCards[0].bounds = { left: 112, right: 312, width: 200 };
roots['detail-cast-overflow-right'].bounds = { left: 1451, right: 1495, width: 44 };
documentRef.defaultView.listeners.resize();
assert.strictEqual(roots['detail-cast-overflow-left'].style.left, '-83px', 'resizing the viewport must remeasure and preserve equal spacing on both sides');

view.navigate('right');
assert.strictEqual(view.snapshot().castIndex, 1, 'Right must advance through cast without leaving the extended viewport');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '1');

var castSelectorCalls = 0;
var originalCastQuerySelectorAll = roots['detail-cast-strip'].querySelectorAll;
roots['detail-cast-strip'].querySelectorAll = function (selector) {
  castSelectorCalls += 1;
  return originalCastQuerySelectorAll.call(roots['detail-cast-strip'], selector);
};
view.navigate('right');
view.focusTarget();
assert.strictEqual(castSelectorCalls, 0, 'cast focus movement inside the mounted window must use owned card references instead of scanning the strip');
var retainedCastCard = roots['detail-cast-strip'].children.filter(function (card) { return card.getAttribute('data-cast-position') === '1'; })[0];
var castBatchesBeforeScroll = batches.length;
view.navigate('right');
view.navigate('right');
assert.strictEqual(roots['detail-cast-strip'].children.filter(function (card) { return card.getAttribute('data-cast-position') === '1'; })[0], retainedCastCard, 'scrolling the cast window must retain cards and artwork that remain visible');
assert.deepStrictEqual(roots['detail-cast-strip'].children.map(function (card) { return card.getAttribute('data-cast-position'); }), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'], 'the pre-render window must stay ordered and bounded as it advances');
var castScrollJobs = 0;
batches.slice(castBatchesBeforeScroll).forEach(function (batch) { castScrollJobs += batch.length; });
assert.strictEqual(castScrollJobs, 2, 'scrolling the cast window must only request artwork for newly entering cards');
var focusedCastCard = roots['detail-cast-strip'].children.filter(function (card) { return card.getAttribute('data-cast-position') === '4'; })[0];
assert.ok(prioritizedImages.some(function (entry) { return entry.image === focusedCastCard.children[0] && entry.priority === 0; }), 'the selected pre-rendered cast image must be promoted to foreground priority');
assert.ok(prioritizedImages.some(function (entry) { return entry.image.parentNode.getAttribute('data-cast-position') === '7' && entry.priority === 1; }), 'a pre-rendered cast image entering the visible row must be promoted');
assert.ok(cancelledImages.length > 0, 'cast images leaving the bounded pre-render window must have their pending work cancelled');
view.select('cast', 7);
assert.deepStrictEqual(roots['detail-cast-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); }).map(function (card) { return Number(card.getAttribute('data-cast-position')); }), [2, 3, 4, 5, 6, 7], 'pointer focus on a visible cast member must only highlight it and keep the row still');
roots['detail-cast-overflow-right'].onclick();
assert.deepStrictEqual(roots['detail-cast-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); }).map(function (card) { return Number(card.getAttribute('data-cast-position')); }), [3, 4, 5, 6, 7, 8], 'clicking the right cast arrow must advance the visible range by one card');
assert.notStrictEqual(roots['detail-cast-overflow-left'].className.indexOf('is-visible'), -1, 'the left arrow must appear after manually scrolling right');
roots['detail-cast-overflow-left'].onclick();
assert.deepStrictEqual(roots['detail-cast-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); }).map(function (card) { return Number(card.getAttribute('data-cast-position')); }), [2, 3, 4, 5, 6, 7], 'clicking the left cast arrow must reverse the manual scroll');
view.navigate('right');
assert.deepStrictEqual(roots['detail-cast-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); }).map(function (card) { return Number(card.getAttribute('data-cast-position')); }), [6, 7, 8, 9, 10, 11], 'keyboard navigation must keep its existing focus-following window after pointer scrolling');

view.setExtrasLoading(true);
assert.strictEqual(roots['detail-extras-status'].textContent, 'detail.extrasLoading', 'lazy extras loading must have a non-blocking status');
view.setExtras([
  { ratingKey: 'extra-1', title: 'Trailer One', subtype: 'trailer', duration: 133000, image: '/extra-1.jpg' },
  { ratingKey: 'extra-2', title: 'Behind the scenes', subtype: 'behindTheScenes', duration: 30000, image: '/extra-2.jpg' }
]);
var extraSelectorCalls = 0;
var originalExtraQuerySelectorAll = roots['detail-extras-strip'].querySelectorAll;
roots['detail-extras-strip'].querySelectorAll = function (selector) {
  extraSelectorCalls += 1;
  return originalExtraQuerySelectorAll.call(roots['detail-extras-strip'], selector);
};
assert.strictEqual(roots['detail-extras-strip'].children.length, 2, 'small extras collections must preserve every Plex occurrence');
assert.deepStrictEqual(roots['detail-extras-strip'].children.map(function (card) { return card.getAttribute('data-extra-key'); }), ['extra-1', 'extra-2'], 'extras order and occurrence identity must remain Plex order');
assert.strictEqual(roots['detail-extras-section'].className.indexOf('is-hidden'), -1, 'the extras section must remain visible when Plex returns occurrences');
assert.strictEqual(typeof view.select, 'function', 'extended detail must expose logical row selection for pointer routing');
assert.strictEqual(view.select('extras', 1), true, 'pointer routing must be able to select an extra occurrence directly');
assert.strictEqual(view.selectedExtra().ratingKey, 'extra-2', 'direct extra selection must update the playable occurrence');
assert.ok(/(?:^|\s)is-focused(?:\s|$)/.test(view.focusTarget().className), 'direct extra selection must update the visible focus ring');
assert.strictEqual(extraSelectorCalls, 0, 'extra focus movement inside the mounted window must use owned card references instead of scanning the strip');
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
assert.strictEqual(documentRef.defaultView.listeners.resize, null, 'reset must remove the cast alignment resize listener');

view.enter();
assert.strictEqual(view.snapshot().row, 'anchor', 'extended entry without cached metadata must remain immediately focusable');
view.setDetail(detail);
assert.strictEqual(view.snapshot().row, 'cast', 'late root metadata must promote focus from the anchor to cast without reopening the viewport');
assert.strictEqual(view.focusTarget().getAttribute('data-cast-position'), '0', 'late cast metadata must expose the first cast occurrence to remote focus');

view.reset();
view.setDetail({ ratingKey: 'movie-extras-only', genres: [], directors: [], cast: [] });
view.enter();
assert.strictEqual(view.snapshot().row, 'anchor', 'extended entry without cast or loaded extras must begin on the anchor');
assert.notStrictEqual(roots['detail-extended-directors-row'].className.indexOf('is-hidden'), -1, 'an empty directors row must be hidden');
view.setDetail({ ratingKey: 'movie-with-director', genres: [], directors: ['Director Two'], cast: [] });
assert.strictEqual(roots['detail-extended-directors-row'].className.indexOf('is-hidden'), -1, 'the directors row must reappear when director metadata becomes available');
assert.strictEqual(roots['detail-extended-directors-value'].textContent, 'Director Two');
view.setExtras([{ ratingKey: 'extra-only-1', title: 'Trailer only', subtype: 'trailer', duration: 10000, image: '/extra-only-1.jpg' }]);
assert.strictEqual(view.snapshot().row, 'extras', 'late extras without cast must promote the logical row to extras');
assert.ok(/(?:^|\s)is-focused(?:\s|$)/.test(view.focusTarget().className), 'late extras promotion must render the first extra with visible focus immediately');
var manyExtras = [];
var extraIndex;
for (extraIndex = 0; extraIndex < 12; extraIndex += 1) {
  manyExtras.push({ ratingKey: 'extra-' + extraIndex, title: 'Extra ' + extraIndex, subtype: 'trailer', image: '/extra-' + extraIndex + '.jpg' });
}
view.setExtras(manyExtras);
assert.strictEqual(roots['detail-extras-overflow-left'].disabled, true, 'the left extras arrow must be hidden at the first window');
assert.strictEqual(roots['detail-extras-overflow-right'].disabled, false, 'the right extras arrow must show when more extras exist');
roots['detail-extras-overflow-right'].onclick();
assert.strictEqual(view.focusTarget().getAttribute('data-extra-position'), '1', 'clicking an extras arrow must keep focus on the nearest visible card');
assert.strictEqual(roots['detail-extras-overflow-left'].disabled, false, 'moving the extras window must reveal the back arrow');
view.select('extras', 0);
assert.strictEqual(roots['detail-extras-strip'].children.filter(function (card) { return !/(?:^|\s)is-buffered(?:\s|$)/.test(card.className); }).length, 4, 'the extras window must match the four enlarged landscape cards in the row');
assert.ok(roots['detail-extras-strip'].children.length <= 6, 'extras artwork must remain virtualized with a bounded buffer');
view.select('extras', 0);
var retainedExtraCard = roots['detail-extras-strip'].children.filter(function (card) { return card.getAttribute('data-extra-position') === '1'; })[0];
var retainedExtraImage = retainedExtraCard.children[0];
retainedExtraImage.clientWidth = 640;
retainedExtraImage.clientHeight = 300;
retainedExtraImage.className += ' is-loaded';
var extraBatchesBeforeScroll = batches.length;
view.select('extras', 3);
assert.strictEqual(roots['detail-extras-strip'].children.filter(function (card) { return card.getAttribute('data-extra-position') === '1'; })[0], retainedExtraCard, 'scrolling extras must retain cards that remain in the window');
assert.strictEqual(retainedExtraCard.children[0], retainedExtraImage, 'scrolling extras must retain already loaded artwork');
assert.ok(/(?:^|\s)is-loaded(?:\s|$)/.test(retainedExtraImage.className), 'retained extras artwork must not flash back to its empty state');
assert.strictEqual(batches.length, extraBatchesBeforeScroll + 1, 'scrolling extras must load only the newly buffered artwork');
assert.strictEqual(batches[batches.length - 1].length, 1, 'only one new extra enters the buffer after the first window shift');
assert.strictEqual(batches[batches.length - 1][0].specification.width, 640, 'buffered extras must preload artwork at the same width as visible cards');
assert.strictEqual(batches[batches.length - 1][0].specification.height, 300, 'buffered extras must preload artwork at the same height as visible cards');
view.select('extras', 7);
assert.strictEqual(view.focusTarget().getAttribute('data-extra-position'), '7', 'the enlarged extras window must keep remote focus aligned after paging');
view.reset();
assert.strictEqual(documentRef.defaultView.listeners.resize, null, 'leaving the extended detail must not retain a window resize listener');

console.log('Detail extended view checks passed');

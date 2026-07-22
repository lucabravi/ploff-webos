'use strict';

var assert = require('assert');
var SearchModel = require('../app/search-model');
var LibraryContainers = require('../app/library-containers');
var LibraryGridView = require('../app/library-grid-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '',
    children: [], attributes: {}, style: {}, parentNode: null, clientWidth: 0, clientHeight: 0,
    scrollTop: 0, scrollLeft: 0,
    appendChild: function (child) { if (child.parentNode) { child.parentNode.removeChild(child); } child.parentNode = this; this.children.push(child); return child; },
    insertBefore: function (child, reference) { var index = this.children.indexOf(reference); if (child.parentNode) { child.parentNode.removeChild(child); } child.parentNode = this; if (index < 0) { this.children.push(child); } else { this.children.splice(index, 0, child); } return child; },
    removeChild: function (child) { var index = this.children.indexOf(child); if (index >= 0) { this.children.splice(index, 1); child.parentNode = null; } return child; },
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    focus: function () { this.focused = true; },
    getBoundingClientRect: function () { return { top: 0, left: 0, right: this.clientWidth || 100, bottom: this.clientHeight || 80, width: this.clientWidth || 100, height: this.clientHeight || 80 }; }
  };
  value.querySelector = function (selector) { return find(value, selector)[0] || null; };
  value.querySelectorAll = function (selector) { return find(value, selector); };
  value.getElementsByTagName = function (tagName) { return find(value, String(tagName).toLowerCase()); };
  Object.defineProperty(value, 'innerHTML', { get: function () { return ''; }, set: function () { while (value.children.length) { value.removeChild(value.children[0]); } value.textContent = ''; } });
  return value;
}

function matches(value, selector) {
  var pair = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
  if (pair) { return value.getAttribute(pair[1]) === pair[2]; }
  if (selector.charAt(0) === '.') { return (' ' + value.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1; }
  return value.tagName.toLowerCase() === selector.toLowerCase();
}

function find(root, selector, result) {
  var output = result || [];
  root.children.forEach(function (child) { if (matches(child, selector)) { output.push(child); } find(child, selector, output); });
  return output;
}

function fixture() {
  var roots = {};
  var posterBatches = [];
  var cancelled = [];
  var focusEvents = [];
  ['library-grid', 'library-grid-content', 'library-recommended'].forEach(function (id) { roots[id] = node('div'); roots[id].id = id; });
  roots['library-grid'].clientWidth = 320;
  roots['library-grid'].clientHeight = 160;
  roots['library-grid'].appendChild(roots['library-grid-content']);
  var documentRef = {
    createElement: function (tagName) { return node(tagName); },
    createTextNode: function (text) { return node('#text', '', text); },
    getElementById: function (id) { return roots[id]; },
    querySelector: function (selector) { var ids = Object.keys(roots); var index; var found; for (index = 0; index < ids.length; index += 1) { found = find(roots[ids[index]], selector); if (found.length) { return found[0]; } } return null; },
    querySelectorAll: function (selector) { var output = []; Object.keys(roots).forEach(function (id) { find(roots[id], selector, output); }); return output; }
  };
  var view = LibraryGridView.create({
    root: { clearTimeout: function () {}, setTimeout: function (callback) { callback(); return 1; } },
    document: documentRef, SearchModel: SearchModel,
    moveGridDown: LibraryContainers.moveGridDown,
    element: function (tagName, className, text) { return node(tagName, className, text); },
    cardMetrics: function () { return { width: 100, imageHeight: 70, columnStep: 100, rowStep: 80 }; },
    mediaTitle: function (item) { return item.title; }, mediaCardMeta: function (item) { return item.meta || ''; }, mediaCardDetail: function (item) { return item.detail || ''; },
    mediaKey: function (item) { return item.ratingKey; },
    recommendationTitle: function (row) { return row.title; },
    renderedPosterSpecification: function (image, source, priority, scope) { image.setAttribute('data-poster', source || ''); return { source: source, priority: priority, scope: scope }; },
    posterLoader: { loadBatch: function (jobs) { posterBatches.push(jobs); }, cancelScope: function (scope) { cancelled.push(scope); } },
    clearFocus: function () {}, pointerSelectionActive: function () { return false; }, onFocus: function (focus) { focusEvents.push(focus); },
    overscanRows: 3
  });
  return { view: view, roots: roots, batches: posterBatches, cancelled: cancelled, focusEvents: focusEvents };
}

function items(count, prefix) {
  var result = []; var index;
  for (index = 0; index < count; index += 1) { result.push({ ratingKey: (prefix || 'item') + index, title: (prefix || 'Item') + index, image: (prefix || 'image') + index + '.jpg' }); }
  return result;
}

var catalog = fixture();
catalog.view.setMode('catalog', true);
catalog.view.setItems(items(40), 60);
assert.deepStrictEqual(catalog.view.snapshot().window, { start: 0, end: 15, visibleStartRow: 0, offsetRows: 0 }, 'catalog must render the visible rows plus a three-row overscan buffer');
assert.strictEqual(catalog.roots['library-grid-content'].children.length, 15, 'catalog DOM must be virtualized to the buffered window');
assert.strictEqual(catalog.batches[catalog.batches.length - 1][0].specification.priority, 0, 'focused poster must be scheduled before visible and buffered posters');

var firstCard = catalog.roots['library-grid-content'].children[0];
catalog.view.setItems([items(1, 'new')[0]].concat(items(40).slice(1)), 60);
assert.strictEqual(catalog.roots['library-grid-content'].children[0], firstCard, 'keyed reconciliation must reuse the existing card at a stable slot');
assert.strictEqual(firstCard.getAttribute('data-media-key'), 'new0', 'a reused card must be rebound to its current content identity');
assert.strictEqual(firstCard.querySelector('.library-card-title').textContent, 'new0', 'a reused card must update its caption content');

var movedCard = catalog.roots['library-grid-content'].children[1];
var reordered = items(40);
reordered.splice(0, 0, reordered.splice(1, 1)[0]);
catalog.view.setItems(reordered, 60);
assert.strictEqual(catalog.roots['library-grid-content'].children[0], movedCard, 'keyed reconciliation must preserve a card when its media identity moves to a new slot');
assert.strictEqual(movedCard.getAttribute('data-media-key'), 'item1', 'the moved card must keep its stable content identity');

catalog.roots['library-grid'].scrollTop = 160;
catalog.view.onScroll();
assert.strictEqual(catalog.view.snapshot().window.visibleStartRow, 2, 'scroll synchronization must update the catalog visible row');
assert.strictEqual(catalog.roots['library-grid-content'].style.height, '1120px', 'catalog content must retain its full measured scroll height');
catalog.view.restoreFocus(catalog.roots['library-grid-content'].querySelector('[data-library-index="6"]'));
assert.strictEqual(catalog.view.snapshot().focus.index, 6, 'page-scroll restoration must recover focus from the visible catalog card');

var finalRow = fixture();
finalRow.view.setMode('catalog', true);
finalRow.view.setItems(items(11), 11);
finalRow.view.focusCatalog(10);
finalRow.view.handleDirection('left');
assert.strictEqual(finalRow.view.snapshot().focus.index, 9, 'left must stay inside an incomplete final row');
finalRow.view.handleDirection('up');
assert.strictEqual(finalRow.view.snapshot().focus.index, 6, 'up from an incomplete final row must preserve its column');
finalRow.view.handleDirection('down');
assert.strictEqual(finalRow.view.snapshot().focus.index, 9, 'down must return to the available final-row column instead of selecting a nonexistent item');
assert.strictEqual(finalRow.view.handleDirection('right').moved, true, 'right must advance within an incomplete final row');
assert.strictEqual(finalRow.view.snapshot().focus.index, 10, 'right must end at the final catalog item');
finalRow.view.setItems(items(10), 10);
finalRow.view.focusCatalog(8);
finalRow.view.handleDirection('down');
assert.strictEqual(finalRow.view.snapshot().focus.index, 9, 'down into a missing final-row column must use the established last-item fallback');

var preserved = fixture();
preserved.view.setMode('catalog', true);
preserved.view.setItems(items(24), 24);
preserved.view.focusCatalog(17);
preserved.view.setItems([items(1, 'replacement')[0]].concat(items(23)), 24);
assert.strictEqual(preserved.view.snapshot().focus.index, 18, 'data updates must follow the focused media when a prepend shifts its position');
assert.strictEqual(preserved.view.focusedItem().ratingKey, 'item17', 'focus preservation must retain the selected content identity after an insertion');

var recommendations = fixture();
recommendations.view.setMode('recommended', false);
var firstRecommendationItems = items(3, 'a');
var secondRecommendationItems = items(2, 'b');
recommendations.view.setRecommendations([{ identifier: 'first', title: 'First', items: firstRecommendationItems }, { identifier: 'second', title: 'Second', items: secondRecommendationItems }]);
assert.strictEqual(recommendations.roots['library-grid'].className.indexOf('is-hidden') !== -1, true, 'recommendations must hide the catalog grid');
assert.strictEqual(recommendations.roots['library-recommended'].children.length, 2, 'recommendations must render each server-provided row');
var movedRecommendationCard = recommendations.roots['library-recommended'].children[0].children[1].children[1];
var recommendationCancels = recommendations.cancelled.length;
recommendations.view.setRecommendations([{ identifier: 'first', title: 'First updated', items: [firstRecommendationItems[1], firstRecommendationItems[0], firstRecommendationItems[2]] }, { identifier: 'second', title: 'Second', items: secondRecommendationItems }]);
assert.strictEqual(recommendations.roots['library-recommended'].children[0].children[1].children[0], movedRecommendationCard, 'recommendation reconciliation must preserve a moved card by media identity');
assert.strictEqual(movedRecommendationCard.getAttribute('data-media-key'), 'a1', 'the reused recommendation card must retain its media identity');
assert.ok(recommendations.cancelled.length > recommendationCancels && recommendations.cancelled[recommendations.cancelled.length - 1] === 'library', 'recommendation updates must cancel obsolete poster work before rebinding cards');
var recommendationFocusBatches = recommendations.batches.length;
recommendations.view.handleDirection('right');
assert.strictEqual(recommendations.batches.length, recommendationFocusBatches, 'moving recommendation focus must not rerender and requeue every poster');
recommendations.view.focusRecommendations(0, 2);
recommendations.view.handleDirection('down');
assert.deepStrictEqual(recommendations.view.snapshot().focus, { zone: 'grid', index: 1, recommendationRow: 1 }, 'recommendation movement must clamp the column to a shorter next row');
recommendations.view.handleDirection('up');
assert.deepStrictEqual(recommendations.view.snapshot().focus, { zone: 'grid', index: 1, recommendationRow: 0 }, 'recommendation movement must preserve the clamped column on return');
assert.strictEqual(recommendations.view.handleDirection('up').leave, 'content', 'Up from the first recommendation row must delegate its outer-zone transition');

var pointer = recommendations.roots['library-recommended'].querySelector('[data-library-recommendation-row="1"]');
var recommendationPointerBatches = recommendations.batches.length;
recommendations.view.pointerFocus(pointer);
assert.deepStrictEqual(recommendations.view.snapshot().focus, { zone: 'grid', index: 0, recommendationRow: 1 }, 'pointer focus must select the pointed recommendation card');
assert.strictEqual(recommendations.batches.length, recommendationPointerBatches, 'pointer focus must not rerender and requeue every recommendation poster');

var empty = fixture();
empty.view.setMode('catalog', true);
empty.view.setItems([], 0);
assert.strictEqual(empty.roots['library-grid-content'].children.length, 0, 'an empty catalog must clear virtual cards');
assert.strictEqual(empty.view.focusedItem(), null, 'an empty catalog must not expose a stale focused item');
assert.deepStrictEqual(empty.view.handleDirection('up'), { moved: false, leave: 'content' }, 'Up from an empty catalog must return control to the outer library zone');
empty.view.setItems(items(4), 4);
empty.view.reset();
assert.strictEqual(empty.cancelled[empty.cancelled.length - 1], 'library', 'reset must cancel obsolete library poster work');

console.log('Library grid view checks passed');

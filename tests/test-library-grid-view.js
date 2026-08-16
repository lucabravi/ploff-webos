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

function fixture(rootOverride, viewOptions) {
  var roots = {};
  var posterBatches = [];
  var cancelled = [];
  var cancelledTargets = [];
  var focusEvents = [];
  var metricCalls = 0;
  viewOptions = viewOptions || {};
  ['library-grid', 'library-grid-content', 'library-recommended'].forEach(function (id) { roots[id] = node('div'); roots[id].id = id; });
  roots['library-grid'].clientWidth = 320;
  roots['library-grid'].clientHeight = 160;
  roots['library-grid'].appendChild(roots['library-grid-content']);
  if (viewOptions.clampScrollToContent) {
    (function () {
      var scrollTop = 0;
      Object.defineProperty(roots['library-grid'], 'scrollTop', {
        configurable: true,
        get: function () { return scrollTop; },
        set: function (value) {
          var contentHeight = parseInt(roots['library-grid-content'].style.height, 10) || 0;
          scrollTop = Math.max(0, Math.min(Number(value || 0), Math.max(0, contentHeight - roots['library-grid'].clientHeight)));
        }
      });
    }());
  }
  var documentRef = {
    createElement: function (tagName) { return node(tagName); },
    createTextNode: function (text) { return node('#text', '', text); },
    getElementById: function (id) { return roots[id]; },
    querySelector: function (selector) { var ids = Object.keys(roots); var index; var found; for (index = 0; index < ids.length; index += 1) { found = find(roots[ids[index]], selector); if (found.length) { return found[0]; } } return null; },
    querySelectorAll: function (selector) { var output = []; Object.keys(roots).forEach(function (id) { find(roots[id], selector, output); }); return output; }
  };
  var view = LibraryGridView.create({
    root: rootOverride || { clearTimeout: function () {}, setTimeout: function (callback) { callback(); return 1; } },
    document: documentRef, SearchModel: SearchModel,
    moveGridDown: LibraryContainers.moveGridDown,
    element: function (tagName, className, text) { return node(tagName, className, text); },
    cardMetrics: function () { metricCalls += 1; return { width: 100, imageHeight: 70, columnStep: 100, rowStep: 80 }; },
    mediaTitle: function (item) { return item.title; }, mediaCardMeta: function (item) { return item.meta || ''; }, mediaCardDetail: function (item) { return item.detail || ''; },
    mediaKey: function (item) { return item.ratingKey; },
    presentationVersion: viewOptions.presentationVersion,
    showLibraryBadge: viewOptions.showLibraryBadge,
    recommendationTitle: function (row) { return row.title; },
    renderedPosterSpecification: function (image, source, priority, scope, width, height) { image.setAttribute('data-poster', source || ''); return { source: source, priority: priority, scope: scope, width: width, height: height }; },
    posterLoader: {
      cancel: function (target) { cancelledTargets.push(target); },
      loadBatch: function (jobs) { posterBatches.push(jobs); },
      cancelScope: function (scope) { cancelled.push(scope); },
      prioritize: function () {}
    },
    clearFocus: function () {}, pointerSelectionActive: function () { return false; }, onFocus: function (focus) { focusEvents.push(focus); },
    overscanRows: 3
  });
  return { view: view, roots: roots, batches: posterBatches, cancelled: cancelled, cancelledTargets: cancelledTargets, focusEvents: focusEvents, metricCalls: function () { return metricCalls; } };
}

function items(count, prefix) {
  var result = []; var index;
  for (index = 0; index < count; index += 1) { result.push({ ratingKey: (prefix || 'item') + index, title: (prefix || 'Item') + index, image: (prefix || 'image') + index + '.jpg' }); }
  return result;
}

var playlist = fixture(null, {
  presentationVersion: function () { return 'en|playlist'; },
  showLibraryBadge: function () { return true; }
});
playlist.view.setMode('catalog', true);
playlist.view.setItems([{ ratingKey: 'mixed', title: 'Mixed', image: '/mixed.jpg', libraryTitle: 'Anime', rating: 8.4 }], 1);
assert.strictEqual(playlist.roots['library-grid-content'].children[0].querySelector('.library-source-badge').textContent, 'Anime', 'playlist contents display the source library badge');
assert.strictEqual(playlist.roots['library-grid-content'].children[0].querySelector('.library-rating-badge').textContent, '♥ 8.4', 'source and rating badges may coexist on opposite card corners');

var catalog = fixture();
catalog.view.setMode('catalog', true);
catalog.view.setItems(items(40), 60);
assert.deepStrictEqual(catalog.view.snapshot().window, { start: 0, end: 15, visibleStartRow: 0, offsetRows: 0 }, 'catalog must render the visible rows plus a three-row overscan buffer');
assert.strictEqual(catalog.roots['library-grid-content'].children.length, 15, 'catalog DOM must be virtualized to the buffered window');
assert.strictEqual(catalog.batches[catalog.batches.length - 1][0].specification.priority, 0, 'focused poster must be scheduled before visible and buffered posters');
assert.deepStrictEqual({ width: catalog.batches[catalog.batches.length - 1][0].specification.width, height: catalog.batches[catalog.batches.length - 1][0].specification.height }, { width: 100, height: 70 }, 'catalog poster specifications must receive the measured card dimensions');
assert.strictEqual(catalog.metricCalls(), 1, 'one catalog render must read card metrics once');
var initialCatalogJobs = catalog.batches[catalog.batches.length - 1];
assert.strictEqual(initialCatalogJobs.filter(function (job) { return job.specification.previewOnly !== true; }).length, 9, 'visible cards and one neighboring row must be eligible for full artwork');
assert.strictEqual(initialCatalogJobs.filter(function (job) { return job.specification.previewOnly === true; }).length, 6, 'farther overscan rows must request preview-only artwork');
var catalogFocusBatches = catalog.batches.length;
var catalogFocusEvents = catalog.focusEvents.length;
catalog.view.handleDirection('right');
catalog.view.refreshFocus();
assert.strictEqual(catalog.batches.length, catalogFocusBatches, 'catalog focus movement must not rebuild poster batches');
assert.strictEqual(catalog.focusEvents.length, catalogFocusEvents + 1, 'one catalog movement must publish one focus change even when the outer controller refreshes focus');
assert.strictEqual(catalog.view.navigationSnapshot().itemCount, 40, 'navigation snapshots must expose catalog counts without copying the full item array');

var distantInitialFocus = fixture(null, { clampScrollToContent: true });
distantInitialFocus.view.setMode('catalog', true);
distantInitialFocus.view.setItems(items(80), 80, 47);
assert.ok(distantInitialFocus.roots['library-grid'].scrollTop > 0, 'programmatic focus outside the mounted catalog window must scroll to its row');
assert.ok(distantInitialFocus.view.snapshot().window.start <= 47 && distantInitialFocus.view.snapshot().window.end > 47, 'programmatic focus must mount the selected catalog item');
assert.ok(distantInitialFocus.roots['library-grid-content'].querySelector('[data-library-index="47"]').className.indexOf('is-focused') !== -1, 'the newly mounted catalog item must render as focused');

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
var sameWindowBatches = catalog.batches.length;
catalog.roots['library-grid'].scrollTop = 161;
catalog.view.onScroll();
assert.strictEqual(catalog.batches.length, sameWindowBatches, 'scroll events inside the same virtual row must not reconcile cards or requeue posters');
catalog.view.restoreFocus(catalog.roots['library-grid-content'].querySelector('[data-library-index="6"]'));
assert.strictEqual(catalog.view.snapshot().focus.index, 6, 'page-scroll restoration must recover focus from the visible catalog card');

var frames = [];
var cancelledFrames = [];
var frameScheduled = fixture({
  requestAnimationFrame: function (callback) { frames.push(callback); return frames.length; },
  cancelAnimationFrame: function (identifier) { cancelledFrames.push(identifier); }
});
frameScheduled.view.setMode('catalog', true);
frameScheduled.view.setItems(items(40), 40);
frameScheduled.roots['library-grid'].scrollTop = 80;
frameScheduled.view.onScroll();
frameScheduled.roots['library-grid'].scrollTop = 160;
frameScheduled.view.onScroll();
assert.strictEqual(frames.length, 1, 'multiple scroll events in one frame must schedule one catalog synchronization');
frames[0]();
assert.strictEqual(frameScheduled.view.snapshot().window.visibleStartRow, 2, 'the scheduled frame must use the latest scroll position');
frameScheduled.roots['library-grid'].scrollTop = 240;
frameScheduled.view.onScroll();
frameScheduled.view.reset();
assert.deepStrictEqual(cancelledFrames, [2], 'reset must cancel a pending animation-frame synchronization');


var artworkWindow = fixture();
artworkWindow.view.setMode('catalog', true);
artworkWindow.view.setItems(items(60), 60);
artworkWindow.roots['library-grid'].scrollTop = 320;
artworkWindow.view.onScroll();
var cancelCount = artworkWindow.cancelledTargets.length;
var batchCount = artworkWindow.batches.length;
artworkWindow.roots['library-grid'].scrollTop = 400;
artworkWindow.view.onScroll();
var shiftedJobs = artworkWindow.batches[batchCount];
assert.strictEqual(artworkWindow.cancelledTargets.length - cancelCount, 3, 'one-row scroll must cancel poster work for exactly the leaving row');
assert.strictEqual(shiftedJobs.filter(function (job) { return job.specification.previewOnly === true; }).length, 3, 'the far entering row must remain preview-only');
assert.strictEqual(shiftedJobs.filter(function (job) { return job.specification.previewOnly !== true; }).length, 3, 'the newly adjacent row must be promoted to full artwork');

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

var restored = fixture();
restored.view.restore({
  mode: 'catalog', usesGridScroll: true, items: items(8), recommendations: [], totalSize: 20,
  focus: { index: 5, recommendationRow: 0 }
});
assert.strictEqual(restored.view.snapshot().items.length, 8, 'restoring a cached library must expose its items immediately');
assert.strictEqual(restored.view.snapshot().totalSize, 20, 'restoring a cached library must retain its server total');
assert.strictEqual(restored.view.snapshot().focus.index, 5, 'restoring a cached library must retain its focused item');

console.log('Library grid view checks passed');

'use strict';

var assert = require('assert');
var Benchmark = require('../scripts/benchmark-library-catalog');

var context = Benchmark.fixture();
var catalogItems = Benchmark.items(5000);
context.view.setMode('catalog', true);
context.view.setItems(catalogItems, catalogItems.length);
context.roots['library-grid'].scrollTop = 320;
context.view.onScroll();
Benchmark.resetCounters(context.counters);
context.roots['library-grid'].scrollTop = 400;
context.view.onScroll();

assert.ok(context.counters.appendChild <= 5, 'one-row catalog scrolling must move at most one row of card nodes');
assert.ok(context.counters.createdNodes === 0, 'one-row catalog scrolling must recycle retained card nodes');
assert.ok(context.counters.posterJobs <= 10, 'one-row catalog scrolling must schedule artwork only for entering or promoted cards');
assert.ok(context.counters.posterFullJobs <= 5, 'one-row catalog scrolling must promote at most one row to full artwork');
assert.ok(context.counters.posterPreviewJobs <= 5, 'one-row catalog scrolling must request only previews for the far entering row');
assert.ok(context.counters.posterCancels <= 5, 'one-row catalog scrolling must cancel artwork only for the leaving row');
assert.ok(context.counters.querySelector <= 60, 'one-row catalog scrolling must not query every descendant of every retained card');

assert.strictEqual(context.counters.cardMetrics, 0, 'one-row scrolling must use the shared card profile instead of recalculating metrics');
assert.ok(context.counters.cardProfile <= 1, 'one-row scrolling must resolve the active profile at most once');
assert.ok(context.counters.mediaTitle <= 5, 'one-row scrolling must rebuild titles only for entering cards');
assert.ok(context.counters.mediaMeta <= 5, 'one-row scrolling must rebuild metadata only for entering cards');
assert.ok(context.counters.mediaDetail <= 5, 'one-row scrolling must rebuild details only for entering cards');

var focusContext = Benchmark.fixture();
var focusItems = Benchmark.items(5000);
focusContext.view.setMode('catalog', true);
focusContext.view.setItems(focusItems, focusItems.length);
Benchmark.resetCounters(focusContext.counters);
focusContext.view.handleDirection('right');
focusContext.view.refreshFocus();
assert.ok(focusContext.counters.querySelector <= 2, 'focus movement must use mounted-node maps instead of document-wide selectors');
assert.strictEqual(focusContext.counters.cardMetrics, 0, 'focus movement must not recalculate card metrics');
assert.strictEqual(focusContext.counters.cardProfile, 0, 'focus movement must not resolve the layout profile');
assert.strictEqual(focusContext.counters.mediaTitle, 0, 'focus movement must not rebuild card titles');
assert.strictEqual(focusContext.counters.mediaMeta, 0, 'focus movement must not rebuild card metadata');
assert.strictEqual(focusContext.counters.mediaDetail, 0, 'focus movement must not rebuild card details');


var appendContext = Benchmark.fixture();
var initialItems = Benchmark.items(5000);
appendContext.view.setMode('catalog', true);
appendContext.view.setItems(initialItems.slice(0, 60), initialItems.length);
appendContext.view.focusCatalog(12);
Benchmark.resetCounters(appendContext.counters);
appendContext.view.appendItems(initialItems.slice(60, 120), initialItems.length);
assert.strictEqual(appendContext.view.focusSnapshot().index, 12, 'incremental append must preserve the exact focused occurrence index');
assert.strictEqual(appendContext.view.navigationSnapshot().itemCount, 120, 'incremental append must extend the resident catalog');
assert.strictEqual(appendContext.counters.appendChild, 0, 'append outside the retained window must not move catalog nodes');
assert.strictEqual(appendContext.counters.removeChild, 0, 'append outside the retained window must not remove catalog nodes');
assert.strictEqual(appendContext.counters.posterJobs, 0, 'append outside the retained window must not requeue poster work');


var stressContext = Benchmark.fixture();
var stressItems = Benchmark.items(10000);
var maximumMountedCards = 0;
var maximumPosterJobs = 0;
var maximumFullJobs = 0;
var maximumPreviewJobs = 0;
var maximumCancels = 0;
var row;
stressContext.view.setMode('catalog', true);
stressContext.view.setItems(stressItems, stressItems.length);
for (row = 1; row <= 500; row += 1) {
  Benchmark.resetCounters(stressContext.counters);
  stressContext.roots['library-grid'].scrollTop = row * 80;
  stressContext.view.onScroll();
  maximumMountedCards = Math.max(maximumMountedCards, stressContext.roots['library-grid-content'].children.length);
  maximumPosterJobs = Math.max(maximumPosterJobs, stressContext.counters.posterJobs);
  maximumFullJobs = Math.max(maximumFullJobs, stressContext.counters.posterFullJobs);
  maximumPreviewJobs = Math.max(maximumPreviewJobs, stressContext.counters.posterPreviewJobs);
  maximumCancels = Math.max(maximumCancels, stressContext.counters.posterCancels);
}
assert.ok(maximumMountedCards <= 45, 'ten-thousand-item scrolling must keep DOM retention bounded to visible rows plus three-row overscan');
assert.ok(maximumPosterJobs <= 10, 'ten-thousand-item one-row scrolling must keep artwork work bounded to two rows');
assert.ok(maximumFullJobs <= 5, 'ten-thousand-item scrolling must promote at most one row to full artwork');
assert.ok(maximumPreviewJobs <= 5, 'ten-thousand-item scrolling must load at most one far preview row');
assert.ok(maximumCancels <= 5, 'ten-thousand-item scrolling must cancel at most the leaving row');

console.log('Library grid hot-path checks passed');

'use strict';

var assert = require('assert');
var ProgressiveImages = require('../app/progressive-images');
var DetailEpisodeView = require('../app/detail-episode-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '', children: [],
    attributes: {}, style: {}, parentNode: null, clientWidth: 310, clientHeight: 124,
    appendChild: function (child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild: function (child) { var index = this.children.indexOf(child); if (index >= 0) { this.children.splice(index, 1); } },
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
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
  return false;
}

function find(root, selector, output) {
  var result = output || [];
  root.children.forEach(function (child) { if (matches(child, selector)) { result.push(child); } find(child, selector, result); });
  return result;
}

function episode(index, selected) {
  return { ratingKey: 'episode-' + index, index: index, title: 'Episode title ' + index, image: 'episode-' + index + '.jpg', selected: !!selected, progress: index === 3 ? 45 : 0, viewed: index < 3 };
}

var roots = { 'season-tabs': node('div'), 'episode-strip': node('div') };
var batches = [];
var cancelled = [];
var seasonActivation = -1;
var episodeActivation = -1;
var documentRef = {
  getElementById: function (id) { return roots[id]; },
  querySelectorAll: function (selector) { return find(roots['episode-strip'], selector); }
};
var view = DetailEpisodeView.create({
  root: { setTimeout: function () { return 1; }, clearTimeout: function () {} }, document: documentRef,
  element: function (tagName, className, text) { return node(tagName, className, text); }, ProgressiveImages: ProgressiveImages,
  posterLoader: { loadBatch: function (jobs) { batches.push(jobs); }, cancelScope: function (scope) { cancelled.push(scope); } },
  onSeasonActivate: function (index) { seasonActivation = index; }, onEpisodeActivate: function (index) { episodeActivation = index; }
});
var context = {
  seasons: [{ ratingKey: 'season-1', title: 'Season 1' }, { ratingKey: 'season-2', title: 'Season 2', selected: true }],
  episodes: [episode(1), episode(2), episode(3), episode(4, true), episode(5), episode(6), episode(7)]
};

view.setContext(context);
assert.deepStrictEqual(view.snapshot().window, { start: 1, end: 6 }, 'episode strip must center a five-card window around the selected episode');
assert.strictEqual(roots['season-tabs'].children.length, 2, 'all season tabs must be rendered');
assert.strictEqual(roots['episode-strip'].children.length, 5, 'only the five-card episode window must be rendered');
assert.strictEqual(batches[batches.length - 1].length, 5, 'episode previews must be loaded as one prioritized batch');
assert.strictEqual(batches[batches.length - 1][2].specification.width, 310, 'final episode preview must match the rendered card width');
assert.strictEqual(batches[batches.length - 1][2].specification.height, 124, 'final episode preview must match the rendered card height');

roots['season-tabs'].children[0].onclick.call(roots['season-tabs'].children[0]);
roots['episode-strip'].children[1].onclick.call(roots['episode-strip'].children[1]);
assert.strictEqual(seasonActivation, 0, 'season pointer activation must delegate its stable index');
assert.strictEqual(episodeActivation, 2, 'episode pointer activation must delegate its absolute index');

view.reconcilePlayback([{ ratingKey: 'episode-3', viewed: true, progress: 100, duration: 10, viewOffset: 10 }]);
assert.strictEqual(context.episodes[2].viewed, true, 'fresh Plex playback state must update the matching episode identity');
assert.strictEqual(context.episodes[2].progress, 100, 'fresh Plex progress must update the matching episode identity');

view.setEpisodeIndex(6);
assert.deepStrictEqual(view.snapshot().window, { start: 2, end: 7 }, 'the final episode must retain a full five-card window when possible');
view.reset();
assert.strictEqual(roots['episode-strip'].children.length, 0, 'reset must clear stale episode cards');
assert.strictEqual(cancelled[cancelled.length - 1], 'detail-episodes', 'reset must cancel pending episode artwork');

console.log('Detail episode view checks passed');

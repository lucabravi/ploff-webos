'use strict';

var assert = require('assert');
var ProgressiveImages = require('../app/progressive-images');
var DetailEpisodeView = require('../app/detail-episode-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '', children: [],
    attributes: {}, style: {}, parentNode: null, clientWidth: 310, clientHeight: 124,
    appendChild: function (child) {
      var existingIndex = this.children.indexOf(child);
      if (existingIndex >= 0) { this.children.splice(existingIndex, 1); }
      child.parentNode = this; this.children.push(child); return child;
    },
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
  var durations = { 1: 187000, 2: 3787000, 3: 0 };
  return { ratingKey: 'episode-' + index, index: index, title: 'Episode title ' + index, image: 'episode-' + index + '.jpg', selected: !!selected, progress: index === 3 ? 45 : 0, viewed: index < 3, duration: durations[index] };
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
  element: function (tagName, className, text) { var result = node(tagName, className, text); if (tagName === 'img') { result.clientWidth = 310.9; result.clientHeight = 168.8; } return result; }, ProgressiveImages: ProgressiveImages,
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
assert.strictEqual(roots['episode-strip'].children.length, 7, 'the five-card episode window must retain a two-card artwork buffer');
assert.strictEqual(batches[batches.length - 1].length, 7, 'visible and buffered episode previews must be loaded as one prioritized batch');
assert.strictEqual(batches[batches.length - 1][3].specification.width, 310, 'final episode preview must match the rendered card width');
assert.strictEqual(batches[batches.length - 1][3].specification.height, 168, 'final episode preview must use the full 16:9-oriented artwork height');
assert.strictEqual(find(roots['episode-strip'], '.is-buffered').length, 2, 'only the five visible episode cards may participate in layout');
assert.strictEqual(roots['episode-strip'].children[0].querySelector('.episode-duration-badge').textContent, '03:07', 'sub-hour episode duration must zero-pad minutes and seconds');
assert.strictEqual(roots['episode-strip'].children[1].querySelector('.episode-duration-badge').textContent, '1:03:07', 'episode duration must keep unpadded hours and padded minutes/seconds');
assert.strictEqual(roots['episode-strip'].children[2].querySelector('.episode-duration-badge').textContent, '--:--', 'missing or non-positive episode duration must stay explicit');

context.episodes[1].viewed = true;
context.episodes[1].progress = 35;
context.episodes[1].viewOffset = 35000;
view.refreshPlaybackCards();
assert.ok(roots['episode-strip'].children[1].querySelector('.episode-progress-track').className.indexOf('is-hidden') === -1,
  'a completed episode with partial rewatch progress must still show its current progress bar');
assert.strictEqual(roots['episode-strip'].children[1].querySelector('.episode-progress-value').style.width, '35%',
  'rewatch progress must use the current partial percentage even when Plex still marks the episode viewed');

var preservedCard = roots['episode-strip'].children[0];
var batchCount = batches.length;
view.setEpisodeIndex(4, false);
view.refreshSelection();
assert.strictEqual(roots['episode-strip'].children[0], preservedCard, 'moving the episode window must preserve overlapping card nodes');
assert.strictEqual(batches.length, batchCount, 'moving inside the artwork buffer must not request another preview');
assert.ok(roots['episode-strip'].children[4].className.indexOf('is-current') !== -1, 'the current episode marker must move without rebuilding shared cards');

roots['season-tabs'].children[0].onclick.call(roots['season-tabs'].children[0]);
roots['episode-strip'].children[1].onclick.call(roots['episode-strip'].children[1]);
assert.strictEqual(seasonActivation, 0, 'season pointer activation must delegate its stable index');
assert.strictEqual(episodeActivation, Number(roots['episode-strip'].children[1].getAttribute('data-episode-position')), 'episode pointer activation must delegate its absolute index');

view.reconcilePlayback([{ ratingKey: 'episode-3', viewed: true, progress: 100, duration: 10, viewOffset: 10 }]);
assert.strictEqual(context.episodes[2].viewed, true, 'fresh Plex playback state must update the matching episode identity');
assert.strictEqual(context.episodes[2].progress, 100, 'fresh Plex progress must update the matching episode identity');

view.setEpisodeIndex(6);
assert.deepStrictEqual(view.snapshot().window, { start: 2, end: 7 }, 'the final episode must retain a full five-card window when possible');
view.reset();
assert.strictEqual(roots['episode-strip'].children.length, 0, 'reset must clear stale episode cards');
assert.strictEqual(cancelled[cancelled.length - 1], 'detail-episodes', 'reset must cancel pending episode artwork');

console.log('Detail episode view checks passed');

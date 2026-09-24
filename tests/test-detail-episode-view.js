'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var nodeQuerySelectorCount = 0;
var ProgressiveImages = require('../app/progressive-images');
var DetailEpisodeView = require('../app/detail-episode-view');
var coreStyles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles', 'core.css'), 'utf8');

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
    removeAttribute: function (key) { delete this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    getBoundingClientRect: function () { return { width: this.clientWidth, height: this.clientHeight }; }
  };
  value.querySelectorAll = function (selector) { return find(value, selector); };
  value.querySelector = function (selector) { nodeQuerySelectorCount += 1; return find(value, selector)[0] || null; };
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


var roots = {
  'season-tabs': node('div'), 'season-tabs-track': node('div'),
  'season-tabs-overflow-left': node('span'), 'season-tabs-overflow-right': node('span'),
  'episode-viewport': node('div'),
  'episode-strip': node('div'),
  'episode-overflow-left': node('button', 'detail-row-overflow-button'),
  'episode-overflow-right': node('button', 'detail-row-overflow-button')
};
roots['episode-viewport'].appendChild(roots['episode-strip']);
roots['episode-viewport'].appendChild(roots['episode-overflow-left']);
roots['episode-viewport'].appendChild(roots['episode-overflow-right']);
roots['episode-viewport'].getBoundingClientRect = function () { return { left: 0, right: 0, width: 0 }; };
roots['episode-overflow-right'].getBoundingClientRect = function () { return { left: 0, right: 0, width: 0 }; };
roots['season-tabs-track'].clientWidth = 310;
roots['season-tabs-track'].scrollWidth = 500;
var batches = [];
var cancelled = [];
var cancelledTargets = [];
var seasonActivation = -1;
var episodeActivation = -1;
var episodeBrowse = -1;
var documentQuerySelectorAllCount = 0;
var documentRef = {
  getElementById: function (id) { return roots[id]; },
  querySelectorAll: function (selector) { documentQuerySelectorAllCount += 1; return find(roots['episode-strip'], selector); }
};
var view = DetailEpisodeView.create({
  root: { setTimeout: function () { return 1; }, clearTimeout: function () {} }, document: documentRef,
  element: function (tagName, className, text) {
    var result = node(tagName, className, text);
    if (tagName === 'img') { result.clientWidth = 310.9; result.clientHeight = 168.8; }
    if (className === 'episode-card') { result.getBoundingClientRect = function () { return { left: 0, right: 0, width: 0 }; }; }
    return result;
  }, ProgressiveImages: ProgressiveImages,
  posterLoader: {
    loadBatch: function (jobs) { batches.push(jobs); },
    cancelScope: function (scope) { cancelled.push(scope); },
    cancel: function (target) { cancelledTargets.push(target); }
  },
  sourceContext: function () { return { serverMachineIdentifier: 'primary' }; },
  mediaTitle: function (item) {
    if (item && item.titleKey === 'media.episodeNumber') { return 'Episode ' + item.titleParameters.number; }
    if (item && item.titleKey === 'media.season') { return 'Stagione ' + item.titleParameters.number; }
    return item && item.title || '';
  },
  onSeasonActivate: function (index) { seasonActivation = index; }, onEpisodeActivate: function (index) { episodeActivation = index; },
  onEpisodeBrowse: function (index) { episodeBrowse = index; }
});
var context = {
  seasons: [
    { ratingKey: 'season-1', title: 'Season 1' },
    { ratingKey: 'season-2', title: 'Season 2', titleKey: 'media.season', titleParameters: { number: 2 }, selected: true }
  ],
  episodes: [episode(1), episode(2), episode(3), episode(4, true), episode(5), episode(6), episode(7)]
};
context.episodes[6].title = '';
context.episodes[6].titleKey = 'media.episodeNumber';
context.episodes[6].titleParameters = { number: 7 };

roots['season-tabs-track'].clientWidth = 0;
roots['season-tabs-track'].scrollWidth = 0;
view.setContext(context);
assert.strictEqual(roots['episode-overflow-left'].style.left, undefined,
  'a hidden detail layout must not override the mirrored CSS offset of the left episode arrow');
assert.deepStrictEqual(view.snapshot().window, { start: 1, end: 6 }, 'episode strip must center a five-card window around the selected episode');
assert.strictEqual(roots['season-tabs-track'].children.length, 2, 'all season tabs must be rendered');
assert.strictEqual(roots['season-tabs-track'].children[1].textContent, 'Stagione 2',
  'generated season-tab fallback titles must follow the active locale');
var residentSeasonTab = roots['season-tabs-track'].children[1];
view.setSeasonIndex(0);
view.setSeasonIndex(1);
assert.strictEqual(roots['season-tabs-track'].children[1], residentSeasonTab,
  'moving between seasons must update mounted tabs without clearing and recreating their focus nodes');
assert.ok(roots['season-tabs-overflow-right'].className.indexOf('is-visible') === -1,
  'hidden detail layout must not claim season overflow before it has measurable dimensions');
roots['season-tabs-track'].clientWidth = 310;
roots['season-tabs-track'].scrollWidth = 500;
assert.strictEqual(typeof view.refreshSeasonOverflow, 'function',
  'episode view must expose a layout refresh for the detail reveal boundary');
view.refreshSeasonOverflow();
assert.ok(roots['season-tabs-overflow-right'].className.indexOf('is-visible') !== -1,
  'season navigation must expose a right overflow hint when later seasons are clipped');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-right') !== -1,
  'season navigation must mask clipped labels instead of painting over the backdrop');
assert.ok(roots['season-tabs-overflow-left'].className.indexOf('is-visible') === -1,
  'the first season must not expose a left overflow hint');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-left') === -1,
  'the first season must not apply a left text mask');
roots['season-tabs-track'].children[0].offsetLeft = 0;
roots['season-tabs-track'].children[0].offsetWidth = 100;
roots['season-tabs-track'].children[1].offsetLeft = 380;
roots['season-tabs-track'].children[1].offsetWidth = 100;
roots['season-tabs-track'].scrollLeft = 0;
view.setSeasonIndex(1, false);
assert.strictEqual(roots['season-tabs-track'].scrollLeft, 190,
  'selecting the last season must consume the remaining trailing tab margin');
assert.ok(roots['season-tabs-overflow-right'].className.indexOf('is-visible') === -1,
  'the right overflow hint must disappear when the last season is selected');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-right') === -1,
  'the right season mask must disappear when the last season is selected');
assert.ok(roots['season-tabs-overflow-left'].className.indexOf('is-visible') !== -1,
  'the last season must expose a left overflow hint');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-left') !== -1,
  'the last season must apply the mirrored left text mask');
roots['season-tabs-track'].scrollLeft = 190;
view.refreshSeasonOverflow();
assert.ok(roots['season-tabs-overflow-right'].className.indexOf('is-visible') === -1,
  'the right overflow hint must disappear at the last season');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-right') === -1,
  'the right season mask must disappear at the last season');
assert.ok(roots['season-tabs-overflow-left'].className.indexOf('is-visible') !== -1,
  'the left overflow hint must remain visible while the last season is selected');
roots['season-tabs-track'].scrollLeft = 0;
view.refreshSeasonOverflow();
assert.strictEqual(roots['season-tabs-track'].scrollLeft, 190,
  'refreshing the visible detail layout must also reveal the selected last season');
assert.ok(roots['season-tabs-overflow-right'].className.indexOf('is-visible') === -1,
  'the right overflow hint must stay hidden after the detail layout is refreshed on the last season');
view.setSeasonIndex(0, false);
assert.strictEqual(roots['season-tabs-track'].scrollLeft, 0,
  'selecting the first season must return the track to its leading edge');
assert.ok(roots['season-tabs-overflow-left'].className.indexOf('is-visible') === -1,
  'the first season must remove the left overflow hint');
assert.ok(roots['season-tabs-track'].className.indexOf('is-clipped-left') === -1,
  'the first season must remove the left text mask');
assert.strictEqual(roots['episode-strip'].children.length, 7, 'the five-card episode window must retain a two-card artwork buffer');
assert.strictEqual(find(roots['episode-strip'].children[0], '.episode-image-frame').length, 1,
  'each episode card must provide an image frame for overlays that should not cover its title');
assert.strictEqual(find(roots['episode-strip'].children[0].querySelector('.episode-image-frame'), '.episode-image').length, 1,
  'episode artwork must remain inside the overlay frame');
assert.ok(/\.episode-card\.is-viewed \.episode-image-frame:after,[\s\S]*bottom:\s*7px;[\s\S]*right:\s*7px;/.test(coreStyles) &&
  coreStyles.indexOf('.episode-card.is-viewed:after') === -1,
  'the viewed marker must sit at the bottom-right of the poster, opposite the duration, not over the title');
assert.strictEqual(batches[batches.length - 1].length, 7, 'visible and buffered episode previews must be loaded as one prioritized batch');
assert.strictEqual(batches[batches.length - 1][3].specification.width, 310, 'final episode preview must match the rendered card width');
assert.strictEqual(batches[batches.length - 1][3].specification.height, 168, 'final episode preview must use the full 16:9-oriented artwork height');
assert.strictEqual(batches[batches.length - 1][3].specification.scope, 'detail-episodes',
  'episode artwork must use the scope owned and cancelled by the episode view');
assert.strictEqual(find(roots['episode-strip'], '.is-buffered').length, 2, 'only the five visible episode cards may participate in layout');
assert.strictEqual(roots['episode-strip'].children[6].querySelector('.episode-label-text').textContent, 'E07 - Episode 7',
  'episode cards must render a missing Plex title through the active locale instead of a transport fallback');
assert.strictEqual(roots['episode-strip'].children[0].querySelector('.episode-duration-badge').textContent, '03:07', 'sub-hour episode duration must zero-pad minutes and seconds');
assert.strictEqual(roots['episode-strip'].children[1].querySelector('.episode-duration-badge').textContent, '1:03:07', 'episode duration must keep unpadded hours and padded minutes/seconds');
assert.strictEqual(roots['episode-strip'].children[2].querySelector('.episode-duration-badge').textContent, '--:--', 'missing or non-positive episode duration must stay explicit');

var firstEpisodeLabel = roots['episode-strip'].children[0].querySelector('.episode-label-text');
firstEpisodeLabel.scrollWidth = firstEpisodeLabel.clientWidth + 42;
view.render();
assert.ok(firstEpisodeLabel.className.indexOf('is-overflowing') !== -1,
  'episode labels that exceed the visible card width must be marked for the shared marquee');
assert.strictEqual(firstEpisodeLabel.style['--text-marquee-distance'], '-42px',
  'episode title movement must use the exact measured overflow distance');
view.startTitlePan(roots['episode-strip'].children[0]);
assert.ok(firstEpisodeLabel.className.indexOf('is-pan-active') !== -1,
  'only the selected episode title should activate the marquee');
firstEpisodeLabel.className += ' is-overflowing';
firstEpisodeLabel.setAttribute('data-pan-distance', '42');
firstEpisodeLabel.scrollWidth = firstEpisodeLabel.clientWidth;
view.render();
assert.ok(firstEpisodeLabel.className.indexOf('is-overflowing') === -1,
  'title movement must be removed when the reused episode title fits inside the card');
assert.strictEqual(firstEpisodeLabel.hasAttribute('data-pan-distance'), false,
  'title movement distance must be cleared when there is no actual overflow');
assert.strictEqual(firstEpisodeLabel.style['--text-marquee-distance'], '',
  'the measured movement distance must be cleared when an episode title fits');

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

roots['season-tabs-track'].children[0].onclick.call(roots['season-tabs-track'].children[0]);
roots['episode-strip'].children[1].onclick.call(roots['episode-strip'].children[1]);
assert.strictEqual(seasonActivation, 0, 'season pointer activation must delegate its stable index');
assert.strictEqual(episodeActivation, Number(roots['episode-strip'].children[1].getAttribute('data-episode-position')), 'episode pointer activation must delegate its absolute index');

view.reconcilePlayback([{ ratingKey: 'episode-3', viewed: true, progress: 100, duration: 10, viewOffset: 10 }]);
assert.strictEqual(context.episodes[2].viewed, true, 'fresh Plex playback state must update the matching episode identity');
assert.strictEqual(context.episodes[2].progress, 100, 'fresh Plex progress must update the matching episode identity');

view.setEpisodeIndex(6);
assert.deepStrictEqual(view.snapshot().window, { start: 2, end: 7 }, 'the final episode must retain a full five-card window when possible');

view.setEpisodeIndex(0);
assert.strictEqual(roots['episode-overflow-left'].disabled, true, 'the first episode window must hide its left arrow');
assert.strictEqual(roots['episode-overflow-right'].disabled, false, 'more episodes must show the right arrow');
var playbackBeforeArrow = episodeActivation;
roots['episode-overflow-right'].onclick();
assert.deepStrictEqual(view.snapshot().window, { start: 1, end: 6 }, 'clicking the episode arrow must advance the visible window by one card');
assert.strictEqual(episodeBrowse, view.snapshot().episodeIndex, 'pointer scrolling must synchronize the controller selection');
assert.strictEqual(episodeActivation, playbackBeforeArrow, 'clicking the episode arrow must never activate playback');
assert.strictEqual(roots['episode-overflow-left'].disabled, false, 'the left arrow must appear after the first page moves');
view.setEpisodeIndex(0);
var firstWindowCards = roots['episode-strip'].children.slice();
var firstWindowLabel = firstWindowCards[0].querySelector('.episode-label-text');
var secondWindowLabel = firstWindowCards[1].querySelector('.episode-label-text');
firstWindowLabel.className += ' is-overflowing';
firstWindowLabel.setAttribute('data-pan-distance', '20');
firstWindowLabel.style['--text-marquee-distance'] = '-20px';
secondWindowLabel.className += ' is-overflowing';
secondWindowLabel.setAttribute('data-pan-distance', '24');
secondWindowLabel.style['--text-marquee-distance'] = '-24px';
view.startTitlePan(firstWindowCards[0]);
documentQuerySelectorAllCount = 0;
nodeQuerySelectorCount = 0;
view.setEpisodeIndex(1, false);
view.refreshSelection();
view.startTitlePan(firstWindowCards[1]);
assert.strictEqual(documentQuerySelectorAllCount, 0,
  'moving inside an already-rendered episode window must not rescan every episode card or title');
assert.strictEqual(nodeQuerySelectorCount, 0,
  'focus-only episode movement and title pan must reuse mounted card references instead of querying inside cards');
assert.strictEqual(typeof view.cardAt, 'function', 'episode view must expose the already-mounted card for controller focus');
if (typeof view.cardAt === 'function') {
  assert.strictEqual(view.cardAt(1), firstWindowCards[1], 'cardAt must return the mounted episode card without a document lookup');
}
assert.strictEqual(roots['episode-strip'].children[0], firstWindowCards[0],
  'focus-only episode movement must preserve the previously selected card node');
assert.strictEqual(roots['episode-strip'].children[1], firstWindowCards[1],
  'focus-only episode movement must preserve the newly selected card node');
assert.ok(firstWindowCards[0].className.indexOf('is-current') === -1,
  'focus-only episode movement must clear the previous current marker');
assert.ok(firstWindowCards[1].className.indexOf('is-current') !== -1,
  'focus-only episode movement must update the new current marker');
assert.ok(firstWindowLabel.className.indexOf('is-pan-active') === -1,
  'focus-only episode movement must stop animating the previous title');
assert.ok(secondWindowLabel.className.indexOf('is-pan-active') !== -1,
  'focus-only episode movement must animate the newly selected overflowing title');

var staleCard = roots['episode-strip'].children[0];
var staleImage = staleCard.querySelector('.episode-image');
var remoteEpisode = episode(1);
remoteEpisode.serverMachineIdentifier = 'remote-b';
view.setEpisodes([remoteEpisode], remoteEpisode.ratingKey);
assert.notStrictEqual(roots['episode-strip'].children[0], staleCard,
  'the same Plex rating key on another server must not retain the prior server card');
assert.ok(cancelledTargets.indexOf(staleImage) !== -1,
  'replacing a season must cancel artwork still loading for discarded episode cards');
assert.strictEqual(batches[batches.length - 1][0].specification.sourceOwnerMachineIdentifier, 'remote-b',
  'merged episodes must request artwork from the server that owns each episode');
assert.strictEqual(batches[batches.length - 1][0].specification.sourceIdentity, 'server:remote-b',
  'episode artwork identity must follow its owning server even when Detail opened on another server');
var remoteCard = roots['episode-strip'].children[0];
view.setEpisodes([remoteEpisode], remoteEpisode.ratingKey);
assert.strictEqual(roots['episode-strip'].children[0], remoteCard,
  'a refreshed episode from the same server must retain its mounted card');
assert.strictEqual(batches[batches.length - 1][0].target, remoteCard.querySelector('.episode-image'),
  'refreshing the episode context must recheck the artwork route without replacing its visible card');

view.reset();
assert.strictEqual(roots['episode-strip'].children.length, 0, 'reset must clear stale episode cards');
assert.strictEqual(cancelled[cancelled.length - 1], 'detail-episodes', 'reset must cancel pending episode artwork');

console.log('Detail episode view checks passed');

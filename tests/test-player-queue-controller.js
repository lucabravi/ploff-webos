'use strict';

var assert = require('assert');
var PlayerQueueController = require('../app/coordinator/player-queue-controller');
var PlaybackQueueModel = require('../app/playback-queue-model');
var ProgressiveImages = require('../app/progressive-images');

function hasClass(node, name) {
  return (' ' + String(node && node.className || '') + ' ').indexOf(' ' + name + ' ') >= 0;
}

function isDescendant(node, ancestor) {
  var current = node;
  while (current) {
    if (current === ancestor) { return true; }
    current = current.parentNode;
  }
  return false;
}

function createNode(tagName, className, text) {
  var attributes = {};
  var listeners = {};
  var children = [];
  var node = {
    tagName: String(tagName || 'div').toUpperCase(),
    id: '',
    className: className || '',
    textContent: text || '',
    style: {},
    childNodes: children,
    parentNode: null,
    disabled: false,
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 416,
    offsetTop: 0,
    offsetHeight: 190,
    focusCount: 0,
    setAttribute: function (name, value) { attributes[name] = String(value); },
    removeAttribute: function (name) { delete attributes[name]; },
    getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : ''; },
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    appendChild: function (child) {
      return node.insertBefore(child, null);
    },
    insertBefore: function (child, reference) {
      var oldIndex;
      var index;
      if (!child) { return child; }
      if (child.parentNode) {
        oldIndex = child.parentNode.childNodes.indexOf(child);
        if (oldIndex >= 0) { child.parentNode.childNodes.splice(oldIndex, 1); }
      }
      index = reference ? children.indexOf(reference) : -1;
      if (index < 0) { children.push(child); }
      else { children.splice(index, 0, child); }
      child.parentNode = node;
      return child;
    },
    removeChild: function (child) {
      var index = children.indexOf(child);
      if (index >= 0) { children.splice(index, 1); child.parentNode = null; }
      return child;
    },
    addEventListener: function (name, listener) { listeners[name] = listener; },
    removeEventListener: function (name, listener) { if (listeners[name] === listener) { delete listeners[name]; } },
    focus: function () { node.focusCount += 1; },
    querySelector: function (selector) {
      var values = node.querySelectorAll(selector);
      return values.length ? values[0] : null;
    },
    querySelectorAll: function (selector) {
      var result = [];
      function matches(candidate) {
        if (!candidate) { return false; }
        if (selector.charAt(0) === '#') { return candidate.id === selector.slice(1); }
        if (selector.charAt(0) === '.') { return hasClass(candidate, selector.slice(1)); }
        return candidate.tagName.toLowerCase() === selector.toLowerCase();
      }
      function visit(candidate) {
        var index;
        if (matches(candidate)) { result.push(candidate); }
        for (index = 0; index < candidate.childNodes.length; index += 1) { visit(candidate.childNodes[index]); }
      }
      for (var index = 0; index < children.length; index += 1) { visit(children[index]); }
      return result;
    }
  };
  return node;
}

function createHarness(overrides) {
  var values = overrides || {};
  var calls = [];
  var posterCalls = [];
  var renderedPosterCalls = [];
  var pendingWindows = [];
  var body = createNode('body');
  var documentElement = createNode('html');
  var player = createNode('section', 'player-view');
  var buttons = createNode('div', 'player-buttons');
  var settings = createNode('button', 'player-button');
  var queue = values.queue || { kind: 'container', title: 'Queue', items: [] };
  var queueState = values.queueState || {
    sequence: { identity: 'queue-a' },
    drawer: { open: false, index: 0, focusReady: false, queue: queue, currentIndex: 0 }
  };
  var currentIndex = values.currentIndex === undefined ? 0 : values.currentIndex;
  var documentRef;
  player.id = 'player-view';
  settings.id = 'player-settings-button';
  buttons.appendChild(settings);
  player.appendChild(buttons);
  body.appendChild(player);
  documentRef = {
    body: body,
    documentElement: documentElement,
    getElementById: function (id) {
      if (body.id === id) { return body; }
      return body.querySelector('#' + id);
    },
    querySelector: function (selector) { return body.querySelector(selector); },
    querySelectorAll: function (selector) { return body.querySelectorAll(selector); }
  };
  var domain = {
    snapshot: function () { calls.push(['snapshot']); return queueState; },
    activeQueue: function () { calls.push(['active-queue']); return queue; },
    activeIndex: function () { calls.push(['active-index']); return currentIndex; },
    loadDrawerWindow: function (options, callback, detail) {
      calls.push(['load-window', options, detail]);
      if (values.deferWindows) { pendingWindows.push(callback); }
      else { callback(null, values.windowResult || { total: 0, bounds: PlaybackQueueModel.windowBounds({ total: 0 }), items: [] }); }
      return { state: 'resolving' };
    },
    openDrawer: function (detail, delay) { calls.push(['open-drawer', detail, delay]); return true; },
    closeDrawer: function () { calls.push(['close-drawer']); return true; },
    moveDrawer: function (direction, detail) { calls.push(['move-drawer', direction, detail]); return true; },
    pointDrawer: function (index, detail) { calls.push(['point-drawer', index, detail]); return true; }
  };
  var controller = PlayerQueueController.create({
    root: {
      scrollTo: function (x, y) { calls.push(['scroll-to', x, y]); }
    },
    document: documentRef,
    PlaybackQueueModel: PlaybackQueueModel,
    ProgressiveImages: ProgressiveImages,
    queueController: domain,
    detailSnapshot: function () { calls.push(['detail']); return { currentDetail: { ratingKey: 'current' } }; },
    playbackSnapshot: function () { return { paused: values.paused === true }; },
    currentView: function () { return values.view || 'player'; },
    currentSettings: function () { return { uiLanguage: values.language || 'it' }; },
    pointerActive: function () { return values.pointerActive === true; },
    translate: function (key) { return key; },
    element: function (tag, className, text) { return createNode(tag, className, text); },
    posterLoader: function () {
      return {
        load: function (image, options) { posterCalls.push([image, options]); }
      };
    },
    loadRenderedPoster: function (image, source, priority, scope, width, height) {
      renderedPosterCalls.push([image, source, priority, scope, width, height, isDescendant(image, body)]);
    },
    cancelImages: function (scope) { calls.push(['cancel-images', scope]); },
    showMessage: function (text) { calls.push(['message', text]); },
    closeChapterDrawer: function (restoreFocus) { calls.push(['close-chapters', restoreFocus]); },
    cancelAutoplay: function (dismiss) { calls.push(['cancel-autoplay', dismiss]); },
    showControls: function () { calls.push(['show-controls']); },
    cancelControlsTimeout: function () { calls.push(['cancel-controls-timeout']); },
    setControlsZone: function (zone, index) { calls.push(['controls-zone', zone, index]); },
    animationDuration: function (delay) { return delay + 5; }
  });
  return {
    controller: controller,
    calls: calls,
    posterCalls: posterCalls,
    renderedPosterCalls: renderedPosterCalls,
    pendingWindows: pendingWindows,
    domain: domain,
    document: documentRef,
    player: player,
    buttons: buttons,
    setQueueState: function (next) { queueState = next; },
    setQueue: function (next) { queue = next; },
    setCurrentIndex: function (next) { currentIndex = next; }
  };
}

(function ownsQueueUiAndButtonPresentation() {
  var h = createHarness();
  h.controller.ensureUi();
  var button = h.document.getElementById('player-playlist-queue-button');
  var drawer = h.document.getElementById('player-playlist-queue');
  assert.ok(button && drawer, 'the presentation owner must create the queue command and drawer exactly once');
  assert.strictEqual(h.controller.label(), 'Coda');
  h.controller.updateButton({ drawer: { open: true } }, true);
  assert.strictEqual(hasClass(button, 'is-unavailable'), false);
  assert.strictEqual(button.getAttribute('aria-label'), 'Coda');
  assert.strictEqual(button.getAttribute('aria-expanded'), 'true');
  h.controller.ensureUi();
  assert.strictEqual(h.document.querySelectorAll('#player-playlist-queue-button').length, 1,
    'ensureUi must be idempotent');
}());

(function closedDrawerPrefetchesOnlyTheFiveVisibleItemsAsSd() {
  var items = [];
  var records = [];
  var index;
  var queue;
  var h;
  for (index = 0; index < 5; index += 1) {
    items.push({ ratingKey: 'warm-' + index, type: 'episode', title: 'Warm ' + index, image: '/warm-' + index + '.jpg' });
    records.push({ occurrenceId: 'queue:' + (8 + index) + ':warm-' + index, absoluteIndex: 8 + index, item: items[index] });
  }
  queue = { kind: 'container', title: 'Queue', items: items, index: 10 };
  h = createHarness({
    queue: queue,
    currentIndex: 10,
    queueState: {
      sequence: { identity: 'queue-warm' },
      drawer: { open: false, index: 0, focusReady: false, queue: queue, currentIndex: 10 }
    },
    windowResult: {
      total: 30,
      bounds: {
        total: 30, focusIndex: 10, visibleStart: 8, visibleEnd: 13,
        retainedStart: 8, retainedEnd: 13, sdStart: 8, sdEnd: 13,
        finalStart: 8, finalEnd: 13
      },
      items: records,
      prefetchItems: []
    }
  });
  h.controller.updateButton();
  var windowCalls = h.calls.filter(function (entry) { return entry[0] === 'load-window'; });
  assert.strictEqual(windowCalls.length, 1, 'a closed Player queue must warm exactly one visible-only window');
  assert.deepStrictEqual(windowCalls[0][1], {
    viewportItems: 5,
    direction: 0,
    focusIndex: 10,
    visibleOnly: true
  }, 'closed queue warming must follow the current playback occurrence rather than stale drawer focus');
  assert.strictEqual(h.document.querySelectorAll('.playlist-queue-card').length, 0,
    'warming a closed queue must not create drawer card DOM');
  assert.strictEqual(h.posterCalls.filter(function (entry) {
    return entry[1].scope === 'playlist-queue-prefetch' && entry[1].source;
  }).length, 5, 'the five visible occurrences must warm only their SD artwork');
  assert.strictEqual(h.posterCalls.filter(function (entry) {
    return entry[1].scope === 'playlist-queue-prefetch' && entry[1].source && entry[1].previewOnly === true;
  }).length, 5, 'closed queue SD warm-up must stop after the preview phase instead of scheduling a redundant full phase');
  assert.strictEqual(h.renderedPosterCalls.length, 0,
    'closed queue warming must never request rendered/final artwork');
}());

(function retainedOccurrencesStayDistinctAndReuseCards() {
  var first = { ratingKey: 'same', type: 'episode', title: 'Episode', detail: 'E01 - First', image: '/first.jpg', duration: 187000 };
  var second = { ratingKey: 'same', type: 'episode', title: 'Episode', detail: 'E02 - Second', image: '/second.jpg', viewed: true, duration: 3787000 };
  var queue = { kind: 'container', title: 'Duplicates', items: [first, second] };
  var bounds = {
    total: 8, visibleStart: 0, visibleEnd: 2, retainedStart: 0, retainedEnd: 6,
    sdStart: 0, sdEnd: 8, finalStart: 0, finalEnd: 3
  };
  var windowResult = {
    total: 8,
    bounds: bounds,
    items: [
      { occurrenceId: 'queue:1:same', absoluteIndex: 1, item: first },
      { occurrenceId: 'queue:5:same', absoluteIndex: 5, item: second }
    ],
    prefetchItems: [{ occurrenceId: 'queue:7:prefetch', absoluteIndex: 7, item: { ratingKey: 'p', image: '/prefetch.jpg' } }]
  };
  var h = createHarness({
    queue: queue,
    currentIndex: 1,
    queueState: { sequence: { identity: 'queue-a' }, drawer: { open: true, index: 5, focusReady: true, queue: queue, currentIndex: 1 } },
    windowResult: windowResult
  });
  h.controller.renderDrawerState({ open: true, index: 5, focusReady: true, queue: queue, currentIndex: 1 });
  var list = h.document.querySelector('.player-playlist-queue-list');
  var cards = list.querySelectorAll('.playlist-queue-card');
  assert.strictEqual(cards.length, 2, 'two duplicate rating keys with distinct occurrence identities must retain distinct cards');
  assert.strictEqual(cards[0].getAttribute('data-playlist-queue-occurrence'), 'queue:1:same');
  assert.strictEqual(cards[1].getAttribute('data-playlist-queue-occurrence'), 'queue:5:same');
  assert.ok(hasClass(cards[0], 'is-current'), 'the currently playing occurrence must be marked independently from focus');
  assert.ok(hasClass(cards[1], 'is-focused'), 'the drawer occurrence must be focused independently from playback');
  assert.ok(cards[1].focusCount >= 1, 'remote navigation must focus the rendered occurrence when pointer mode is inactive');
  assert.strictEqual(h.renderedPosterCalls.length, 1, 'visible/final artwork must use exact rendered poster loading');
  assert.strictEqual(h.renderedPosterCalls[0][6], true,
    'HD artwork must be requested after the queue card is attached to the player drawer');
  assert.ok(h.posterCalls.some(function (entry) { return entry[1].scope === 'playlist-queue'; }),
    'retained non-final artwork must use the SD queue tier');
  assert.ok(h.posterCalls.some(function (entry) { return entry[1].scope === 'playlist-queue-prefetch'; }),
    'directional prefetch artwork must be isolated in its own scope');
  var firstCard = cards[0];
  var secondCard = cards[1];
  h.controller.renderDrawerState({ open: true, index: 5, focusReady: true, queue: queue, currentIndex: 1 });
  cards = list.querySelectorAll('.playlist-queue-card');
  assert.strictEqual(cards[0], firstCard);
  assert.strictEqual(cards[1], secondCard);
  assert.strictEqual(h.document.querySelector('.player-playlist-queue-title').textContent, 'Duplicates');
  assert.strictEqual(h.document.querySelector('.player-playlist-queue-position').textContent, '2 / 8');
  assert.strictEqual(cards[0].querySelector('.playlist-queue-card-duration').textContent, '03:07', 'queue sub-hour duration must zero-pad minutes and seconds');
  assert.strictEqual(cards[1].querySelector('.playlist-queue-card-duration').textContent, '1:03:07', 'queue episode duration must use unpadded hours with padded minutes/seconds');
}());

(function playbackMarkerUpdatesDoNotRebuildCards() {
  var item = { ratingKey: 'a', type: 'movie', title: 'Movie', image: '/movie.jpg' };
  var queue = { kind: 'container', title: 'Queue', items: [item] };
  var h = createHarness({
    queue: queue,
    currentIndex: 0,
    queueState: { sequence: { identity: 'queue-a' }, drawer: { open: true, index: 0, focusReady: false, queue: queue, currentIndex: 0 } },
    windowResult: {
      total: 1,
      bounds: { total: 1, visibleStart: 0, visibleEnd: 1, retainedStart: 0, retainedEnd: 1, sdStart: 0, sdEnd: 1, finalStart: 0, finalEnd: 1 },
      items: [{ occurrenceId: 'queue:0:a', absoluteIndex: 0, item: item }],
      prefetchItems: []
    }
  });
  h.controller.renderDrawerState({ open: true, index: 0, focusReady: false, queue: queue, currentIndex: 0 });
  var card = h.document.querySelector('.playlist-queue-card');
  var marker = card.querySelector('.playlist-queue-card-now-playing');
  assert.ok(hasClass(marker, 'is-playing'));
  h.controller.updatePlaybackMarkers(true);
  assert.strictEqual(hasClass(marker, 'is-playing'), false, 'pausing must update only the current marker state');
  assert.strictEqual(h.document.querySelector('.playlist-queue-card'), card, 'marker updates must retain the existing occurrence card');
  h.controller.updatePlaybackMarkers(false);
  assert.ok(hasClass(marker, 'is-playing'));
  assert.strictEqual(h.controller.resetPlaybackState(), true,
    'a new playback session must reset only the cached marker state without releasing queue cards');
  assert.strictEqual(h.document.querySelector('.playlist-queue-card'), card);
}());

(function drawerNavigationDelegatesDomainMovementAndRestoresControlsFocus() {
  var h = createHarness();
  h.controller.ensureUi();
  assert.strictEqual(h.controller.open(), true);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'close-chapters' && entry[1] === false; }));
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'cancel-autoplay' && entry[1] === false; }));
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'open-drawer' && entry[2] === 225; }));
  h.controller.move(-1);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'move-drawer' && entry[1] === -1; }));
  assert.strictEqual(h.controller.close(true), true);
  var zone = h.calls.filter(function (entry) { return entry[0] === 'controls-zone'; })[0];
  assert.deepStrictEqual(zone, ['controls-zone', 'buttons', 0], 'closing with focus restore must return to the queue command');
}());

(function pointerFocusDelegatesOnlyForAnOpenDrawerCard() {
  var queue = { kind: 'container', title: 'Queue', items: [] };
  var h = createHarness({ queue: queue, queueState: { sequence: { identity: 'queue-a' }, drawer: { open: true, index: 3, queue: queue, currentIndex: 0 } } });
  var card = createNode('button', 'playlist-queue-card');
  card.setAttribute('data-playlist-queue-index', '3');
  assert.strictEqual(h.controller.pointerFocus(card), true);
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'point-drawer' && entry[1] === 3; }));
  h.setQueueState({ sequence: { identity: 'queue-a' }, drawer: { open: false, index: 3, queue: queue, currentIndex: 0 } });
  assert.strictEqual(h.controller.pointerFocus(card), false);
}());

(function staleDrawerWindowsAndIdentityChangesCannotPublishOldCards() {
  var queue = { kind: 'container', title: 'Queue A', items: [] };
  var h = createHarness({ queue: queue, deferWindows: true, queueState: { sequence: { identity: 'queue-a' }, drawer: { open: true, index: 0, focusReady: false, queue: queue, currentIndex: 0 } } });
  h.controller.renderDrawerState({ open: true, index: 0, focusReady: false, queue: queue, currentIndex: 0 });
  h.controller.renderDrawerState({ open: true, index: 1, focusReady: false, queue: queue, currentIndex: 0 });
  assert.strictEqual(h.pendingWindows.length, 2);
  h.pendingWindows[0](null, {
    total: 1,
    bounds: { total: 1, visibleStart: 0, visibleEnd: 1, retainedStart: 0, retainedEnd: 1, sdStart: 0, sdEnd: 1, finalStart: 0, finalEnd: 1 },
    items: [{ occurrenceId: 'old:0', absoluteIndex: 0, item: { ratingKey: 'old', type: 'movie', title: 'Old' } }]
  });
  assert.strictEqual(h.document.querySelectorAll('.playlist-queue-card').length, 0, 'a stale async drawer window must not publish cards');
  h.setQueueState({ sequence: { identity: 'queue-a' }, drawer: { open: true, index: 1, focusReady: false, queue: queue, currentIndex: 0 } });
  h.pendingWindows[1](null, {
    total: 1,
    bounds: { total: 1, visibleStart: 0, visibleEnd: 1, retainedStart: 0, retainedEnd: 1, sdStart: 0, sdEnd: 1, finalStart: 0, finalEnd: 1 },
    items: [{ occurrenceId: 'new:0', absoluteIndex: 0, item: { ratingKey: 'new', type: 'movie', title: 'New' } }]
  });
  assert.strictEqual(h.document.querySelectorAll('.playlist-queue-card').length, 1);
  h.setQueueState({ sequence: { identity: 'queue-b' }, drawer: { open: false, index: 0, queue: queue, currentIndex: 0 } });
  h.controller.updatePresentation();
  assert.ok(h.posterCalls.some(function (entry) {
    return entry[1].scope === 'playlist-queue' && entry[1].source === '';
  }), 'changing logical queue identity must release retained card artwork before presenting the next queue');
}());

(function destroyReleasesOwnedArtworkScopesAndIsIdempotent() {
  var h = createHarness();
  h.controller.destroy();
  h.controller.destroy();
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'cancel-images' && entry[1] === 'playlist-queue'; }).length, 1);
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'cancel-images' && entry[1] === 'playlist-queue-prefetch'; }).length, 1);
  assert.strictEqual(h.controller.open(), false, 'destroyed presentation owners must reject new drawer actions');
}());

console.log('Player queue controller checks passed');

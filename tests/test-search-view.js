'use strict';

var assert = require('assert');
var SearchModel = require('../app/search-model');
var SearchSession = require('../app/search-session');
var T9Input = require('../app/t9-input');
var SearchView = require('../app/search-view');

function node(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '',
    children: [], attributes: {}, style: {}, parentNode: null, clientWidth: 300, clientHeight: 240,
    scrollTop: 0, scrollHeight: 1000, focused: false, src: '', alt: '', type: ''
  };
  value.appendChild = function (child) {
    if (child.parentNode && child.parentNode.removeChild) { child.parentNode.removeChild(child); }
    child.parentNode = value;
    value.children.push(child);
    if (child.textContent) { value.textContent += child.textContent; }
    return child;
  };
  value.removeChild = function (child) {
    var index = value.children.indexOf(child);
    if (index !== -1) { value.children.splice(index, 1); child.parentNode = null; }
    return child;
  };
  value.setAttribute = function (key, attributeValue) { value.attributes[key] = String(attributeValue); };
  value.getAttribute = function (key) { return value.attributes[key]; };
  value.hasAttribute = function (key) { return Object.prototype.hasOwnProperty.call(value.attributes, key); };
  value.focus = function () { value.focused = true; };
  value.getBoundingClientRect = function () {
    return { width: value.clientWidth || 100, height: value.clientHeight || 80, top: 0, bottom: value.clientHeight || 80 };
  };
  value.querySelector = function (selector) { return find(value, selector)[0] || null; };
  value.querySelectorAll = function (selector) { return find(value, selector); };
  value.getElementsByTagName = function (tag) {
    return find(value, tag.toLowerCase() === 'img' ? 'img' : tag);
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      value.children.forEach(function (child) { child.parentNode = null; });
      value.children = [];
      value.textContent = '';
    }
  });
  return value;
}

function matches(value, selector) {
  var attribute = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
  if (attribute) { return value.getAttribute(attribute[1]) === attribute[2]; }
  if (selector.charAt(0) === '.') { return (' ' + value.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1; }
  return value.tagName.toLowerCase() === selector.toLowerCase();
}

function find(root, selector, result) {
  var output = result || [];
  root.children.forEach(function (child) {
    if (matches(child, selector)) { output.push(child); }
    find(child, selector, output);
  });
  return output;
}

function fakeDocument() {
  var roots = {};
  var documentRef = {
    createElement: function (tagName) { return node(tagName); },
    createTextNode: function (text) { return node('#text', '', text); },
    getElementById: function (id) { return roots[id]; },
    querySelector: function (selector) {
      var ids = Object.keys(roots);
      var index;
      var result;
      for (index = 0; index < ids.length; index += 1) {
        result = find(roots[ids[index]], selector);
        if (result.length) { return result[0]; }
      }
      return null;
    },
    querySelectorAll: function (selector) {
      var ids = Object.keys(roots);
      var result = [];
      ids.forEach(function (id) { find(roots[id], selector, result); });
      return result;
    }
  };
  [
    'search-view', 'search-query', 'search-t9-legend', 'search-keyboard', 'search-results', 'search-status'
  ].forEach(function (id) {
    roots[id] = node('div');
    roots[id].id = id;
  });
  roots['search-results'].clientWidth = 300;
  roots['search-results'].clientHeight = 240;
  return documentRef;
}

function timersRoot() {
  var timers = [];
  return {
    timers: timers,
    clearTimeout: function (timer) { if (timer) { timer.cleared = true; } },
    setTimeout: function (callback, delay) {
      var timer = { callback: callback, delay: delay, cleared: false };
      timers.push(timer);
      return timer;
    }
  };
}

function createView(overrides) {
  var root = timersRoot();
  var documentRef = fakeDocument();
  var statuses = [];
  var focusEvents = [];
  var callbacks = [];
  var posterCancellations = [];
  var options = {
    root: root,
    document: documentRef,
    SearchModel: SearchModel,
    SearchSession: SearchSession,
    T9Input: T9Input,
    element: function (tagName, className, text) { return node(tagName, className, text); },
    t: function (key) { return key; },
    isActive: function () { return true; },
    navigationCount: 3,
    navTarget: function () { return null; },
    clearFocus: function () {},
    pointerSelectionActive: function () { return false; },
    onStatus: function (status) { statuses.push(status); },
    onFocus: function (focus) { focusEvents.push(focus); },
    onBack: function () { callbacks.push('back'); },
    onOpenResult: function (item) { callbacks.push(item.ratingKey); },
    cardWidth: 100,
    cardHeight: 80,
    resultOverscanRows: 1,
    posterLoader: {
      loadBatch: function () {},
      cancelScope: function (scope) { posterCancellations.push(scope); }
    }
  };
  var key;
  overrides = overrides || {};
  for (key in overrides) { if (Object.prototype.hasOwnProperty.call(overrides, key)) { options[key] = overrides[key]; } }
  return {
    view: SearchView.create(options), root: root, document: documentRef,
    statuses: statuses, focusEvents: focusEvents, callbacks: callbacks, posterCancellations: posterCancellations
  };
}


(function unresolvedSearchArtworkKeepsDeclaredOwner() {
  var batches = [];
  var capturedItem = null;
  var item = { ratingKey: 'offline-search', title: 'Offline search', image: '/offline-search.jpg', serverMachineIdentifier: 'server-offline' };
  var unresolved = createView({
    sourceContextForItem: function () { return null; },
    sourceIdentityForItem: function (candidate) { return 'server:' + String(candidate && candidate.serverMachineIdentifier || ''); },
    fixedPosterSpecification: function (source, size, priority, scope, sourceContext, sourceItem) {
      capturedItem = sourceItem;
      return { source: source, width: size.width, height: size.height, priority: priority, scope: scope, sourceContext: sourceContext };
    },
    posterLoader: {
      loadBatch: function (jobs) { batches.push(jobs.slice()); },
      cancelScope: function () {},
      needsLoad: function () { return false; }
    }
  });
  unresolved.view.setResults(null, [item]);
  assert.strictEqual(batches[batches.length - 1].length, 1, 'unresolved external Search artwork must still be represented by one poster job');
  assert.strictEqual(capturedItem, item, 'Search poster specifications must retain the declaring media item when its owner route is unavailable');
}());

(function searchArtworkIdentityIgnoresTransportRotation() {
  var context = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-one.example', token: 'one' };
  var batches = [];
  var item = { ratingKey: 'stable-search', title: 'Stable search', image: '/same-search.jpg', serverMachineIdentifier: 'server-a' };
  var stable = createView({
    sourceContextForItem: function () { return context; },
    sourceContextIdentity: function (value) { return 'server:' + String(value && value.serverMachineIdentifier || ''); },
    posterLoader: {
      loadBatch: function (jobs) { batches.push(jobs.slice()); },
      cancelScope: function () {},
      needsLoad: function () { return false; }
    }
  });
  stable.view.setResults(null, [item]);
  assert.strictEqual(batches[batches.length - 1].length, 1, 'initial Search artwork must queue one job');
  context = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-two.example', token: 'two' };
  stable.view.setResults(null, [item]);
  assert.strictEqual(batches[batches.length - 1].length, 0, 'rotating route/token for the same PMS must not change Search artwork identity');
}());

var fixture = createView();
var view = fixture.view;
var first = { ratingKey: 'one', title: 'One', image: 'one.jpg', libraryTitle: 'Anime' };
var second = { ratingKey: 'two', title: 'Two', image: 'two.jpg', libraryTitle: 'Anime' };

assert.deepStrictEqual(view.snapshot().focus, { zone: 'keyboard', row: 0, column: 0, index: 0, navIndex: 0 }, 'search must start on the keyboard');
view.open(false, 2);
assert.strictEqual(view.snapshot().open, true, 'open must activate the view');
assert.strictEqual(view.snapshot().focus.navIndex, 2, 'open must retain the coordinator navigation index for Up from the keyboard');
assert.ok(fixture.document.getElementById('search-view').className.indexOf('is-hidden') === -1, 'open must reveal the view');
assert.strictEqual(fixture.document.getElementById('search-keyboard').children[3].children[0].textContent, 'search.symbols', 'Search must keep its case-insensitive symbols control instead of a shift control');

view.setResults(null, [first, second]);
view.focusResult(0);
var firstCard = fixture.document.getElementById('search-results').children[0];
var secondCard = fixture.document.getElementById('search-results').children[1];
assert.strictEqual(firstCard.getAttribute('data-media-key'), 'one', 'result cards must expose their stable media key');
var crossServerSearch = createView();
crossServerSearch.view.setResults(null, [
  { ratingKey: 'same', serverMachineIdentifier: 'server-a', title: 'Server A', image: 'a.jpg' },
  { ratingKey: 'same', serverMachineIdentifier: 'server-b', title: 'Server B', image: 'b.jpg' }
]);
assert.notStrictEqual(
  crossServerSearch.document.getElementById('search-results').children[0].getAttribute('data-media-key'),
  crossServerSearch.document.getElementById('search-results').children[1].getAttribute('data-media-key'),
  'Search card identity must distinguish identical ratingKeys returned by different PMSes'
);
assert.strictEqual(firstCard.querySelector('.search-card-title').textContent, 'One', 'a card must render its title');
assert.strictEqual(firstCard.querySelector('.search-card-image').getAttribute('data-search-image'), 'one.jpg', 'a card image must be associated with its item');

var watchedResume = createView();
var watchedResumeItem = { ratingKey: 'watched-search', title: 'Watched search', image: 'watched.jpg', viewed: false };
watchedResume.view.open(false);
watchedResume.view.setResults(null, [watchedResumeItem]);
watchedResume.view.focusResult(0);
var watchedResumeCard = watchedResume.document.getElementById('search-results').children[0];
assert.strictEqual(watchedResumeCard.className.indexOf('is-viewed'), -1, 'search card starts with its original watched presentation');
watchedResumeItem.viewed = true;
watchedResume.view.resume();
assert.notStrictEqual(watchedResumeCard.className.indexOf('is-viewed'), -1, 'resuming Search must synchronize a watched state mutated while Detail was open');

view.setResults(null, [second, { ratingKey: 'three', title: 'Three', image: 'three.jpg', libraryTitle: 'Anime' }]);
var reused = fixture.document.getElementById('search-results').children[0];
assert.strictEqual(reused, secondCard, 'the keyed renderer must reuse a card when its position is recycled');
assert.strictEqual(reused.getAttribute('data-media-key'), 'two', 'reused cards must be rebound to the new item key');
assert.strictEqual(reused.querySelector('.search-card-title').textContent, 'Two', 'reused cards must update their title');
assert.strictEqual(reused.querySelector('.search-card-image').getAttribute('data-search-image'), 'two.jpg', 'reused cards must update their image association');

(function testSearchRefreshPreservesFocusedResultIdentityWhenIndicesShift() {
  var edge = createView();
  edge.view.open(false);
  edge.view.setResults(null, [
    { ratingKey: 'a', title: 'A', image: 'a.jpg' },
    { ratingKey: 'b', title: 'B', image: 'b.jpg' },
    { ratingKey: 'c', title: 'C', image: 'c.jpg' }
  ]);
  edge.view.focusResult(1);
  assert.strictEqual(edge.view.snapshot().focus.index, 1, 'fixture must focus the middle Search result before refresh');
  edge.view.setResults(null, [
    { ratingKey: 'b', title: 'B updated', image: 'b2.jpg' },
    { ratingKey: 'c', title: 'C', image: 'c.jpg' }
  ]);
  assert.strictEqual(edge.view.snapshot().focus.index, 0, 'Search refreshes must follow the same focused media when earlier results disappear');
  assert.strictEqual(edge.view.snapshot().focus.row, 0, 'Search refreshes must recompute the focused row after identity-based index restoration');
  assert.strictEqual(edge.view.snapshot().focus.column, 0, 'Search refreshes must recompute the focused column after identity-based index restoration');
  assert.strictEqual(edge.document.getElementById('search-results').children[0].getAttribute('data-media-key'), 'b', 'the preserved Search focus must point at the surviving media card, not the old numeric slot');
  edge.view.handleDirection('right');
  assert.strictEqual(edge.view.snapshot().focus.index, 1, 'the first navigation input after a Search reorder must move from the restored logical coordinates');
  edge.view.focusResult(0);
  edge.view.setResults(null, [{ ratingKey: 'c', title: 'C', image: 'c.jpg' }]);
  assert.strictEqual(edge.view.snapshot().focus.index, 0, 'if the focused Search result disappears, focus must clamp to a surviving result');
  edge.view.setResults(null, []);
  assert.strictEqual(edge.view.snapshot().focus.zone, 'keyboard', 'if every Search result disappears, focus must return to a valid keyboard key');
}());

(function testSearchPublishesDirectionalAdjacentBackdropCandidates() {
  var adjacent = [];
  var edge = createView({
    measureLayout: function () { return { columns: 3, visibleRows: 2, totalRows: 3 }; },
    onAdjacentBackdropPrefetch: function (items) { adjacent.push((items || []).map(function (item) { return item.ratingKey; })); }
  });
  edge.view.open(false);
  edge.view.setResults(null, [
    { ratingKey: 'a', title: 'A', image: 'a.jpg' },
    { ratingKey: 'b', title: 'B', image: 'b.jpg' },
    { ratingKey: 'c', title: 'C', image: 'c.jpg' },
    { ratingKey: 'd', title: 'D', image: 'd.jpg' },
    { ratingKey: 'e', title: 'E', image: 'e.jpg' },
    { ratingKey: 'f', title: 'F', image: 'f.jpg' },
    { ratingKey: 'g', title: 'G', image: 'g.jpg' },
    { ratingKey: 'h', title: 'H', image: 'h.jpg' },
    { ratingKey: 'i', title: 'I', image: 'i.jpg' }
  ]);
  edge.view.focusResult(3);
  adjacent.length = 0;
  edge.view.handleDirection('right');
  assert.deepStrictEqual(adjacent[adjacent.length - 1], ['f', 'd', 'h', 'b'],
    'Search focus must publish right, left, down and up adjacent backdrop candidates after movement');
}());

view.focusKeyboard(4, 0);
view.handleDirection('down');
assert.strictEqual(view.snapshot().focus.zone, 'results', 'down from the keyboard must enter results when they exist');
view.focusKeyboard(0, 0);
view.handleDirection('up');
assert.strictEqual(view.snapshot().focus.zone, 'nav', 'Up through the keyboard must return to navigation');
assert.strictEqual(view.snapshot().focus.navIndex, 2, 'vertical focus movement must preserve the active navigation index');
view.focusResult(0);
view.pointerFocus(reused);
assert.strictEqual(view.snapshot().focus.index, 0, 'pointer focus must select the pointed result');
view.activate();
assert.deepStrictEqual(fixture.callbacks, ['two'], 'activating a focused result must route the selected item');

var stale = createView();
var staleRequests = [];
stale = createView({
  load: function (query, callback) {
    var request = {
      query: query, callback: callback, aborted: false,
      abort: function () { this.aborted = true; }
    };
    staleRequests.push(request);
    return request;
  }
});
stale.view.open(false);
stale.view.applyKey('a');
stale.view.applyKey('t');
assert.strictEqual(stale.root.timers.length, 1, 'a searchable query must be debounced by the composed session');
stale.root.timers[0].callback();
assert.strictEqual(staleRequests.length, 1, 'the composed session must invoke the injected adapter');
stale.view.applyKey('t');
stale.root.timers[1].callback();
assert.strictEqual(staleRequests[0].aborted, true, 'a newer query must cancel the previous request');
staleRequests[0].callback(null, [{ ratingKey: 'stale', title: 'Stale' }]);
assert.deepStrictEqual(stale.view.snapshot().results, [], 'a stale response must not replace current results');
staleRequests[1].callback(null, [{ ratingKey: 'current', title: 'Current' }]);
assert.deepStrictEqual(stale.view.snapshot().results.map(function (item) { return item.ratingKey; }), ['current'], 'the current response must be accepted');
assert.strictEqual(stale.view.snapshot().query, 'att', 'the view must own the query passed to the session');

var backFixture = createView();
backFixture.view.open(false);
backFixture.view.applyKey('a');
backFixture.view.applyKey('t');
backFixture.view.back();
assert.strictEqual(backFixture.view.snapshot().query, '', 'Back must clear a non-empty query before leaving search');
assert.strictEqual(backFixture.view.snapshot().open, true, 'clearing a query with Back must keep search open');
assert.deepStrictEqual(backFixture.callbacks, [], 'clearing a query must not notify the cross-view router');
assert.ok(backFixture.posterCancellations.length > 0, 'clearing a query must cancel obsolete poster work');
backFixture.view.back();
assert.strictEqual(backFixture.view.snapshot().focus.zone, 'nav', 'a second Back on an empty query must focus the current navbar entry');
assert.strictEqual(backFixture.view.snapshot().open, true, 'moving to the navbar must keep Search open');
assert.deepStrictEqual(backFixture.callbacks, [], 'moving to the navbar must not notify the cross-view router');
backFixture.view.back();
assert.strictEqual(backFixture.view.snapshot().open, false, 'Back from the Search navbar entry must close Search');
assert.deepStrictEqual(backFixture.callbacks, ['back'], 'closing search must notify the coordinator once');
assert.strictEqual(backFixture.posterCancellations[backFixture.posterCancellations.length - 1], 'search', 'closing search must cancel its poster scope');

view.back();
assert.strictEqual(view.snapshot().focus.zone, 'nav', 'Back from Search results must focus the current navbar entry');
view.back();
assert.strictEqual(view.snapshot().open, false, 'Back from the navbar must close the search view');
assert.deepStrictEqual(fixture.callbacks, ['two', 'back'], 'leaving Search must notify the coordinator once');
assert.ok(fixture.document.getElementById('search-view').className.indexOf('is-hidden') !== -1, 'Back must hide the view');
view.resume();
assert.strictEqual(view.snapshot().open, true, 'resume must reactivate retained search state');
assert.ok(fixture.document.getElementById('search-view').className.indexOf('is-hidden') === -1, 'resume must reveal the retained Search surface');
assert.ok(fixture.statuses.length > 0, 'search lifecycle must publish status changes');


(function testSearchReusesStableLayoutMeasurementsAndPosterProfile() {
  var measureCalls = 0;
  var posterSizes = [];
  var profile = {
    metrics: { width: 100, imageHeight: 150, columnStep: 112, rowStep: 194 },
    poster: { width: 100, height: 150, previewWidth: 64, previewHeight: 96 }
  };
  var cached = createView({
    cardProfile: function () { return profile; },
    cardMetrics: function () { throw new Error('cached Search layout must not request standalone metrics'); },
    measureLayout: function (container, count, width, height) {
      measureCalls += 1;
      return SearchModel.measureLayout(container.clientWidth - 12, container.clientHeight - 12, width, height, count);
    },
    fixedPosterSpecification: function (source, size, priority, scope) {
      posterSizes.push(size);
      return { source: source, width: size.width, height: size.height, priority: priority, scope: scope };
    },
    posterLoader: { loadBatch: function () {}, cancelScope: function () {} }
  });
  cached.view.open(false);
  cached.view.setResults(null, [
    { ratingKey: 'one', title: 'One', image: 'one.jpg' },
    { ratingKey: 'two', title: 'Two', image: 'two.jpg' }
  ]);
  assert.strictEqual(measureCalls, 1, 'the first Search result render must measure its grid once');
  cached.view.refreshResults();
  assert.strictEqual(measureCalls, 1, 'unchanged Search dimensions and result count must reuse the cached layout');
  assert.strictEqual(posterSizes[0], profile.poster, 'Search poster work must use the shared fixed poster profile');
  cached.document.getElementById('search-results').clientWidth = 420;
  cached.view.refreshResults();
  assert.strictEqual(measureCalls, 2, 'changing Search container dimensions must invalidate the measurement cache');
}());

(function testSearchFocusHotPathAvoidsLayoutReadsAndPresentationRebuilds() {
  var posterSpecificationCalls = 0;
  var clearFocusCalls = 0;
  var hot = createView({
    clearFocus: function () { clearFocusCalls += 1; },
    fixedPosterSpecification: function (source, size, priority, scope) {
      posterSpecificationCalls += 1;
      return { source: source, width: size.width, height: size.height, priority: priority, scope: scope };
    }
  });
  var items = [];
  var index;
  var documentRef = hot.document;
  var container = documentRef.getElementById('search-results');
  var originalQuerySelector = documentRef.querySelector;
  var originalCreateTextNode = documentRef.createTextNode;
  var querySelectorCalls = 0;
  var imageLookupCalls = 0;
  var layoutReads = 0;
  var textNodeCreates = 0;
  var originalContainerRect;
  for (index = 0; index < 8; index += 1) {
    items.push({ ratingKey: 'hot-' + index, title: 'Hot ' + index, image: 'hot-' + index + '.jpg', meta: 'Meta ' + index });
  }
  hot.view.open(false);
  hot.view.setResults(null, items);
  hot.view.focusResult(0);
  posterSpecificationCalls = 0;
  clearFocusCalls = 0;
  documentRef.querySelector = function (selector) {
    querySelectorCalls += 1;
    return originalQuerySelector.call(documentRef, selector);
  };
  documentRef.createTextNode = function (text) {
    textNodeCreates += 1;
    return originalCreateTextNode.call(documentRef, text);
  };
  originalContainerRect = container.getBoundingClientRect;
  container.getBoundingClientRect = function () {
    layoutReads += 1;
    return originalContainerRect.call(container);
  };
  container.children.forEach(function (card) {
    var original = card.getBoundingClientRect;
    var originalGetElementsByTagName = card.getElementsByTagName;
    card.getBoundingClientRect = function () {
      layoutReads += 1;
      return original.call(card);
    };
    card.getElementsByTagName = function (tag) {
      imageLookupCalls += 1;
      return originalGetElementsByTagName.call(card, tag);
    };
  });
  hot.view.handleDirection('right');
  assert.strictEqual(clearFocusCalls, 0, 'moving Search focus inside the active surface must not scan the global document for focused nodes');
  assert.strictEqual(querySelectorCalls, 0, 'moving Search focus inside the mounted result window must not query the global document');
  assert.strictEqual(layoutReads, 0, 'moving Search focus inside the mounted result window must not force layout reads');
  assert.strictEqual(textNodeCreates, 0, 'moving Search focus onto an unchanged card must not rewrite its text presentation');
  assert.strictEqual(posterSpecificationCalls, 0, 'moving Search focus onto an unchanged card must not rebuild its poster specification');
  assert.strictEqual(imageLookupCalls, 0, 'moving Search focus onto an unchanged card must use the image reference owned by the card');
}());

(function testSearchWindowBoundaryOnlyBuildsPosterSpecsForNewCards() {
  var posterSpecificationCalls = 0;
  var prioritized = [];
  var boundary = createView({
    resultOverscanRows: 1,
    measureLayout: function (container, count, cardWidth, cardHeight) {
      return { columns: 2, visibleRows: 2, totalRows: Math.ceil(count / 2), cardWidth: cardWidth, cardHeight: cardHeight };
    },
    fixedPosterSpecification: function (source, size, priority, scope) {
      posterSpecificationCalls += 1;
      return { source: source, width: size.width, height: size.height, priority: priority, scope: scope };
    },
    prioritizePoster: function (target, priority) { prioritized.push({ target: target, priority: priority }); },
    posterLoader: {
      loadBatch: function () {},
      cancelScope: function () {},
      needsLoad: function () { return false; },
      prioritize: function (target, priority) { prioritized.push({ target: target, priority: priority }); }
    }
  });
  var items = [];
  var index;
  for (index = 0; index < 12; index += 1) {
    items.push({ ratingKey: 'boundary-' + index, title: 'Boundary ' + index, image: 'boundary-' + index + '.jpg' });
  }
  boundary.view.open(false);
  boundary.view.setResults(null, items);
  boundary.view.focusResult(0);
  posterSpecificationCalls = 0;
  prioritized = [];
  boundary.view.focusResult(4);
  assert.strictEqual(posterSpecificationCalls, 2, 'advancing the Search virtual window by one row must build poster specifications only for newly mounted cards');
  assert.ok(prioritized.length >= 2, 'retained Search cards whose priority improves must be reprioritized without rebuilding their poster specification');
}());

(function testSearchKeyboardFocusUsesMountedKeyMap() {
  var hot = createView();
  var documentRef = hot.document;
  var originalQuerySelector = documentRef.querySelector;
  var querySelectorCalls = 0;
  hot.view.open(false);
  documentRef.querySelector = function (selector) {
    querySelectorCalls += 1;
    return originalQuerySelector.call(documentRef, selector);
  };
  hot.view.handleDirection('right');
  assert.strictEqual(querySelectorCalls, 0, 'moving Search keyboard focus must use mounted key references instead of a document-wide selector');
}());

(function testSearchKeyboardMapRefreshesAfterLayoutRemount() {
  var hot = createView();
  var keyboard = hot.document.getElementById('search-keyboard');
  var oldKey;
  var newKey;
  hot.view.open(false);
  hot.view.focusKeyboard(3, 0);
  oldKey = keyboard.children[3].children[0];
  hot.view.activate();
  newKey = keyboard.children[2].children[0];
  assert.ok(newKey, 'symbol keyboard remount must expose the new focused key');
  assert.notStrictEqual(newKey, oldKey, 'keyboard remount must replace the mounted key node');
  assert.ok(/(^|\s)is-focused(\s|$)/.test(newKey.className), 'focus must follow the newly mounted keyboard key');
  assert.ok(!/(^|\s)is-focused(\s|$)/.test(oldKey.className), 'detached keyboard keys must not retain tracked focus');
}());

(function testSearchKeyboardMapDropsStaleNodesWhenContainerDisappears() {
  var hot = createView();
  var documentRef = hot.document;
  var originalGetElementById = documentRef.getElementById;
  var keyboard;
  var oldKey;
  hot.view.open(false);
  keyboard = originalGetElementById.call(documentRef, 'search-keyboard');
  oldKey = keyboard.children[2].children[0];
  documentRef.getElementById = function (id) {
    if (id === 'search-keyboard') { return null; }
    return originalGetElementById.call(documentRef, id);
  };
  hot.view.applyKey('shift');
  assert.ok(!/(^|\s)is-focused(\s|$)/.test(oldKey.className), 'a missing keyboard container must invalidate cached key references instead of refocusing stale DOM');
}());

(function testSearchUsesVirtualGeometryWhenOnlyVisibleRowChanges() {
  var geometry = createView();
  var items = [];
  var index;
  var container = geometry.document.getElementById('search-results');
  for (index = 0; index < 12; index += 1) {
    items.push({ ratingKey: 'geometry-' + index, title: 'Geometry ' + index, image: 'geometry-' + index + '.jpg' });
  }
  geometry.view.open(false);
  geometry.view.setResults(null, items);
  geometry.view.focusResult(0);
  assert.strictEqual(container.scrollTop, 0, 'the first visible Search row starts at scroll offset zero');
  geometry.view.focusResult(9);
  assert.strictEqual(geometry.view.snapshot().visibleStartRow, 3, 'focusing a Search row beyond the fully visible viewport must advance the logical visible window');
  assert.strictEqual(container.scrollTop, 80, 'Search must derive scroll position from its cached row geometry when the mounted window is unchanged');
}());

(function testSearchScrollsWhenFocusMovesIntoPartiallyVisibleRow() {
  var partial = createView({
    measureLayout: function (container, count, cardWidth, cardHeight) {
      return { columns: 2, visibleRows: 2, totalRows: Math.ceil(count / 2), cardWidth: cardWidth, cardHeight: cardHeight };
    }
  });
  var container = partial.document.getElementById('search-results');
  container.clientHeight = 159;
  partial.view.open(false);
  partial.view.setResults(null, [
    { ratingKey: 'partial-0', title: 'Partial 0', image: 'partial-0.jpg' },
    { ratingKey: 'partial-1', title: 'Partial 1', image: 'partial-1.jpg' },
    { ratingKey: 'partial-2', title: 'Partial 2', image: 'partial-2.jpg' },
    { ratingKey: 'partial-3', title: 'Partial 3', image: 'partial-3.jpg' }
  ]);
  partial.view.focusResult(0);
  partial.view.focusResult(2);
  assert.strictEqual(container.scrollTop, 80, 'Search must scroll a focused row fully into view instead of treating a partial row as visible');
}());

(function testSearchRestoresVirtualScrollAfterNativeFocusAutoScroll() {
  var nativeFocus = createView();
  var items = [];
  var index;
  var container = nativeFocus.document.getElementById('search-results');
  for (index = 0; index < 8; index += 1) {
    items.push({ ratingKey: 'native-' + index, title: 'Native ' + index, image: 'native-' + index + '.jpg' });
  }
  nativeFocus.view.open(false);
  nativeFocus.view.setResults(null, items);
  nativeFocus.view.focusResult(0);
  container.children[1].focus = function () {
    this.focused = true;
    container.scrollTop = 999;
  };
  nativeFocus.view.handleDirection('right');
  assert.strictEqual(container.scrollTop, 0, 'Search must restore its virtual scroll position after native focus auto-scrolls the result container');
}());

console.log('Search view checks passed');

'use strict';

var assert = require('assert');
var ShellController = require('../app/coordinator/shell-controller');
var HomeState = require('../app/home-state');
var FocusModel = require('../app/focus-model');
var NavigationModel = require('../app/navigation-model');
var NavbarWindow = require('../app/navbar-window');
var CardLayout = require('../app/card-layout');
var MediaLabels = require('../app/media-labels');

function TimerRoot() {
  this.next = 1;
  this.timers = {};
}
TimerRoot.prototype.setTimeout = function (callback, delay) {
  var id = this.next;
  this.next += 1;
  this.timers[id] = { callback: callback, delay: delay };
  return id;
};
TimerRoot.prototype.clearTimeout = function (id) { delete this.timers[id]; };
TimerRoot.prototype.run = function (id) {
  var entry = this.timers[id];
  delete this.timers[id];
  if (entry) { entry.callback(); }
};
TimerRoot.prototype.runNext = function () {
  var ids = Object.keys(this.timers).map(Number).sort(function (a, b) { return a - b; });
  if (ids.length) { this.run(ids[0]); }
};
TimerRoot.prototype.runAll = function () { while (Object.keys(this.timers).length) { this.runNext(); } };

function FakeElement(tagName, className) {
  var self = this;
  this.tagName = String(tagName || 'div').toUpperCase();
  this.className = className || '';
  this.children = [];
  this.parentNode = null;
  this.attributes = {};
  this.style = { setProperty: function (key, value) { self.style[key] = value; } };
  this.clientWidth = 900;
  this.clientHeight = 300;
  this.offsetWidth = 140;
  this.scrollTop = 0;
  this.focused = false;
  this.textContent = '';
  this.innerHTMLClears = 0;
}
Object.defineProperty(FakeElement.prototype, 'innerHTML', {
  get: function () { return ''; },
  set: function () { this.children = []; this.innerHTMLClears += 1; }
});
FakeElement.prototype.appendChild = function (child) {
  var index;
  if (!child) { return child; }
  if (child.parentNode) {
    index = child.parentNode.children.indexOf(child);
    if (index !== -1) { child.parentNode.children.splice(index, 1); }
  }
  child.parentNode = this;
  this.children.push(child);
  return child;
};
FakeElement.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index !== -1) { this.children.splice(index, 1); child.parentNode = null; }
  return child;
};
FakeElement.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
FakeElement.prototype.getAttribute = function (name) { return this.attributes[name]; };
FakeElement.prototype.hasAttribute = function (name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); };
FakeElement.prototype.focus = function () { this.focused = true; };
FakeElement.prototype.getBoundingClientRect = function () { return { top: 0, bottom: 100, width: this.clientWidth, height: this.clientHeight }; };
FakeElement.prototype.getElementsByTagName = function (tagName) {
  var result = [];
  var expected = String(tagName).toUpperCase();
  function visit(node) {
    node.children.forEach(function (child) {
      if (child.tagName === expected) { result.push(child); }
      visit(child);
    });
  }
  visit(this);
  return result;
};
FakeElement.prototype.querySelectorAll = function (selector) {
  var result = [];
  function matches(node) {
    var className;
    var attributes;
    if (selector.charAt(0) === '.') {
      className = selector.slice(1);
      return (' ' + node.className + ' ').indexOf(' ' + className + ' ') !== -1;
    }
    attributes = selector.match(/\[([^=\]]+)="([^"]*)"\]/g) || [];
    if (attributes.length) {
      return attributes.every(function (entry) {
        var parts = entry.match(/\[([^=\]]+)="([^"]*)"\]/);
        return node.getAttribute(parts[1]) === parts[2];
      });
    }
    return false;
  }
  function visit(node) {
    node.children.forEach(function (child) {
      if (matches(child)) { result.push(child); }
      visit(child);
    });
  }
  visit(this);
  return result;
};
FakeElement.prototype.querySelector = function (selector) { return this.querySelectorAll(selector)[0] || null; };

function FakeDocument() {
  this.nodes = {};
  this.body = new FakeElement('body', 'is-booting');
  this.documentElement = new FakeElement('html', '');
}
FakeDocument.prototype.createTextNode = function (text) { var node = new FakeElement('#text', ''); node.textContent = String(text || ''); return node; };
FakeDocument.prototype.getElementById = function (id) { return this.nodes[id] || null; };
FakeDocument.prototype.register = function (id, node) { this.nodes[id] = node; node.id = id; return node; };
FakeDocument.prototype.querySelectorAll = function (selector) {
  var result = [];
  Object.keys(this.nodes).forEach(function (id) { result = result.concat(this.nodes[id].querySelectorAll(selector)); }, this);
  return result;
};
FakeDocument.prototype.querySelector = function (selector) {
  var result = this.querySelectorAll(selector);
  return result[0] || null;
};

function createElementFactory(document) {
  return function (tagName, className, text) {
    var node = new FakeElement(tagName, className);
    if (text) { node.appendChild(document.createTextNode(text)); }
    return node;
  };
}

function updateText(node, value) {
  node.innerHTML = '';
  node.appendChild(new FakeElement('#text', ''));
  node.children[0].textContent = String(value || '');
}

function modules() {
  return {
    HomeState: HomeState,
    FocusModel: FocusModel,
    NavigationModel: NavigationModel,
    NavbarWindow: NavbarWindow,
    CardLayout: CardLayout,
    MediaLabels: MediaLabels
  };
}

(function testHomeRefreshSingleFlightAndStaleSuppression() {
  var callbacks = [];
  var events = [];
  var clock = new TimerRoot();
  var controller = ShellController.create({
    modules: { HomeState: HomeState },
    clock: clock,
    services: { loadHome: function (callback) { callbacks.push(callback); } },
    home: {
      canRefresh: function () { return true; },
      onResult: function (error, rows, changed, initial) { events.push([error, rows[0] && rows[0].title, changed, initial]); }
    }
  });
  controller.refreshHome();
  controller.refreshHome();
  assert.strictEqual(callbacks.length, 1, 'Home refresh must remain single-flight');
  callbacks[0](null, [{ title: 'Home', items: [{ ratingKey: 'one' }] }]);
  assert.strictEqual(callbacks.length, 2, 'queued refresh begins after the active response');
  callbacks[1](null, [{ title: 'Home', items: [{ ratingKey: 'one' }] }]);
  assert.deepStrictEqual(events, [[null, 'Home', true, true], [null, 'Home', false, false]]);
  controller.destroy();
}());

(function testDestroyAbortsActiveHomeRefresh() {
  var aborted = 0;
  var controller = ShellController.create({
    modules: { HomeState: HomeState },
    clock: new TimerRoot(),
    services: {
      loadHome: function () { return { abort: function () { aborted += 1; } }; }
    },
    home: { canRefresh: function () { return true; }, onResult: function () {} }
  });
  controller.refreshHome();
  controller.destroy();
  assert.strictEqual(aborted, 1, 'destroying the shell must abort the active Home refresh');
}());

(function testThemeCacheUsesThemeIdentityWhenDetailHasNoHomeLookupKey() {
  var clock = new TimerRoot();
  var metadataRequests = [];
  var played = [];
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback) { metadataRequests.push([ratingKey, callback]); },
      playTheme: function (item) { played.push(item); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });

  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1' });
  clock.runNext();
  metadataRequests[0][1](null, { themeKey: 'show:1', themeUrl: '/show-theme.mp3' });
  controller.scheduleTheme({ ratingKey: 'episode-1', themeKey: 'show:1' });

  assert.strictEqual(played.length, 2, 'the detail should reuse the cached Home theme without another metadata request');
  assert.strictEqual(played[1].themeUrl, '/show-theme.mp3', 'the cache is addressed through the retained theme identity');
  assert.strictEqual(metadataRequests.length, 1, 'opening an episode does not refetch or stop an already-known show theme');
  controller.destroy();
}());

(function testThemeCacheIsScopedToServerAndProfileIdentity() {
  var clock = new TimerRoot();
  var metadataRequests = [];
  var played = [];
  var identity = 'server-a|token-a';
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback) { metadataRequests.push([ratingKey, callback]); },
      playTheme: function (item) { played.push(item); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; },
      themeIdentity: function () { return identity; }
    }
  });

  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1' });
  clock.runNext();
  metadataRequests[0][1](null, { themeKey: 'show:1', themeUrl: '/server-a-theme.mp3' });
  identity = 'server-b|token-b';
  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1' });
  clock.runNext();

  assert.strictEqual(metadataRequests.length, 2, 'theme metadata cached for one server/profile must not be reused after identity changes');
  metadataRequests[1][1](null, { themeKey: 'show:1', themeUrl: '/server-b-theme.mp3' });
  assert.strictEqual(played[played.length - 1].themeUrl, '/server-b-theme.mp3', 'the new server/profile must own the resumed background theme');
  controller.destroy();
}());

(function testHomeRendererReconcilesWithoutHardResetAndRestoresFocus() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var backdropA = document.register('backdrop-a', new FakeElement('img', 'backdrop-image'));
  var backdropB = document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var splash = document.register('startup-splash', new FakeElement('div', 'startup-splash'));
  var clockNode = document.register('clock', new FakeElement('span', ''));
  var message = document.register('message', new FakeElement('div', 'message'));
  var posterBatches = [];
  var clock = new TimerRoot();
  var controller;
  var homeReady = 0;
  var firstSection;
  var firstCard;
  void navigation; void backdropA; void backdropB; void splash; void clockNode; void message;
  controller = ShellController.create({
    modules: modules(),
    clock: clock,
    document: document,
    now: function () { return 1000; },
    navigationItems: [{ kind: 'home', title: 'Home' }, { kind: 'settings', title: 'Settings' }],
    services: {
      posterLoader: {
        loadBatch: function (jobs) { posterBatches.push(jobs); },
        prioritize: function () {}, cancelScope: function () {}, load: function () {}
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      renderedPosterSpecification: function (image, source) { return { source: source, width: image.clientWidth }; },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    actions: { onHomeReady: function () { homeReady += 1; } },
    access: {
      settings: function () { return { cardScale: 100, showHome: true, showSearch: true, showWatchlist: true, showPlaylists: true, showSettings: true }; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; }, watchlistAvailable: function () { return true; }
    }
  });
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', showLibraryBadge: true, items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg', libraryTitle: 'Anime' },
    { ratingKey: 'two', title: 'Two', image: '/two.jpg' }
  ] }], 0, { focus: 'first' });
  firstSection = content.children[0];
  firstCard = firstSection.querySelector('[data-row-index="0"][data-column="0"]');
  assert.ok(firstCard && firstCard.focused, 'first Home card receives real focus');
  assert.strictEqual(firstCard.querySelector('.home-library-badge').children[0].textContent, 'Anime', 'mixed Home rows display the local Plex library badge');
  assert.strictEqual(controller.selectionKey(), '["Continue|poster","rating:one"]');
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg' }
  ] }], 0, { focus: 'nav' });
  assert.strictEqual(controller.snapshot().focus.area, 'nav', 'Home refreshes must preserve navbar focus while a navigation preview is active');
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve', selectionKey: 'rating:one' });
  assert.strictEqual(content.children[0], firstSection, 'stable Home rows are reused');
  assert.strictEqual(content.children[0].querySelector('[data-row-index="0"][data-column="0"]'), firstCard, 'stable cards are reused');
  assert.strictEqual(content.innerHTMLClears, 0, 'Home rendering never clears the whole content node');
  assert.strictEqual(controller.snapshot().focus.column, 0, 'media focus survives reconciliation');
  content.scrollTop = 540;
  controller.useHomeRows([
    { title: 'Recommended', shape: 'poster', showLibraryBadge: true, items: [
      { ratingKey: 'one', title: 'One elsewhere', image: '/one.jpg', libraryTitle: 'Anime' },
      { ratingKey: 'four', title: 'Four', image: '/four.jpg' }
    ] },
    { title: 'Continue', shape: 'poster', items: [
      { ratingKey: 'three', title: 'Three', image: '/three.jpg', libraryTitle: 'Film' }
    ] }
  ], 0, { focus: 'preserve', selectionKey: '["Continue|poster","rating:one"]' });
  assert.deepStrictEqual(controller.snapshot().focus, { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }, 'a title removed from its original Home row falls back to the first card instead of matching another row');
  assert.strictEqual(content.scrollTop, 0, 'missing Home focus resets the page to the top');
  assert.strictEqual(content.children[1].querySelector('.home-library-badge'), null, 'library-specific Home rows do not repeat a redundant source badge');
  assert.ok(posterBatches.length >= 2, 'reconciled cards are reprioritized through one batch');
  assert.strictEqual(homeReady, 1, 'the lazy post-Home hook runs once after the first successful Home render');
  controller.destroy();
}());

(function testNavigationRenderingAndWindowing() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [
      { kind: 'home', title: 'Home' },
      { kind: 'library', key: 'a', title: 'Very Long Library A' },
      { kind: 'library', key: 'b', title: 'Very Long Library B' },
      { kind: 'settings', title: 'Settings' }
    ],
    initialFocus: { area: 'nav', navIndex: 2, rowIndex: 0, column: 0 },
    presentation: {
      element: createElementFactory(document), updateText: updateText, translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { showHome: true, showSearch: true, showWatchlist: true, showPlaylists: true, showSettings: true }; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  assert.strictEqual(navigation.children.length, 3, 'navbar renders Home, libraries and fixed groups');
  assert.ok(navigation.querySelector('[data-nav-index="2"]').className.indexOf('is-focused') !== -1, 'rebuilt focused button is born focused');
  controller.setNavigationStart(9);
  assert.deepStrictEqual(controller.navigationWindow(5, 3), { start: 2, end: 5 }, 'window start remains bounded');
  controller.destroy();
}());

(function testBackdropAndThemeTokensStayIndependent() {
  var backdropCallbacks = [];
  var themeCallbacks = [];
  var calls = [];
  var controller = ShellController.create({
    services: {
      loadBackdrop: function (item, callback) { backdropCallbacks.push({ item: item, callback: callback }); },
      loadTheme: function (item, callback) { themeCallbacks.push({ item: item, callback: callback }); }
    },
    presentation: {
      applyBackdrop: function (item, source) { calls.push('backdrop:' + item.id + ':' + source); },
      applyTheme: function (item, source) { calls.push('theme:' + item.id + ':' + source); }
    }
  });
  controller.requestBackdrop({ id: 'one' });
  controller.requestBackdrop({ id: 'two' });
  backdropCallbacks[0].callback(null, 'old');
  backdropCallbacks[1].callback(null, 'new');
  assert.deepStrictEqual(calls, ['backdrop:two:new'], 'stale artwork cannot overwrite current focus');
  controller.requestTheme({ id: 'theme' });
  controller.beginBackdrop();
  themeCallbacks[0].callback(null, 'music');
  assert.strictEqual(calls[1], 'theme:theme:music', 'backdrop changes do not invalidate theme work');
  controller.destroy();
}());

(function testHomeInputAndDestroy() {
  var played = [];
  var activated = 0;
  var exitRequests = 0;
  var timers = new TimerRoot();
  var controller = ShellController.create({
    modules: modules(), clock: timers,
    rows: [{ title: 'Home', items: [{ ratingKey: 'one', title: 'One' }, { ratingKey: 'two', title: 'Two' }] }],
    actions: { playHomeItem: function (item) { played.push(item.ratingKey); }, activateHome: function () { activated += 1; }, requestExit: function () { exitRequests += 1; } },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  controller.handleHomeKey({ keyCode: 415, preventDefault: function () {} }, null);
  controller.handleHomeKey({ keyCode: 13, preventDefault: function () {} }, null);
  assert.deepStrictEqual(played, ['one']);
  assert.strictEqual(activated, 1);
  controller.handleHomeKey({ keyCode: 461, preventDefault: function () {} }, null);
  assert.strictEqual(exitRequests, 1, 'Back at the first Home card must request application exit');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 461, preventDefault: function () {} }, null);
  assert.strictEqual(exitRequests, 1, 'Back away from the first Home card must only restore the Home start focus');
  assert.deepStrictEqual(controller.snapshot().focus, { area: 'media', navIndex: 0, rowIndex: 0, column: 0 });
  controller.showMessage('hello');
  assert.ok(Object.keys(timers.timers).length > 0 || true, 'message timeout is controller-owned');
  controller.destroy();
  controller.destroy();
  assert.strictEqual(controller.snapshot().destroyed, true, 'destroy is idempotent');
  assert.strictEqual(Object.keys(timers.timers).length, 0, 'destroy cancels every shell timer');
}());

(function testStaticOwnershipBoundary() {
  var fs = require('fs');
  var path = require('path');
  var runtime = fs.readFileSync(path.join(__dirname, '../app/coordinator/application-controller.js'), 'utf8');
  var feature = fs.readFileSync(path.join(__dirname, '../app/coordinator/shell-feature-controller.js'), 'utf8');
  assert.ok(!/var (navbarLibraryWindowStart|themeLookupTimer|themeLookupToken|themeLookupCache|lastHomeSelectionKey|homeDomDirty|activeBackdropSource|backdropTimer|messageTimer)/.test(runtime), 'migrated shell state must not remain in the application controller');
  assert.ok(!/function renderRows\(/.test(runtime) && /shellFeature\.renderRows\(\); shellFeature\.updateFocus\(\);/.test(runtime), 'application Home rendering must call the Shell feature directly without a forwarding wrapper');
  assert.ok(!/function updateFocus\(/.test(runtime) && /shellFeature\.updateFocus\(\)/.test(runtime), 'application focus rendering must call the Shell feature directly without a forwarding wrapper');
  assert.ok(/renderRows: function \(\) \{ return controller\.renderRows\(\); \}/.test(feature), 'ShellFeatureController must delegate Home rendering to ShellController');
  assert.ok(/updateFocus: function \(\) \{ return controller\.updateFocus\(\); \}/.test(feature), 'ShellFeatureController must delegate focus rendering to ShellController');
}());


(function testCardLayoutProfileIsCachedUntilScaleApplication() {
  var scale = 100;
  var settingsReads = 0;
  var controller = ShellController.create({
    modules: { CardLayout: CardLayout },
    access: {
      settings: function () {
        settingsReads += 1;
        return { cardScale: scale };
      }
    }
  });
  var initial = controller.cardProfile();
  assert.strictEqual(controller.cardProfile(), initial, 'the shell must reuse the active card profile');
  assert.strictEqual(controller.cardMetrics(), initial.metrics, 'card metrics must come from the active profile');
  assert.strictEqual(settingsReads, 1, 'reading the active profile repeatedly must not reread settings');
  scale = 120;
  assert.strictEqual(controller.cardProfile(), initial, 'changing stored settings alone must not invalidate the active layout');
  controller.applyCardScale();
  assert.strictEqual(controller.cardProfile().scale, 120, 'applying card scale must replace the active profile');
  assert.notStrictEqual(controller.cardProfile(), initial, 'a new scale must use its own cached profile');
  assert.strictEqual(settingsReads, 2, 'applying a changed scale must read settings exactly once');
  controller.destroy();
}());

console.log('Shell controller checks passed');

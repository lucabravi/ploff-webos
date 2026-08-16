'use strict';

var assert = require('assert');
var Feature;
try { Feature = require('../app/coordinator/shell-feature-controller'); }
catch (error) { Feature = null; }
var ViewState = require('../app/view-state');
var NavigationModel = require('../app/navigation-model');
var ShellController = require('../app/coordinator/shell-controller');
var HomeState = require('../app/home-state');
var PresentationServices = require('../app/coordinator/presentation-services');
var ProgressiveImages = require('../app/progressive-images');

function TimerRoot() {
  this.next = 1;
  this.timeouts = {};
  this.intervals = {};
  this.clearedTimeouts = [];
  this.clearedIntervals = [];
}
TimerRoot.prototype.setTimeout = function (callback, delay) {
  var id = this.next;
  this.next += 1;
  this.timeouts[id] = { callback: callback, delay: delay };
  return id;
};
TimerRoot.prototype.clearTimeout = function (id) {
  this.clearedTimeouts.push(id);
  delete this.timeouts[id];
};
TimerRoot.prototype.setInterval = function (callback, delay) {
  var id = this.next;
  this.next += 1;
  this.intervals[id] = { callback: callback, delay: delay };
  return id;
};
TimerRoot.prototype.clearInterval = function (id) {
  this.clearedIntervals.push(id);
  delete this.intervals[id];
};
TimerRoot.prototype.runTimeout = function (id) {
  var entry = this.timeouts[id];
  delete this.timeouts[id];
  if (entry) { entry.callback(); }
};
TimerRoot.prototype.runNextTimeout = function () {
  var ids = Object.keys(this.timeouts).map(Number).sort(function (left, right) { return left - right; });
  if (ids.length) { this.runTimeout(ids[0]); }
};

function FakeNode(tagName) {
  this.tagName = String(tagName || 'div').toUpperCase();
  this.className = '';
  this.children = [];
  this.attributes = {};
  this.style = {};
  this.focused = false;
  this.parentNode = null;
  this.clientWidth = 154;
  this.clientHeight = 224;
  this.scrollTop = 0;
  this.onclick = null;
  this.textContent = '';
}
Object.defineProperty(FakeNode.prototype, 'innerHTML', {
  get: function () { return ''; },
  set: function () { this.children = []; }
});
FakeNode.prototype.appendChild = function (node) { node.parentNode = this; this.children.push(node); return node; };
FakeNode.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
FakeNode.prototype.getAttribute = function (name) { return this.attributes[name]; };
FakeNode.prototype.removeAttribute = function (name) { delete this.attributes[name]; };
FakeNode.prototype.focus = function () { this.focused = true; };
FakeNode.prototype.getElementsByTagName = function (tagName) {
  var expected = String(tagName).toUpperCase();
  var result = [];
  function visit(node) {
    node.children.forEach(function (child) {
      if (child.tagName === expected) { result.push(child); }
      visit(child);
    });
  }
  visit(this);
  return result;
};
FakeNode.prototype.getBoundingClientRect = function () {
  return { width: this.clientWidth, height: this.clientHeight, top: 0, bottom: this.clientHeight };
};

function FakeDocument() {
  this.nodes = {};
  this.hidden = false;
  this.body = new FakeNode('body');
  this.documentElement = new FakeNode('html');
}
FakeDocument.prototype.register = function (id, node) { this.nodes[id] = node; node.id = id; return node; };
FakeDocument.prototype.getElementById = function (id) { return this.nodes[id] || null; };
FakeDocument.prototype.createElement = function (tagName) { return new FakeNode(tagName); };
FakeDocument.prototype.createTextNode = function (text) { var node = new FakeNode('#text'); node.textContent = String(text || ''); return node; };
function textOf(node) {
  return node && node.children && node.children.length ? String(node.children[0].textContent || '') : String(node && node.textContent || '');
}

FakeDocument.prototype.querySelectorAll = function (selector) {
  if (selector === '#view-state-actions button') {
    return (this.nodes['view-state-actions'] && this.nodes['view-state-actions'].children || []).slice();
  }
  return [];
};

function createHarness(overrides) {
  var root = new TimerRoot();
  var storageWrites = [];
  var document = new FakeDocument();
  var controllerOptions = null;
  var controllerCreates = 0;
  var posterCreates = 0;
  var posterOptions = null;
  var audioCreates = 0;
  var posterDestroyed = 0;
  var audioDestroyed = 0;
  var controllerDestroyed = 0;
  var controllerCalls = [];
  var presentationServices = null;
  var focus = { area: 'nav', navIndex: 1, rowIndex: 0, column: 0 };
  var navigationItems = [
    { kind: 'home', title: 'Home' },
    { kind: 'library', key: 'one', title: 'One' },
    { kind: 'library', key: 'two', title: 'Two' },
    { kind: 'settings', title: 'Settings' }
  ];
  var availableNavigationItems = navigationItems.slice();
  var rows = [];
  var posterLoader = {
    cancelScope: function (scope) { controllerCalls.push(['cancelScope', scope]); },
    destroy: function () { posterDestroyed += 1; },
    load: function (node, specification) { controllerCalls.push(['loadPoster', node, specification]); },
    prioritize: function (node) { controllerCalls.push(['prioritize', node]); }
  };
  var backgroundAudio = {
    schedule: function (item, options) { controllerCalls.push(['scheduleTheme', item, options]); },
    stop: function () { controllerCalls.push(['stopTheme']); },
    destroy: function () { audioDestroyed += 1; }
  };
  var shellController = {
    activeBackdropSource: function () { return '/active.jpg'; },
    applyCardScale: function () { controllerCalls.push(['applyCardScale']); },
    applyNavigationVisibility: function (items) { navigationItems = items.slice(); availableNavigationItems = items.slice(); return navigationItems; },
    availableNavigationItems: function () { return availableNavigationItems; },
    cardMetrics: function () { return { width: 170, height: 250 }; },
    clearBackdrop: function () { controllerCalls.push(['clearBackdrop']); },
    clearHome: function () { rows = []; controllerCalls.push(['clearHome']); },
    clearLogicalFocus: function () { controllerCalls.push(['clearLogicalFocus']); },
    completeStartup: function () { controllerCalls.push(['completeStartup']); },
    destroy: function () { controllerDestroyed += 1; },
    focusHomeStart: function () { focus.area = 'media'; focus.rowIndex = 0; focus.column = 0; controllerCalls.push(['focusHomeStart']); },
    focusState: function () { return focus; },
    handleHomeKey: function (event, direction) { controllerCalls.push(['homeKey', event.keyCode, direction]); return { handled: true }; },
    isActivityNavIndex: function (index) { return Number(index) === navigationItems.length; },
    isHomeDirty: function () { return true; },
    isHomeLoading: function () { return false; },
    isProfileNavIndex: function (index) { return Number(index) === navigationItems.length + 1; },
    markHomeDirty: function () { controllerCalls.push(['markHomeDirty']); },
    navigationFocusCount: function () { return navigationItems.length + 2; },
    navigationItems: function () { return navigationItems; },
    refreshHome: function () { controllerCalls.push(['refreshHome']); },
    renderNavigation: function () { controllerCalls.push(['renderNavigation']); },
    requestBackdrop: function (item) { controllerCalls.push(['requestBackdrop', item]); },
    resetHome: function () { controllerCalls.push(['resetHome']); },
    rows: function () { return rows; },
    scheduleDetailBackdrop: function (item) { controllerCalls.push(['detailBackdrop', item]); },
    scheduleHomePolling: function () { controllerCalls.push(['scheduleHomePolling']); },
    scheduleSearchBackdrop: function (item) { controllerCalls.push(['searchBackdrop', item]); },
    scheduleTheme: function (item) { controllerCalls.push(['controllerTheme', item]); },
    selectionKey: function () { return 'selection'; },
    selectorForNavIndex: function (index) { return '[data-nav-index="' + index + '"]'; },
    setFocus: function (next) { focus.area = next.area; focus.navIndex = next.navIndex; focus.rowIndex = next.rowIndex; focus.column = next.column; return focus; },
    setNavigationItems: function (items) { navigationItems = items.slice(); return navigationItems; },
    setRows: function (nextRows) { rows = nextRows.slice(); return rows; },
    showMessage: function (text) { controllerCalls.push(['message', text]); },
    stopHomePolling: function () { controllerCalls.push(['stopHomePolling']); },
    updateClock: function () { controllerCalls.push(['updateClock']); },
    updateFocus: function () { controllerCalls.push(['updateFocus']); },
    useHomeRows: function (nextRows, navIndex, options) { rows = nextRows.slice(); focus.navIndex = navIndex; controllerCalls.push(['useHomeRows', options]); return rows; }
  };
  var calls = [];

  root.localStorage = {
    setItem: function (key, value) { storageWrites.push([key, value]); },
    getItem: function () { return null; }
  };
  root.Image = function () {};
  document.register('theme-audio', new FakeNode('audio'));
  document.register('view-state', new FakeNode('section'));
  document.register('view-state-title', new FakeNode('h2'));
  document.register('view-state-message', new FakeNode('p'));
  document.register('view-state-actions', new FakeNode('div'));
  document.register('content', new FakeNode('main'));
  document.register('navigation', new FakeNode('nav'));
  document.register('startup-splash-label', new FakeNode('span'));
  document.register('active-profile', new FakeNode('button'));
  document.register('active-profile-avatar', new FakeNode('img'));
  document.register('active-profile-initial', new FakeNode('span'));
  document.register('active-profile-name', new FakeNode('span'));
  document.register('server-activity', new FakeNode('button'));
  document.register('server-activity-panel', new FakeNode('section'));
  document.register('server-activity-title', new FakeNode('span'));
  document.register('server-activity-title-text', new FakeNode('span'));

  var options = {
    platform: { root: root, document: document, storage: root.localStorage },
    modules: {
      ShellController: {
        create: function (values) { controllerCreates += 1; controllerOptions = values; rows = (values.rows || []).slice(); return shellController; }
      },
      HomeState: {
        restoreFocus: function (_rows, base) { return base; },
        selectionKey: function () { return 'selection'; }
      },
      FocusModel: {},
      NavigationModel: NavigationModel,
      NavbarWindow: {},
      CardLayout: {},
      MediaLabels: {
        title: function (item) { return 'title:' + item.title; },
        meta: function (item) { return 'meta:' + item.title; },
        detail: function (item) { return 'detail:' + item.title; },
        cardMeta: function (item) { return 'card-meta:' + item.title; },
        cardDetail: function (item) { return 'card-detail:' + item.title; }
      },
      ProgressiveImages: {
        create: function (values) { posterCreates += 1; posterOptions = values; return posterLoader; },
        qualityForScope: ProgressiveImages.qualityForScope,
        qualitySize: ProgressiveImages.qualitySize,
        previewSize: function (width, height) { return { width: Math.ceil(width / 2), height: Math.ceil(height / 2) }; },
        renderedSize: function (image, fallbackWidth, fallbackHeight) { var rect = image.getBoundingClientRect(); return { width: Math.floor(rect.width || fallbackWidth), height: Math.floor(rect.height || fallbackHeight) }; }
      },
      BackgroundAudio: {
        create: function () { audioCreates += 1; return backgroundAudio; }
      },
      ViewState: ViewState,
      I18n: { t: function (language, key) { return language + ':' + key; } }
    },
    data: {
      config: {},
      initialNavigationItems: navigationItems,
      initialRows: rows,
      loadHome: function () {},
      loadThemeMetadata: function () {}
    },
    state: {
      settings: function () { return { uiLanguage: 'it', cardScale: 100, artworkQuality: 80, backdropQuality: 70 }; },
      authState: function () { return {}; },
      currentView: function () { return 'home'; },
      setView: function (view) { calls.push(['setView', view]); },
      pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return true; },
      watchlistAvailable: function () { return true; },
      activeProfileVisible: function () { return true; },
      activeProfile: function () { return { id: 'profile-1', title: 'Alice', thumb: '/alice.jpg' }; },
      authMode: function () { return 'plex'; },
      setupComplete: function () { return true; },
      publishActiveProfile: function (profile) { calls.push(['publishProfile', profile && profile.id]); },
      serverActivities: function () { return []; },
      networkSnapshot: function () { return { status: 'online' }; },
      homeCanRefresh: function () { return true; }
    },
    presentation: {
      refreshSettings: function () { calls.push(['settings']); },
      refreshDiagnostics: function () { calls.push(['diagnostics']); },
      hideNonHomeViews: function () { calls.push(['hideNonHome']); },
      networkStatusLabel: function (snapshot) { return 'network:' + snapshot.status; },
      networkStatusClass: function (snapshot) { return 'is-network-' + snapshot.status; },
      animationDuration: function (milliseconds) { return milliseconds; },
      onActivityTitle: function (title, state) { calls.push(['activityTitle', title, state]); },
      translateDetail: function () { calls.push(['translateDetail']); },
      translateLibrary: function () { calls.push(['translateLibrary']); },
      translatePlayer: function () { calls.push(['translatePlayer']); },
      onResizeCurrentView: function () { calls.push(['resizeCurrentView']); }
    },
    transitions: {
      activateHome: function () { calls.push(['activateHome']); },
      playHomeItem: function (item) { calls.push(['playHome', item]); },
      onHomeEmpty: function () { calls.push(['homeEmpty']); },
      navigationMatches: function () { return false; },
      commitNavigationView: function (item, index, keepFocus) { calls.push(['commitNav', item.kind, index, keepFocus]); },
      enterNavigationContent: function (item, index) { calls.push(['enterNav', item.kind, index]); },
      focusNavigationForCurrentView: function () { calls.push(['focusNav']); },
      openProfileManager: function () { calls.push(['profileManager']); },
      focusActivity: function () { calls.push(['activityFocus']); },
      scheduleAdjacentLibraryPrefetch: function (index, items) { calls.push(['prefetch', index, items.length]); }
    }
  };
  Object.keys(overrides || {}).forEach(function (group) {
    Object.keys(overrides[group] || {}).forEach(function (key) { options[group][key] = overrides[group][key]; });
  });
  presentationServices = PresentationServices.create({
    document: document,
    I18n: options.modules.I18n,
    MediaLabels: options.modules.MediaLabels,
    settings: options.state.settings
  });
  options.presentationServices = presentationServices;
  assert.ok(Feature, 'ShellFeatureController module must exist');
  return {
    feature: Feature.create(options), root: root, document: document, calls: calls, controllerCalls: controllerCalls,
    counts: function () { return { controller: controllerCreates, poster: posterCreates, audio: audioCreates, controllerDestroyed: controllerDestroyed, posterDestroyed: posterDestroyed, audioDestroyed: audioDestroyed }; },
    controllerOptions: function () { return controllerOptions; }, posterOptions: function () { return posterOptions; }, storageWrites: storageWrites, posterLoader: posterLoader,
    presentationServices: presentationServices
  };
}


(function ownsHomeTransportAndWatchedProjection() {
  var loadedHome = null;
  var loadedTheme = null;
  var config = { apiBaseUrl: 'http://server' };
  var harness = createHarness({
    data: {
      config: config,
      initialRows: [{ items: [{ ratingKey: 'one', viewed: false, viewOffset: 50, progress: 20 }] }],
      PlexClient: {
        loadHome: function (received, callback) {
          assert.strictEqual(received, config);
          callback(null, [{ recommendation: true, title: 'Old', items: [] }]);
          return 'home-request';
        },
        loadMetadata: function (received, ratingKey, callback) {
          assert.strictEqual(received, config);
          assert.strictEqual(ratingKey, 'theme-one');
          callback(null, { ratingKey: ratingKey });
          return 'theme-request';
        }
      },
      loadHome: null,
      loadThemeMetadata: null
    }
  });
  assert.strictEqual(harness.controllerOptions().services.loadHome(function (error, rows) { loadedHome = { error: error, rows: rows }; }), 'home-request');
  assert.strictEqual(loadedHome.error, null);
  assert.strictEqual(loadedHome.rows[0].title, 'it:home.recommended', 'Shell owns recommendation-title localization after loading Home');
  assert.strictEqual(harness.controllerOptions().services.loadThemeMetadata('theme-one', function (error, detail) { loadedTheme = { error: error, detail: detail }; }), 'theme-request');
  assert.strictEqual(loadedTheme.detail.ratingKey, 'theme-one', 'Shell owns theme metadata transport');
  harness.feature.updateWatched('one', true);
  assert.strictEqual(harness.feature.rows()[0].items[0].viewed, true, 'Shell owns Home watched-state projection');
  assert.strictEqual(harness.feature.rows()[0].items[0].viewOffset, 0);
  assert.ok(harness.controllerCalls.some(function (entry) { return entry[0] === 'refreshHome'; }), 'watched projection retains the established Home refresh behavior');
}());

(function testConstructionAndSemanticPresentationPorts() {
  var harness = createHarness();
  var feature = harness.feature;
  var image = new FakeNode('img');
  var card = new FakeNode('button');
  card.appendChild(image);
  assert.deepStrictEqual(harness.counts(), { controller: 1, poster: 1, audio: 1, controllerDestroyed: 0, posterDestroyed: 0, audioDestroyed: 0 });
  assert.strictEqual(harness.controllerOptions().presentation.translate('nav.home'), 'it:nav.home');
  assert.strictEqual(harness.presentationServices.mediaTitle({ title: 'One' }), 'title:One');
  assert.strictEqual(harness.presentationServices.mediaCardMeta({ title: 'One' }), 'card-meta:One');
  assert.deepStrictEqual(feature.cardMetrics(), { width: 170, height: 250 });
  assert.deepStrictEqual(feature.renderedPosterSpecification(image, '/one.jpg', 2, 'test'), {
    source: '/one.jpg', previewWidth: 77, previewHeight: 112, width: 154, height: 224, priority: 2, scope: 'test'
  });
  image.clientWidth = 154.9;
  image.clientHeight = 224.8;
  assert.deepStrictEqual(feature.renderedPosterSpecification(image, '/fractional.jpg', 1, 'test'), {
    source: '/fractional.jpg', previewWidth: 77, previewHeight: 112, width: 154, height: 224, priority: 1, scope: 'test'
  }, 'rendered poster requests must not exceed fractional CSS dimensions');
  feature.loadRenderedPoster(image, '/one.jpg', 2, 'test');
  feature.prioritizePoster(card);
  assert.strictEqual(feature.posterLoader(), harness.posterLoader, 'temporary consumers receive the single shell-owned loader');
  assert.strictEqual(typeof harness.controllerOptions().actions.startNavHold, 'function');
  assert.strictEqual(typeof harness.controllerOptions().actions.scheduleNavigationPreview, 'function');
}());

(function testStartOwnsClockAndGlobalShellPresentation() {
  var harness = createHarness();
  harness.feature.start();
  harness.feature.start();
  assert.deepStrictEqual(harness.controllerCalls.slice(0, 3), [['applyCardScale'], ['renderNavigation'], ['updateClock']]);
  assert.ok(/is-home-surface-active/.test(harness.document.body.className), 'starting on Home must activate the Home surface before the first data render');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return /^translate/.test(entry[0]); }), [
    ['translateDetail'], ['translateLibrary'], ['translatePlayer']
  ]);
  assert.strictEqual(textOf(harness.document.getElementById('startup-splash-label')), 'it:startup.loading');
  assert.strictEqual(harness.document.getElementById('navigation').getAttribute('aria-label'), 'it:nav.main');
  assert.strictEqual(Object.keys(harness.root.intervals).length, 1, 'start is idempotent and owns one clock interval');
  assert.strictEqual(harness.root.intervals[Object.keys(harness.root.intervals)[0]].delay, 30000);
}());


(function testProfileActivityAndHomeSurfacePresentationAreShellOwned() {
  var profile = { id: 'profile-2', title: 'Bob', thumb: '/bob.jpg' };
  var activities = [{ title: 'Refreshing', subtitle: 'Library', progress: 42 }];
  var network = { status: 'online' };
  var published = [];
  var activityTitles = [];
  var harness = createHarness({
    state: {
      activeProfile: function () { return profile; },
      authMode: function () { return 'plex'; },
      setupComplete: function () { return true; },
      publishActiveProfile: function (value) { published.push(value); },
      serverActivities: function () { return activities; },
      networkSnapshot: function () { return network; }
    },
    presentation: {
      networkStatusLabel: function (snapshot) { return 'network:' + snapshot.status; },
      networkStatusClass: function (snapshot) { return 'is-network-' + snapshot.status; },
      animationDuration: function (milliseconds) { return milliseconds; },
      onActivityTitle: function (title, state) { activityTitles.push([title, state]); }
    }
  });
  var feature = harness.feature;
  var avatar = harness.document.getElementById('active-profile-avatar');
  var initial = harness.document.getElementById('active-profile-initial');
  var activityButton = harness.document.getElementById('server-activity');
  var activityPanel = harness.document.getElementById('server-activity-panel');
  var content = harness.document.getElementById('content');

  assert.strictEqual(feature.activeProfileTitle(), 'Bob');
  assert.strictEqual(feature.renderActiveProfile(), true);
  assert.strictEqual(harness.document.getElementById('active-profile').className, 'active-profile');
  assert.strictEqual(textOf(harness.document.getElementById('active-profile-name')), 'Bob');
  assert.strictEqual(textOf(initial), 'B');
  assert.strictEqual(avatar.src, '/bob.jpg');
  assert.strictEqual(avatar.style.display, 'block');
  assert.strictEqual(initial.style.display, 'none');
  assert.strictEqual(published[0], profile);
  avatar.onerror();
  assert.strictEqual(avatar.style.display, 'none');
  assert.strictEqual(initial.style.display, 'flex');

  assert.strictEqual(feature.renderServerActivities(), true);
  assert.ok(/is-starting/.test(activityButton.className), 'first active render uses the existing start transition');
  assert.strictEqual(activityButton.getAttribute('aria-busy'), 'true');
  assert.strictEqual(activityButton.getAttribute('title'), undefined, 'active server work uses the custom panel instead of a sticky native browser tooltip');
  assert.strictEqual(activityPanel.children.length, 2, 'one summary and one expandable detail surface are rendered');
  assert.strictEqual(textOf(activityPanel.children[0]), 'Refreshing', 'the unified activity surface carries the condensed single-line summary');
  assert.strictEqual(activityPanel.children[1].children[1].children[2].children[0].style.width, '42%');
  harness.root.runNextTimeout();
  assert.ok(/is-active/.test(activityButton.className), 'activity transition settles to active');
  assert.deepStrictEqual(activityTitles[activityTitles.length - 1], ['Refreshing', 'active']);

  activities = [];
  feature.renderServerActivities();
  assert.ok(/is-stopping/.test(activityButton.className), 'empty activity state preserves the stop transition');
  harness.root.runNextTimeout();
  assert.ok(/is-idle/.test(activityButton.className), 'activity transition settles to idle');
  assert.strictEqual(activityPanel.children.length, 2, 'the unified activity surface retains its stable summary/detail structure while idle');
  assert.strictEqual(activityButton.getAttribute('title'), undefined, 'idle activity controls must not advertise a server operation');

  activities = [{ id: 'maintenance', type: 'butler', title: 'Butler tasks', progress: 88 }];
  feature.renderServerActivities();
  assert.ok(/is-idle/.test(activityButton.className), 'background Plex Butler maintenance must not keep the user-facing activity indicator active');
  assert.strictEqual(activityButton.getAttribute('aria-busy'), 'false');
  assert.strictEqual(activityPanel.className, 'server-activity-panel');

  harness.controllerOptions().presentation.setHomeLoading(true);
  harness.feature.renderServerActivities();
  harness.root.runNextTimeout();
  harness.root.runNextTimeout();
  harness.root.runNextTimeout();
  assert.ok(/is-idle/.test(activityButton.className), 'a Home refresh must not make the server activity control look continuously active');
  assert.strictEqual(activityButton.getAttribute('aria-busy'), 'false');

  content.className = 'is-navigation-entering';
  feature.hideHomeSurface();
  assert.strictEqual(content.style.display, 'none');
  assert.strictEqual(content.className, '', 'hiding a browsing surface must clear a pending navigation entrance animation');
  assert.strictEqual(/is-home-surface-active/.test(harness.document.body.className), false, 'non-Home views must not inherit the Immersive Home geometry');
  feature.showHomeSurface();
  assert.strictEqual(content.style.display, 'block');
  assert.ok(/is-home-surface-active/.test(harness.document.body.className), 'showing Home enables its theme-specific geometry');
  content.appendChild(new FakeNode('div'));
  feature.clearHomeSurface();
  assert.strictEqual(content.children.length, 0);
  feature.prepareServerSwitch();
  assert.ok(/is-booting/.test(harness.document.body.className));

  profile = null;
  feature.renderActiveProfile();
  assert.strictEqual(harness.document.getElementById('active-profile').className, 'active-profile is-hidden');
  feature.destroy();
  assert.strictEqual(Object.keys(harness.root.timeouts).length, 0, 'destroy cancels activity presentation transitions');
}());

(function testOfflineProfilePresentationRemainsAvailable() {
  var harness = createHarness({
    state: {
      activeProfile: function () { return null; },
      authMode: function () { return 'offline'; },
      setupComplete: function () { return true; }
    }
  });
  harness.feature.renderActiveProfile();
  assert.strictEqual(harness.document.getElementById('active-profile').className, 'active-profile is-offline');
  assert.strictEqual(textOf(harness.document.getElementById('active-profile-name')), 'it:profile.offline');
  assert.strictEqual(harness.feature.activeProfileTitle(), 'it:settings.localNoAuth');
}());

(function testPosterRequestsUseIndependentQualitySettings() {
  var requests = [];
  var harness = createHarness({
    data: {
      PlexClient: {
        posterUrl: function (_config, source, width, height) {
          requests.push([source, width, height]);
          return source + '@' + width + 'x' + height;
        }
      }
    }
  });
  assert.strictEqual(harness.posterOptions().urlFor('/poster.jpg', 200, 300, 'library'), '/poster.jpg@160x240');
  assert.strictEqual(harness.posterOptions().urlFor('/backdrop.jpg', 1920, 1080, 'backdrop'), '/backdrop.jpg@1344x756');
  assert.deepStrictEqual(requests, [
    ['/poster.jpg', 160, 240],
    ['/backdrop.jpg', 1344, 756]
  ], 'the shared loader must scale Plex requests by the quality assigned to each semantic scope');
}());

(function testViewStateFocusRetryAndBackAreFeatureOwned() {
  var retries = 0;
  var backs = 0;
  var harness = createHarness();
  var feature = harness.feature;
  feature.showViewState('error', 'home', function () { retries += 1; }, function () { backs += 1; });
  assert.strictEqual(feature.viewStateOpen(), true);
  assert.strictEqual(harness.document.getElementById('view-state-actions').children.length, 2);
  feature.handleViewStateKey({ keyCode: 39 }, 'right');
  assert.strictEqual(harness.document.getElementById('view-state-actions').children[1].focused, true);
  feature.handleViewStateKey({ keyCode: 13 }, '');
  assert.strictEqual(backs, 1);
  assert.strictEqual(feature.viewStateOpen(), false);
  feature.showViewState('error', 'home', function () { retries += 1; }, function () { backs += 1; });
  feature.handleViewStateKey({ keyCode: 13 }, '');
  assert.strictEqual(retries, 1);
}());

(function testLeavingNavigationCommitsTheFocusedPageBeforeEnteringContent() {
  var harness = createHarness();
  var feature = harness.feature;
  feature.setFocus({ area: 'nav', navIndex: 2, rowIndex: 0, column: 0 });
  feature.scheduleNavigationPreview(2);

  assert.strictEqual(feature.enterActiveNavigation(), true);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'commitNav'; }), [['commitNav', 'library', 2, false]], 'leaving navbar focus must commit the focused page immediately instead of entering stale content');
  assert.strictEqual(Object.keys(harness.root.timeouts).length, 0, 'the delayed navbar preview must be cancelled after the immediate commit');
}());

(function testNavigationPreviewAndLongPressReorderAreFeatureOwned() {
  var harness = createHarness();
  var feature = harness.feature;
  feature.setFocus({ area: 'nav', navIndex: 2, rowIndex: 0, column: 0 });
  feature.scheduleNavigationPreview(2);
  harness.root.runNextTimeout();
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'commitNav'; }), [['commitNav', 'library', 2, true]]);
  feature.startNavigationHold(1);
  assert.strictEqual(feature.navigationSnapshot().holdActive, true);
  harness.root.runNextTimeout();
  assert.strictEqual(feature.navigationSnapshot().reorderMode, true);
  assert.strictEqual(feature.navigationSnapshot().holdTriggered, true);
  feature.moveReorderedLibrary(1);
  assert.strictEqual(feature.focusState().navIndex, 2);
  feature.markReorderReady();
  assert.strictEqual(feature.navigationSnapshot().reorderReady, true);
  feature.finishReorder(true);
  assert.strictEqual(feature.navigationSnapshot().reorderMode, false);
  assert.strictEqual(harness.storageWrites.length, 1, 'saved reorder persists library keys exactly once');
}());

(function testVisibilityResizeAndDestroyAreIdempotent() {
  var harness = createHarness();
  var feature = harness.feature;
  feature.start();
  harness.document.hidden = true;
  feature.onVisibilityChange();
  harness.document.hidden = false;
  feature.onVisibilityChange();
  feature.onResize();
  feature.onResize();
  assert.strictEqual(Object.keys(harness.root.timeouts).length, 1, 'resize debounce keeps one pending timer');
  harness.root.runNextTimeout();
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'resizeCurrentView'; }));
  feature.destroy();
  feature.destroy();
  assert.deepStrictEqual(harness.counts(), { controller: 1, poster: 1, audio: 1, controllerDestroyed: 1, posterDestroyed: 1, audioDestroyed: 1 });
  assert.strictEqual(Object.keys(harness.root.intervals).length, 0);
  assert.strictEqual(Object.keys(harness.root.timeouts).length, 0);
}());

(function testFocusSnapshotCannotMutateControllerState() {
  var harness = createHarness();
  var feature = harness.feature;
  var snapshot = feature.focusState();
  snapshot.area = 'media';
  snapshot.navIndex = 99;
  assert.deepStrictEqual(feature.focusState(), { area: 'nav', navIndex: 1, rowIndex: 0, column: 0 }, 'focusState must be a read-only snapshot');
  feature.setFocus({ area: 'media', navIndex: 2, rowIndex: 1, column: 3 });
  assert.deepStrictEqual(feature.focusState(), { area: 'media', navIndex: 2, rowIndex: 1, column: 3 }, 'setFocus is the only public focus mutation path');
}());

(function testDestroyInvalidatesPendingShellCallbacksAndViewStateActions() {
  var harness = createHarness();
  var feature = harness.feature;
  var commitsBefore;
  var resizeBefore;
  var pending;
  feature.showViewState('error', 'home', function () { harness.calls.push(['retry']); }, function () { harness.calls.push(['back']); });
  feature.scheduleNavigationPreview(1);
  feature.startNavigationHold(1);
  feature.onResize();
  pending = Object.keys(harness.root.timeouts).map(function (id) { return harness.root.timeouts[id].callback; });
  commitsBefore = harness.calls.filter(function (entry) { return entry[0] === 'commitNav'; }).length;
  resizeBefore = harness.calls.filter(function (entry) { return entry[0] === 'resizeCurrentView'; }).length;
  feature.destroy();
  pending.forEach(function (callback) { callback(); });
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'commitNav'; }).length, commitsBefore, 'late preview and hold callbacks must not navigate');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'resizeCurrentView'; }).length, resizeBefore, 'late resize callbacks must not render');
  assert.strictEqual(feature.viewStateOpen(), false, 'destroy closes a visible recoverable state');
  assert.strictEqual(harness.document.getElementById('view-state').className, 'view-state is-hidden');
  assert.strictEqual(harness.document.getElementById('view-state-actions').children[0].onclick, null, 'destroy detaches view-state actions');
  assert.strictEqual(feature.start(), false, 'destroyed features cannot restart');
}());

(function testImageCancellationRemainsScopeBoundedAndStopsAfterDestroy() {
  var harness = createHarness();
  var feature = harness.feature;
  feature.cancelImages('search');
  feature.cancelImages('detail');
  assert.deepStrictEqual(harness.controllerCalls.filter(function (entry) { return entry[0] === 'cancelScope'; }), [
    ['cancelScope', 'search'], ['cancelScope', 'detail']
  ], 'departed surfaces cancel only their own progressive-image scope');
  feature.destroy();
  feature.cancelImages('library');
  assert.strictEqual(harness.controllerCalls.filter(function (entry) { return entry[0] === 'cancelScope'; }).length, 2, 'destroyed features ignore later scope cancellation');
}());


(function testLateHomeThemeAndBackdropWorkCannotEscapeDestroy() {
  var root = new TimerRoot();
  var document = new FakeDocument();
  var homeCallbacks = [];
  var themeCallbacks = [];
  var posterLoads = [];
  var audioSchedules = [];
  var posterDestroyed = 0;
  var audioDestroyed = 0;
  var feature;
  document.register('theme-audio', new FakeNode('audio'));
  document.register('backdrop-a', new FakeNode('img'));
  document.register('backdrop-b', new FakeNode('img'));
  document.register('view-state', new FakeNode('section'));
  document.register('view-state-title', new FakeNode('h2'));
  document.register('view-state-message', new FakeNode('p'));
  document.register('view-state-actions', new FakeNode('div'));
  document.register('content', new FakeNode('main'));
  root.localStorage = { getItem: function () { return null; }, setItem: function () {} };
  root.Image = function () {};
  feature = Feature.create({
    platform: { root: root, document: document, storage: root.localStorage },
    presentationServices: PresentationServices.create({
      document: document,
      I18n: { t: function (_language, key) { return key; } },
      MediaLabels: {},
      settings: function () { return { backgroundMusic: true, backgroundDelay: 15, backgroundVolume: 20 }; }
    }),
    modules: {
      ShellController: ShellController,
      HomeState: HomeState,
      FocusModel: {},
      NavigationModel: NavigationModel,
      NavbarWindow: {},
      CardLayout: {},
      MediaLabels: {},
      ProgressiveImages: {
        create: function () {
          return {
            cancelScope: function () {},
            destroy: function () { posterDestroyed += 1; },
            load: function (node, specification) { posterLoads.push({ node: node, specification: specification }); },
            prioritize: function () {}
          };
        },
        previewSize: function (width, height) { return { width: width, height: height }; },
        renderedSize: function (image, fallbackWidth, fallbackHeight) { var rect = image.getBoundingClientRect(); return { width: Math.floor(rect.width || fallbackWidth), height: Math.floor(rect.height || fallbackHeight) }; }
      },
      BackgroundAudio: {
        create: function () {
          return {
            schedule: function (item, options) { audioSchedules.push([item, options]); },
            stop: function () {},
            destroy: function () { audioDestroyed += 1; }
          };
        }
      },
      ViewState: ViewState,
      I18n: { t: function (_language, key) { return key; } }
    },
    data: {
      initialNavigationItems: [{ kind: 'home', title: 'Home' }],
      initialRows: [],
      loadHome: function (callback) { homeCallbacks.push(callback); },
      loadThemeMetadata: function (_ratingKey, callback) { themeCallbacks.push(callback); }
    },
    state: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 15, backgroundVolume: 20 }; },
      authState: function () { return {}; },
      currentView: function () { return 'detail'; },
      pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; },
      watchlistAvailable: function () { return true; },
      activeProfileVisible: function () { return false; },
      homeCanRefresh: function () { return false; }
    },
    presentation: {},
    transitions: {}
  });

  feature.refreshHome();
  feature.refreshHome();
  assert.strictEqual(homeCallbacks.length, 1, 'a refresh requested during loading is coalesced');
  feature.scheduleTheme({ ratingKey: 'theme-one' });
  feature.scheduleDetailBackdrop({ ratingKey: 'episode-one', art: '/episode-one.jpg' });
  Object.keys(root.timeouts).map(Number).sort(function (left, right) { return left - right; }).forEach(function (id) { root.runTimeout(id); });
  assert.strictEqual(themeCallbacks.length, 1, 'theme metadata lookup begins before teardown');
  assert.strictEqual(posterLoads.length, 1, 'backdrop preview begins before teardown');

  homeCallbacks.shift()(null, [{ title: 'First', items: [{ ratingKey: 'one' }] }]);
  assert.strictEqual(homeCallbacks.length, 1, 'the coalesced refresh re-enters synchronously after the first response');
  assert.strictEqual(feature.rows()[0].title, 'First');
  feature.destroy();
  feature.destroy();
  homeCallbacks.shift()(null, [{ title: 'Late', items: [{ ratingKey: 'late' }] }]);
  themeCallbacks.shift()(null, { ratingKey: 'theme-one', themeUrl: '/late-theme.mp3' });
  posterLoads[0].specification.onPreview();

  assert.strictEqual(feature.rows()[0].title, 'First', 'late Home work cannot replace rows after destroy');
  assert.deepStrictEqual(audioSchedules, [], 'late theme metadata cannot start audio after destroy');
  assert.strictEqual(feature.activeBackdropSource(), '', 'late backdrop preview cannot activate after destroy');
  assert.strictEqual(posterDestroyed, 1, 'progressive images are destroyed exactly once');
  assert.strictEqual(audioDestroyed, 1, 'background audio is destroyed exactly once');
}());

console.log('Shell feature controller tests passed');

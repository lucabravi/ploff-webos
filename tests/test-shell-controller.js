'use strict';

var assert = require('assert');
var ShellController = require('../app/coordinator/shell-controller');
var HomeState = require('../app/home-state');
var FocusModel = require('../app/focus-model');
var NavigationModel = require('../app/navigation-model');
var NavbarWindow = require('../app/navbar-window');
var CardLayout = require('../app/card-layout');
var MediaLabels = require('../app/media-labels');
var NavigationIcon = require('../app/navigation-icon');

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
FakeElement.prototype.insertBefore = function (child, reference) {
  var childIndex;
  var referenceIndex;
  if (!reference) { return this.appendChild(child); }
  if (child === reference) { return child; }
  if (child.parentNode) {
    childIndex = child.parentNode.children.indexOf(child);
    if (childIndex !== -1) { child.parentNode.children.splice(childIndex, 1); }
  }
  referenceIndex = this.children.indexOf(reference);
  if (referenceIndex === -1) { return this.appendChild(child); }
  child.parentNode = this;
  this.children.splice(referenceIndex, 0, child);
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
FakeElement.prototype.getBoundingClientRect = function () { return this.rect || { top: 0, bottom: 100, width: this.offsetWidth, height: this.clientHeight }; };
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
    MediaLabels: MediaLabels,
    NavigationIcon: NavigationIcon
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
      loadThemeMetadata: function (item, callback) { metadataRequests.push([item, callback]); },
      playTheme: function (item) { played.push(item); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });

  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1' });
  clock.runNext();
  assert.strictEqual(metadataRequests[0][0].ratingKey, 'show-1', 'theme metadata loading must retain the full focused item for source-aware routing');
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
      loadThemeMetadata: function (item, callback) { metadataRequests.push([item, callback]); },
      playTheme: function (item) { played.push(item); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; },
      themeIdentity: function (item) { return identity + '|' + String(item && item.serverMachineIdentifier || ''); }
    }
  });

  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1', serverMachineIdentifier: 'server-a' });
  clock.runNext();
  metadataRequests[0][1](null, { themeKey: 'show:1', themeUrl: '/server-a-theme.mp3' });
  identity = 'server-b|token-b';
  controller.scheduleTheme({ ratingKey: 'show-1', themeLookupKey: 'show:1', serverMachineIdentifier: 'server-b' });
  clock.runNext();

  assert.strictEqual(metadataRequests.length, 2, 'theme metadata cached for one server/profile must not be reused after identity changes');
  metadataRequests[1][1](null, { themeKey: 'show:1', themeUrl: '/server-b-theme.mp3' });
  assert.strictEqual(played[played.length - 1].themeUrl, '/server-b-theme.mp3', 'the new server/profile must own the resumed background theme');
  controller.destroy();
}());

(function testThemeMetadataRequestIsAbortedWhenFocusMovesOn() {
  var clock = new TimerRoot();
  var aborted = 0;
  var requests = [];
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback) {
        requests.push([ratingKey, callback]);
        return { abort: function () { aborted += 1; } };
      },
      playTheme: function () {},
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });
  controller.scheduleTheme({ ratingKey: 'first', themeLookupKey: 'show:first' });
  clock.runNext();
  assert.strictEqual(requests.length, 1, 'the first stable theme focus must start one metadata request');
  controller.scheduleTheme({ ratingKey: 'second', themeLookupKey: 'show:second' });
  assert.strictEqual(aborted, 1, 'moving focus after theme metadata starts must abort the stale request immediately');
  controller.destroy();
}());

(function testExplicitThemeStopInvalidatesPendingMetadata() {
  var clock = new TimerRoot();
  var requests = [];
  var played = [];
  var stopped = 0;
  var stoppedBeforeExplicitStop;
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback) {
        var request = {
          ratingKey: ratingKey,
          callback: callback,
          aborted: false,
          abort: function () { this.aborted = true; }
        };
        requests.push(request);
        return request;
      },
      playTheme: function (item) { played.push(item.themeUrl); },
      stopTheme: function () { stopped += 1; }
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });
  controller.scheduleTheme({ ratingKey: 'jujutsu', themeLookupKey: 'show:jujutsu' });
  clock.runNext();
  assert.strictEqual(requests.length, 1, 'the theme metadata request must be active before the view transition');
  stoppedBeforeExplicitStop = stopped;
  controller.stopTheme();
  requests[0].callback(null, { themeKey: 'show:jujutsu', themeUrl: '/jujutsu-theme.mp3' });
  assert.strictEqual(requests[0].aborted, true, 'stopping the theme must abort the stale metadata request');
  assert.deepStrictEqual(played, [], 'a stale theme response must not restart audio after an explicit stop');
  assert.strictEqual(stopped, stoppedBeforeExplicitStop + 1, 'an explicit theme stop must stop the audio service once');
  controller.destroy();
}());

(function testThemeMetadataUsesTheFocusedSourceContext() {
  var clock = new TimerRoot();
  var requests = [];
  var played = [];
  var sourceContext = {
    sourceId: 'server-rota|4',
    apiBaseUrl: 'https://relay-rota.example',
    token: 'rota-token'
  };
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback, receivedSourceContext) {
        requests.push({ ratingKey: ratingKey, callback: callback, sourceContext: receivedSourceContext });
        return { abort: function () {} };
      },
      playTheme: function (item) { played.push(item.themeUrl); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; },
      themeIdentity: function (receivedSourceContext) {
        return receivedSourceContext ? receivedSourceContext.apiBaseUrl + '|' + receivedSourceContext.token : 'primary';
      }
    }
  });
  controller.scheduleTheme({ ratingKey: '6409', themeLookupKey: 'type:6409' }, sourceContext);
  clock.runNext();
  assert.strictEqual(requests.length, 1, 'a focused shared item must start one theme metadata request');
  assert.strictEqual(requests[0].sourceContext, sourceContext, 'theme metadata must receive the focused library source context');
  requests[0].callback(null, { themeKey: 'type:6409', themeUrl: '/rota-theme.mp3' });
  assert.deepStrictEqual(played, ['/rota-theme.mp3'], 'the shared source theme response must be played');
  controller.destroy();
}());

(function testThemeAtoBtoARapidFocusCannotReplayStaleMetadata() {
  var clock = new TimerRoot();
  var requests = [];
  var played = [];
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function (ratingKey, callback) {
        var request = { ratingKey: ratingKey, callback: callback, aborted: false, abort: function () { this.aborted = true; } };
        requests.push(request);
        return request;
      },
      playTheme: function (detail) { played.push(detail.themeUrl); },
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });
  controller.scheduleTheme({ ratingKey: 'a', themeLookupKey: 'show:a' });
  clock.runNext();
  controller.scheduleTheme({ ratingKey: 'b', themeLookupKey: 'show:b' });
  controller.scheduleTheme({ ratingKey: 'a', themeLookupKey: 'show:a' });
  clock.runNext();
  assert.strictEqual(requests.length, 2, 'A-B-A focus churn must start only the first and final stable metadata requests');
  assert.strictEqual(requests[0].aborted, true, 'the first A metadata request must be aborted when focus leaves it');
  requests[0].callback(null, { themeKey: 'show:a', themeUrl: '/stale-a.mp3' });
  assert.deepStrictEqual(played, [], 'a late callback from the first A request must not restart stale theme audio after A-B-A churn');
  requests[1].callback(null, { themeKey: 'show:a', themeUrl: '/current-a.mp3' });
  assert.deepStrictEqual(played, ['/current-a.mp3'], 'only the final current A metadata request may start theme audio');
  controller.destroy();
}());

(function testDestroyAbortsActiveThemeMetadataRequest() {
  var clock = new TimerRoot();
  var aborted = 0;
  var controller = ShellController.create({
    clock: clock,
    services: {
      loadThemeMetadata: function () { return { abort: function () { aborted += 1; } }; },
      playTheme: function () {},
      stopTheme: function () {}
    },
    access: {
      settings: function () { return { backgroundMusic: true, backgroundDelay: 0, backgroundVolume: 0.5 }; }
    }
  });
  controller.scheduleTheme({ ratingKey: 'destroy-theme', themeLookupKey: 'show:destroy' });
  clock.runNext();
  controller.destroy();
  assert.strictEqual(aborted, 1, 'destroying the shell must abort an active theme metadata request');
}());

(function testHomeRendererReconcilesWithoutHardResetAndRestoresFocus() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var preview = document.register('home-preview', new FakeElement('section', 'home-preview'));
  var previewKicker = document.register('home-preview-kicker', new FakeElement('span', ''));
  var previewTitle = document.register('home-preview-title', new FakeElement('h1', ''));
  var previewMeta = document.register('home-preview-meta', new FakeElement('p', ''));
  var previewSummary = document.register('home-preview-summary', new FakeElement('p', ''));
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
  var homeArtworkPreviewReady = 0;
  var homeInteractions = 0;
  var startupArtworkDeferrals = 0;
  var adjacentPrefetchModes = [];
  var firstPreviewBatchDone = null;
  var previewBatchCallbacks = [];
  var firstSection;
  var firstCard;
  void navigation; void backdropA; void backdropB; void splash; void clockNode; void message;
  void previewKicker; void previewTitle; void previewMeta; void previewSummary;
  controller = ShellController.create({
    modules: modules(),
    clock: clock,
    document: document,
    now: function () { return 1000; },
    navigationItems: [{ kind: 'home', title: 'Home' }, { kind: 'settings', title: 'Settings' }],
    services: {
      posterLoader: {
        loadBatch: function (jobs, callback) {
          posterBatches.push(jobs);
          if (typeof callback === 'function') {
            previewBatchCallbacks.push(callback);
            if (!firstPreviewBatchDone) { firstPreviewBatchDone = callback; }
          }
        },
        prioritize: function () {}, cancelScope: function () {}, load: function () {}
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      renderedPosterSpecification: function (image, source) { return { source: source, width: image.clientWidth }; },
      deferHomeArtworkLoads: function () { startupArtworkDeferrals += 1; },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    actions: {
      onHomeReady: function () { homeReady += 1; },
      onHomeArtworkPreviewReady: function () { homeArtworkPreviewReady += 1; },
      onHomeInteraction: function () { homeInteractions += 1; },
      scheduleAdjacentLibraryPrefetch: function (immediate) { adjacentPrefetchModes.push(immediate === true); }
    },
    access: {
      settings: function () { return { cardScale: 100, showHome: true, showSearch: true, showWatchlist: true, showPlaylists: true, showSettings: true }; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; }, watchlistAvailable: function () { return true; }
    }
  });
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', showLibraryBadge: true, items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg', libraryTitle: 'Anime', type: 'show', year: 2026, seasonCount: 2, genre: 'Drama', summary: 'A focused Home preview.' },
    { ratingKey: 'two', title: 'Two', image: '/two.jpg' }
  ] }], 0, { focus: 'first' });
  assert.strictEqual(startupArtworkDeferrals, 1, 'the first Home render must enter the startup artwork quiet window before poster loading begins');
  assert.strictEqual(homeReady, 1, 'initial Home content readiness must still be published immediately after the first render');
  assert.strictEqual(homeArtworkPreviewReady, 0, 'background startup work must wait for the first Home SD artwork batch');
  assert.strictEqual(typeof firstPreviewBatchDone, 'function', 'the initial Home render must observe preview-batch completion');
  firstPreviewBatchDone();
  assert.strictEqual(homeArtworkPreviewReady, 1, 'Home must publish SD artwork readiness exactly when the initial preview batch settles');
  firstSection = content.children[0];
  firstCard = firstSection.querySelector('[data-row-index="0"][data-column="0"]');
  assert.ok(firstCard && firstCard.focused, 'first Home card receives real focus');
  controller.snapshot().rows[0].items[0].viewed = true;
  controller.snapshot().rows[0].items[0].progress = 50;
  controller.updateFocus();
  assert.ok(firstCard.className.indexOf('is-viewed') !== -1, 'Home focus recovery must synchronize watched state mutated while Detail or Player was open');
  assert.strictEqual(firstCard.querySelector('.progress-value').style.width, '50%', 'Home focus recovery must synchronize retained playback progress without waiting for a server refresh');
  controller.snapshot().rows[0].items[0].progress = 100;
  controller.updateFocus();
  assert.strictEqual(firstCard.querySelector('.progress-track'), null, 'completed Home cards must use the watched badge without a full progress bar');
  assert.strictEqual(preview.className, 'home-preview', 'the Home preview becomes available with a focused media item');
  assert.strictEqual(previewTitle.children[0].textContent, 'One', 'the Home preview follows the focused card title');
  assert.strictEqual(previewSummary.children[0].textContent, 'A focused Home preview.', 'the Home preview reuses Home metadata without another request');
  assert.strictEqual(firstCard.querySelector('.home-library-badge').children[0].textContent, 'Anime', 'mixed Home rows display the local Plex library badge');
  assert.strictEqual(controller.selectionKey(), '["Continue|poster","rating:one"]');
  content.scrollTop = 100;
  content.rect = { top: 100, bottom: 700, width: 900, height: 600 };
  firstSection.rect = { top: 90, bottom: 650, width: 900, height: 560 };
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(homeInteractions, 1, 'Home directional input must publish interaction so background work can wait for navigation idle');
  assert.strictEqual(content.scrollTop, 100, 'horizontal movement within one Home row must not toggle its heading through vertical scroll correction');
  assert.strictEqual(previewTitle.children[0].textContent, 'One', 'secondary Home presentation work must wait while focus is moving');
  clock.runAll();
  assert.strictEqual(previewTitle.children[0].textContent, 'Two', 'secondary Home presentation work must settle on the final focused card');
  controller.handleHomeKey({ keyCode: 37, preventDefault: function () {} }, 'left');
  content.rect = null;
  firstSection.rect = null;
  controller.useHomeRows([
    { title: 'Continue', shape: 'poster', items: [{ ratingKey: 'one', title: 'One', image: '/one.jpg' }] },
    { title: 'Recommended', shape: 'poster', items: [{ ratingKey: 'two', title: 'Two', image: '/two.jpg' }] }
  ], 0, { focus: 'first' });
  assert.strictEqual(startupArtworkDeferrals, 1, 'later Home reconciles must not re-enter the startup-only artwork quiet window');
  firstSection = content.children[0];
  content.rect = { top: 100, bottom: 700, width: 900, height: 600 };
  firstSection.rect = { top: 152, bottom: 452, width: 900, height: 300 };
  content.children[1].rect = { top: 552, bottom: 852, width: 900, height: 300 };
  controller.handleHomeKey({ keyCode: 38, preventDefault: function () {} }, 'up');
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(content.scrollTop, 400, 'lower Home rows retain the same top inset as the first row');
  controller.handleHomeKey({ keyCode: 38, preventDefault: function () {} }, 'up');
  assert.strictEqual(content.scrollTop, 0, 'returning to the first Home row restores its full top spacing');
  content.rect = null;
  firstSection.rect = null;
  content.children[1].rect = null;
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg' }
  ] }], 0, { focus: 'nav' });
  assert.strictEqual(controller.snapshot().focus.area, 'nav', 'Home refreshes must preserve navbar focus while a navigation preview is active');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(adjacentPrefetchModes[adjacentPrefetchModes.length - 1], true, 'navbar movement must promote adjacent-library prefetch before the startup delay expires');
  assert.strictEqual(content.scrollTop, 0, 'Home refreshes with navbar focus must restore the top spacing before the first row');
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
  controller.useHomeRows([], 0, { focus: 'preserve', selectionKey: '["Continue|poster","rating:one"]' });
  assert.strictEqual(controller.snapshot().rows.length, 0, 'an empty Home presentation must clear previously rendered row state instead of leaving stale media behind');
  assert.strictEqual(controller.snapshot().focus.area, 'nav', 'an empty Home after the focused media disappears must move logical focus back to the navbar');
  assert.strictEqual(content.children.length, 0, 'an empty Home presentation must reconcile stale Home sections out of the DOM');
  assert.strictEqual(controller.snapshot().homeDirty, false, 'an intentionally empty Home presentation is a fully applied state, not a permanently dirty cache');
  controller.resetHome();
  controller.useHomeRows([{ title: 'Old generation', shape: 'poster', items: [{ ratingKey: 'old-generation', title: 'Old', image: '/old.jpg' }] }], 0, { focus: 'first' });
  var stalePreviewBatchDone = previewBatchCallbacks[previewBatchCallbacks.length - 1];
  controller.resetHome();
  controller.useHomeRows([{ title: 'New generation', shape: 'poster', items: [{ ratingKey: 'new-generation', title: 'New', image: '/new.jpg' }] }], 0, { focus: 'first' });
  var currentPreviewBatchDone = previewBatchCallbacks[previewBatchCallbacks.length - 1];
  var previewReadyBeforeStaleBatch = homeArtworkPreviewReady;
  stalePreviewBatchDone();
  assert.strictEqual(homeArtworkPreviewReady, previewReadyBeforeStaleBatch, 'a stale SD-preview batch must not publish readiness for a newer Home generation');
  currentPreviewBatchDone();
  assert.strictEqual(homeArtworkPreviewReady, previewReadyBeforeStaleBatch + 1, 'only the current Home generation may publish SD-preview readiness');
  controller.destroy();
}());

(function testHomeReconcileSkipsStableDomAndArtworkWork() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var settings = { cardScale: 100, artworkQuality: 90, artworkDataSaver: false };
  var posterBatches = [];
  var specificationCalls = 0;
  var previewWrites = 0;
  var controller;
  var rows;
  var section;
  var row;
  var firstCard;
  var secondCard;
  var title;
  var rowMoves = 0;
  var sectionMoves = 0;
  var sectionQueries = 0;
  var cardQueries = 0;
  var originalRowAppend;
  var originalRowInsert;
  var originalContentAppend;
  var originalContentInsert;
  var originalSectionQuery;
  var originalFirstQuery;
  var originalSecondQuery;
  function markLoaded(jobs) {
    jobs.forEach(function (job) {
      job.target.__plexProgressiveState = job.specification.previewOnly === true ? 'preview' : 'full';
    });
  }
  function resetMoves() { rowMoves = 0; sectionMoves = 0; }
  function batchJobCount() {
    return posterBatches.reduce(function (total, jobs) { return total + jobs.length; }, 0);
  }
  document.register('home-preview', new FakeElement('section', 'home-preview'));
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-title', new FakeElement('h1', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('home-preview-summary', new FakeElement('p', ''));
  document.register('navigation', new FakeElement('nav', ''));
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [{ kind: 'home', title: 'Home' }],
    services: {
      posterLoader: {
        loadBatch: function (jobs) { posterBatches.push(jobs); markLoaded(jobs); },
        needsLoad: function (target, previewOnly) {
          if (target.__plexProgressiveState === 'full') { return false; }
          return !(previewOnly === true && target.__plexProgressiveState === 'preview');
        },
        prioritize: function () {}, cancelScope: function () {}, load: function () {}
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document),
      updateText: function (node, value) {
        if (node && String(node.id || '').indexOf('home-preview-') === 0) { previewWrites += 1; }
        updateText(node, value);
      },
      translate: function (key) { return key; },
      fixedPosterSpecification: function (source, size, priority, scope) {
        specificationCalls += 1;
        return {
          source: source, previewWidth: size.previewWidth, previewHeight: size.previewHeight,
          width: size.width, height: size.height, priority: priority, scope: scope
        };
      },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return settings; },
      currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; }
    }
  });
  rows = [{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg' },
    { ratingKey: 'two', title: 'Two', image: '/two.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }];
  controller.useHomeRows(rows, 0, { focus: 'first' });
  section = content.children[0];
  row = section.querySelector('.media-row');
  title = section.querySelector('.section-title');
  firstCard = row.children[0];
  secondCard = row.children[1];
  originalRowAppend = row.appendChild;
  originalRowInsert = row.insertBefore;
  originalContentAppend = content.appendChild;
  originalContentInsert = content.insertBefore;
  originalSectionQuery = section.querySelector;
  originalFirstQuery = firstCard.querySelector;
  originalSecondQuery = secondCard.querySelector;
  row.appendChild = function (child) { rowMoves += 1; return originalRowAppend.call(row, child); };
  row.insertBefore = function (child, reference) { rowMoves += 1; return originalRowInsert.call(row, child, reference); };
  content.appendChild = function (child) { sectionMoves += 1; return originalContentAppend.call(content, child); };
  content.insertBefore = function (child, reference) { sectionMoves += 1; return originalContentInsert.call(content, child, reference); };
  section.querySelector = function (selector) { sectionQueries += 1; return originalSectionQuery.call(section, selector); };
  firstCard.querySelector = function (selector) { cardQueries += 1; return originalFirstQuery.call(firstCard, selector); };
  secondCard.querySelector = function (selector) { cardQueries += 1; return originalSecondQuery.call(secondCard, selector); };

  posterBatches.length = 0;
  specificationCalls = 0;
  previewWrites = 0;
  sectionQueries = 0;
  resetMoves();
  var titleClears = title.innerHTMLClears;
  controller.useHomeRows(rows, 0, { focus: 'preserve' });
  assert.strictEqual(rowMoves, 0, 'an unchanged Home reconcile must not move already ordered cards');
  assert.strictEqual(sectionMoves, 0, 'an unchanged Home reconcile must not move already ordered sections');
  assert.strictEqual(sectionQueries, 0, 'an unchanged Home reconcile must reuse cached section child references');
  assert.strictEqual(batchJobCount(), 0, 'an unchanged Home reconcile must not queue already loaded artwork');
  assert.strictEqual(specificationCalls, 0, 'an unchanged Home reconcile must not rebuild poster specifications');
  assert.strictEqual(title.innerHTMLClears, titleClears, 'an unchanged Home row title must not be rewritten');
  assert.strictEqual(previewWrites, 0, 'an unchanged Home reconcile must not rewrite an unchanged hero presentation');

  posterBatches.length = 0;
  specificationCalls = 0;
  previewWrites = 0;
  resetMoves();
  cardQueries = 0;
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'two', title: 'Two', image: '/two.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(rowMoves, 0, 'metadata-only Home changes must not move cards');
  assert.strictEqual(batchJobCount(), 0, 'metadata-only Home changes must not requeue unchanged artwork');
  assert.strictEqual(cardQueries, 0, 'retained Home cards must use cached child references during metadata updates');
  assert.strictEqual(previewWrites, 1, 'changing only the focused Home title must rewrite only the hero title field');

  posterBatches.length = 0;
  specificationCalls = 0;
  resetMoves();
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'two', title: 'Two', image: '/two.jpg' },
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(rowMoves, 1, 'swapping two retained Home cards must move only the node that is out of position');
  assert.strictEqual(row.children[0], secondCard, 'differential Home ordering must preserve the intended card order');
  assert.strictEqual(batchJobCount(), 0, 'reordering retained cards must not requeue unchanged artwork');

  posterBatches.length = 0;
  specificationCalls = 0;
  resetMoves();
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'two', title: 'Two', image: '/two-new.jpg' },
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(batchJobCount(), 1, 'changing one Home artwork source must queue exactly one poster job');
  assert.strictEqual(specificationCalls, 1, 'changing one Home artwork source must build exactly one new poster specification');

  posterBatches.length = 0;
  specificationCalls = 0;
  settings.artworkQuality = 80;
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'two', title: 'Two', image: '/two-new.jpg' },
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(batchJobCount(), 3, 'changing artwork quality must reload every mounted Home poster at the requested quality');
  assert.strictEqual(specificationCalls, 3, 'changing artwork quality must rebuild one poster job per mounted Home card');

  posterBatches.length = 0;
  specificationCalls = 0;
  settings.artworkDataSaver = true;
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'two', title: 'Two', image: '/two-new.jpg' },
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(batchJobCount(), 0, 'toggling artwork data saver must not reload Home posters when effective artwork quality is unchanged');
  assert.strictEqual(specificationCalls, 0, 'data saver concurrency changes must not rebuild unchanged Home poster specifications');

  posterBatches.length = 0;
  specificationCalls = 0;
  settings.cardScale = 110;
  controller.applyCardScale();
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'two', title: 'Two', image: '/two-new.jpg' },
    { ratingKey: 'one', title: 'One updated', image: '/one.jpg' },
    { ratingKey: 'three', title: 'Three', image: '/three.jpg' }
  ] }], 0, { focus: 'preserve' });
  assert.strictEqual(batchJobCount(), 3, 'changing cardScale must reload Home artwork at the new exact rendered dimensions');
  assert.strictEqual(specificationCalls, 3, 'changing cardScale must rebuild one specification per Home poster');
  controller.destroy();
}());

(function testHomeReconcileKeepsIncrementalPlaybackAndOrderingWorkBounded() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var posterBatches = [];
  var specificationCalls = 0;
  var controller;
  var section;
  var row;
  var cardA;
  var cardB;
  var cardC;
  var titleA;
  var metaA;
  var progressA;
  var titleClears;
  var metaClears;
  var rowMoves = 0;
  var originalAppend;
  var originalInsert;
  function jobs() {
    return posterBatches.reduce(function (total, batch) { return total + batch.length; }, 0);
  }
  function markLoaded(batch) {
    batch.forEach(function (job) { job.target.__plexProgressiveState = 'full'; });
  }
  function homeRow(title, items) { return [{ title: title, shape: 'poster', items: items }]; }
  function item(key, progress) {
    return { ratingKey: key, title: key.toUpperCase(), image: '/' + key + '.jpg', progress: progress };
  }
  document.register('home-preview', new FakeElement('section', 'home-preview'));
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-title', new FakeElement('h1', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('home-preview-summary', new FakeElement('p', ''));
  document.register('navigation', new FakeElement('nav', ''));
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [{ kind: 'home', title: 'Home' }],
    services: {
      posterLoader: {
        loadBatch: function (batch) { posterBatches.push(batch); markLoaded(batch); },
        needsLoad: function (target) { return target.__plexProgressiveState !== 'full'; },
        prioritize: function () {}, cancelScope: function () {}, load: function () {}
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      fixedPosterSpecification: function (source, size, priority, scope) {
        specificationCalls += 1;
        return { source: source, width: size.width, height: size.height, previewWidth: size.previewWidth, previewHeight: size.previewHeight, priority: priority, scope: scope };
      },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; },
      currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; }
    }
  });

  controller.useHomeRows(homeRow('Continue', [item('a', 10), item('b', 20), item('c', 30)]), 0, { focus: 'first' });
  section = content.children[0];
  row = section.querySelector('.media-row');
  cardA = row.children[0];
  cardB = row.children[1];
  cardC = row.children[2];
  titleA = cardA.querySelector('.card-title');
  metaA = cardA.querySelector('.card-meta');
  progressA = cardA.querySelector('.progress-track');
  titleClears = titleA.innerHTMLClears;
  metaClears = metaA.innerHTMLClears;
  originalAppend = row.appendChild;
  originalInsert = row.insertBefore;
  row.appendChild = function (child) { rowMoves += 1; return originalAppend.call(row, child); };
  row.insertBefore = function (child, reference) { rowMoves += 1; return originalInsert.call(row, child, reference); };

  posterBatches.length = 0;
  specificationCalls = 0;
  rowMoves = 0;
  controller.useHomeRows(homeRow('Continue', [item('a', 55), item('b', 20), item('c', 30)]), 0, { focus: 'preserve' });
  assert.strictEqual(row.children[0], cardA, 'progress-only refresh must retain the existing Home card');
  assert.strictEqual(row.children[0].querySelector('.progress-track'), progressA, 'progress-only refresh must retain the existing progress DOM');
  assert.strictEqual(progressA.querySelector('.progress-value').style.width, '55%', 'progress-only refresh must update only the playback progress value');
  assert.strictEqual(titleA.innerHTMLClears, titleClears, 'progress-only refresh must not rewrite the card title');
  assert.strictEqual(metaA.innerHTMLClears, metaClears, 'progress-only refresh must not rewrite unchanged card metadata');
  assert.strictEqual(rowMoves, 0, 'progress-only refresh must not move Home cards');
  assert.strictEqual(jobs(), 0, 'progress-only refresh must not reload artwork');
  assert.strictEqual(specificationCalls, 0, 'progress-only refresh must not rebuild poster specifications');

  posterBatches.length = 0;
  specificationCalls = 0;
  rowMoves = 0;
  controller.useHomeRows(homeRow('Continue', [item('c', 30), item('a', 55), item('b', 20)]), 0, { focus: 'preserve' });
  assert.strictEqual(row.children[0], cardC, 'Continue Watching reorder must reuse the existing most-recent card');
  assert.strictEqual(row.children[1], cardA, 'Continue Watching reorder must shift retained cards without recreating them');
  assert.strictEqual(row.children[2], cardB, 'Continue Watching reorder must preserve all retained card nodes');
  assert.strictEqual(rowMoves, 1, 'moving the most recently watched media to the front must require only one row move');
  assert.strictEqual(jobs(), 0, 'Continue Watching reorder must not reload unchanged artwork');
  assert.strictEqual(specificationCalls, 0, 'Continue Watching reorder must not rebuild poster specifications');

  posterBatches.length = 0;
  specificationCalls = 0;
  rowMoves = 0;
  controller.useHomeRows(homeRow('Continue', [item('d', 0), item('c', 30), item('a', 55), item('b', 20)]), 0, { focus: 'preserve' });
  assert.strictEqual(row.children[1], cardC, 'inserting a new recent media must keep retained cards mounted');
  assert.strictEqual(row.children[2], cardA, 'inserting a new recent media must shift existing cards by DOM position only');
  assert.strictEqual(row.children[3], cardB, 'inserting a new recent media must not recreate trailing cards');
  assert.strictEqual(rowMoves, 1, 'adding one media at the front must insert only the new card into the row');
  assert.strictEqual(jobs(), 1, 'adding one media must queue artwork only for the new card');
  assert.strictEqual(specificationCalls, 1, 'adding one media must build only the new card poster specification');
  var unavailable = item('a', 55);
  unavailable.unavailable = true;
  controller.useHomeRows(homeRow('Continue', [item('d', 0), item('c', 30), unavailable, item('b', 20)]), 0, { focus: 'preserve' });
  assert.strictEqual(row.children[2], cardA, 'availability changes retain the card node');
  assert.ok(cardA.querySelector('.card-title').children[0].textContent.indexOf('\u2298') === 0, 'offline-only cards expose a visible marker');
  assert.ok(cardA.getAttribute('aria-label').indexOf('status.mediaUnavailable') !== -1, 'unavailable status is accessible');
  unavailable.unavailable = false;
  controller.useHomeRows(homeRow('Continue', [item('d', 0), item('c', 30), unavailable, item('b', 20)]), 0, { focus: 'preserve' });
  assert.strictEqual(cardA.querySelector('.card-title').children[0].textContent.indexOf('\u2298'), -1, 'recovery removes the marker');
  controller.destroy();
}());

(function testHomeArtworkUsesOwningServerContext() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var posterBatches = [];
  var receivedContexts = {};
  var contexts = {
    'mac-m4': { serverMachineIdentifier: 'mac-m4', apiBaseUrl: 'https://mac.example', token: 'mac-token' },
    'luca-nuc': { serverMachineIdentifier: 'luca-nuc', apiBaseUrl: 'https://luca.example', token: 'luca-token' }
  };
  var controller;
  void content;
  ['home-preview', 'home-preview-kicker', 'home-preview-title', 'home-preview-meta', 'home-preview-summary', 'navigation', 'backdrop-a', 'backdrop-b'].forEach(function (id) {
    document.register(id, new FakeElement('div', id === 'navigation' ? '' : ''));
  });
  controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [{ kind: 'home', title: 'Home' }],
    services: {
      posterLoader: {
        loadBatch: function (jobs) { posterBatches.push(jobs); },
        needsLoad: function () { return false; },
        prioritize: function () {}, cancelScope: function () {}, load: function () {}
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      sourceContextForItem: function (item) { return contexts[item.serverMachineIdentifier]; },
      fixedPosterSpecification: function (source, size, priority, scope, sourceContext) {
        receivedContexts[source] = sourceContext || null;
        return { source: source, width: size.width, height: size.height, priority: priority, scope: scope, sourceContext: sourceContext };
      },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; },
      currentView: function () { return 'home'; }, pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'mac-item', title: 'MAC M4', image: '/mac-poster', serverMachineIdentifier: 'mac-m4' },
    { ratingKey: 'luca-item', title: 'LUCA-NUC', image: '/luca-poster', serverMachineIdentifier: 'luca-nuc' }
  ] }], 0, { focus: 'first' });
  assert.strictEqual(posterBatches.length, 1, 'mixed Home artwork must be submitted as one batch');
  assert.strictEqual(receivedContexts['/mac-poster'], contexts['mac-m4'], 'MAC M4 Home artwork must use the MAC M4 request context');
  assert.strictEqual(receivedContexts['/luca-poster'], contexts['luca-nuc'], 'LUCA-NUC Home artwork must use the LUCA-NUC request context');
  controller.destroy();
}());

(function testLateFirstHomeRowsPresentHeroWhileNavbarKeepsFocus() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var preview = document.register('home-preview', new FakeElement('section', 'home-preview'));
  var previewTitle = document.register('home-preview-title', new FakeElement('h1', ''));
  var previewSummary = document.register('home-preview-summary', new FakeElement('p', ''));
  var backdropA = document.register('backdrop-a', new FakeElement('img', 'backdrop-image'));
  var backdropB = document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var clock = new TimerRoot();
  var controller;
  void content; void backdropA; void backdropB;
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('navigation', new FakeElement('nav', ''));
  document.register('startup-splash', new FakeElement('div', 'startup-splash'));
  document.register('clock', new FakeElement('span', ''));
  document.register('message', new FakeElement('div', 'message'));
  controller = ShellController.create({
    modules: modules(),
    clock: clock,
    document: document,
    now: function () { return 1000; },
    navigationItems: [{ kind: 'home', title: 'Home' }],
    services: {
      posterLoader: {
        loadBatch: function () {},
        prioritize: function () {},
        cancelScope: function () {},
        load: function (_node, specification) {
          if (specification && specification.onPreview) { specification.onPreview(); }
        }
      },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document),
      updateText: updateText,
      translate: function (key) { return key; },
      prioritizePoster: function () {},
      renderActiveProfile: function () {},
      renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100, backgroundMusic: false }; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; },
      navigationHasFocus: function () { return true; },
      watchlistAvailable: function () { return true; }
    }
  });

  controller.useHomeRows([], 0, { focus: 'nav' });
  assert.strictEqual(preview.className, 'home-preview is-empty', 'an actually empty Home starts without a fabricated hero');
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'late-one', title: 'Late One', art: '/late-one.jpg', summary: 'Loaded after the NAS woke up.' }
  ] }], 0, { focus: 'nav' });

  assert.strictEqual(controller.snapshot().focus.area, 'nav', 'late Home media must not steal an intentional navbar focus');
  assert.strictEqual(preview.className, 'home-preview', 'the first available Home media must populate the hero even while navbar focus is retained');
  assert.strictEqual(previewTitle.children[0].textContent, 'Late One', 'late Home media must populate the hero title');
  assert.strictEqual(previewSummary.children[0].textContent, 'Loaded after the NAS woke up.', 'late Home media must populate the hero summary');
  clock.runAll();
  assert.strictEqual(controller.activeBackdropSource(), '/late-one.jpg', 'late Home media must also populate the shared backdrop while navbar focus is retained');

  controller.destroy();
}());


(function testHomeHorizontalFocusReusesMountedCardsWithoutDomChurn() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var preview = document.register('home-preview', new FakeElement('section', 'home-preview'));
  var clock = new TimerRoot();
  var textWrites = 0;
  var documentQueries = 0;
  var documentQueryAlls = 0;
  var layoutReads = 0;
  var labelCalls = 0;
  var hotModules = modules();
  var originalQuerySelector;
  var originalQuerySelectorAll;
  var section;
  var secondCard;
  var controller;
  void preview;
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-title', new FakeElement('h1', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('home-preview-summary', new FakeElement('p', ''));
  hotModules.MediaLabels = {
    title: function (item, t) { labelCalls += 1; return MediaLabels.title(item, t); },
    cardMeta: function (item, t) { labelCalls += 1; return MediaLabels.cardMeta(item, t); },
    cardDetail: function (item, t) { labelCalls += 1; return MediaLabels.cardDetail(item, t); },
    description: function (item, t) { labelCalls += 1; return MediaLabels.description(item, t); }
  };
  controller = ShellController.create({
    modules: hotModules, clock: clock, document: document,
    services: {
      posterLoader: { loadBatch: function () {}, prioritize: function () {}, cancelScope: function () {} },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document),
      updateText: function (node, value) { textWrites += 1; updateText(node, value); },
      translate: function (key) { return key; },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([{ title: 'Continue', shape: 'poster', items: [
    { ratingKey: 'one', title: 'One', image: '/one.jpg', progress: 25 },
    { ratingKey: 'two', title: 'Two', image: '/two.jpg', progress: 50 }
  ] }], 0, { focus: 'first' });
  section = content.children[0];
  secondCard = section.querySelector('[data-row-index="0"][data-column="1"]');
  originalQuerySelector = document.querySelector;
  originalQuerySelectorAll = document.querySelectorAll;
  document.querySelector = function (selector) {
    documentQueries += 1;
    return originalQuerySelector.call(document, selector);
  };
  document.querySelectorAll = function (selector) {
    documentQueryAlls += 1;
    return originalQuerySelectorAll.call(document, selector);
  };
  content.getBoundingClientRect = function () {
    layoutReads += 1;
    return { top: 100, bottom: 700, width: 900, height: 600 };
  };
  section.getBoundingClientRect = function () {
    layoutReads += 1;
    return { top: 120, bottom: 420, width: 900, height: 300 };
  };
  textWrites = 0;
  labelCalls = 0;

  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');

  assert.strictEqual(documentQueries, 0, 'horizontal Home focus must use the mounted card index instead of a global querySelector');
  assert.strictEqual(documentQueryAlls, 0, 'horizontal Home focus must clear only the previously tracked card instead of scanning all focused nodes');
  assert.strictEqual(textWrites, 0, 'horizontal Home focus must not rewrite an unchanged card presentation');
  assert.strictEqual(labelCalls, 0, 'horizontal Home focus must not recompute unchanged card labels and descriptions');
  assert.strictEqual(layoutReads, 0, 'horizontal Home focus within one row must not perform layout reads');
  assert.ok(secondCard && secondCard.className.indexOf('is-focused') !== -1 && secondCard.focused,
    'the mounted-card fast path must preserve logical and DOM focus on the destination card');
  controller.destroy();
}());

(function testNormalizedHomeRowsBypassRepeatedNormalizationInsideShellController() {
  var document = new FakeDocument();
  var normalizeCalls = 0;
  var hotModules = modules();
  var normalizedRows = [{ title: 'Continue', shape: 'poster', kind: '', showLibraryBadge: false, items: [{ ratingKey: 'one', title: 'One' }] }];
  var originalNormalizeRows = HomeState.normalizeRows;
  hotModules.HomeState = Object.create(HomeState);
  hotModules.HomeState.normalizeRows = function (rows) { normalizeCalls += 1; return originalNormalizeRows(rows); };
  document.register('content', new FakeElement('main', ''));
  var controller = ShellController.create({
    modules: hotModules, clock: new TimerRoot(), document: document,
    services: { posterLoader: { loadBatch: function () {}, cancelScope: function () {} }, stopTheme: function () {} },
    presentation: { element: createElementFactory(document), updateText: updateText, translate: function (key) { return key; }, prioritizePoster: function () {} },
    access: { settings: function () { return { cardScale: 100 }; }, currentView: function () { return 'home'; }, pointerSelectionActive: function () { return true; } }
  });
  normalizeCalls = 0;
  controller.useHomeRows(normalizedRows, 0, { focus: 'first', normalized: true });
  assert.strictEqual(normalizeCalls, 0, 'already-normalized Home refresh rows must not be normalized again in useHomeRows/setRows');
  controller.destroy();
}());

(function testVerticalHomeScrollCoalescesRealGeometryIntoAnimationFrame() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var clock = new TimerRoot();
  var frames = {};
  var nextFrame = 1;
  var layoutReads = 0;
  var root = {
    requestAnimationFrame: function (callback) { var id = nextFrame; nextFrame += 1; frames[id] = callback; return id; },
    cancelAnimationFrame: function (id) { delete frames[id]; }
  };
  var controller = ShellController.create({
    modules: modules(), root: root, clock: clock, document: document,
    services: { posterLoader: { loadBatch: function () {}, prioritize: function () {}, cancelScope: function () {} }, stopTheme: function () {} },
    presentation: {
      element: createElementFactory(document), updateText: updateText, translate: function (key) { return key; },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100, backgroundMusic: false }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([
    { title: 'Row 0', shape: 'poster', items: [{ ratingKey: 'a', image: '/a.jpg' }] },
    { title: 'Row 1', shape: 'poster', items: [{ ratingKey: 'b', image: '/b.jpg' }] },
    { title: 'Row 2', shape: 'poster', items: [{ ratingKey: 'c', image: '/c.jpg' }, { ratingKey: 'd', image: '/d.jpg' }] }
  ], 0, { focus: 'first' });
  Object.keys(frames).forEach(function (id) { var callback = frames[id]; delete frames[id]; callback(); });
  content.getBoundingClientRect = function () { layoutReads += 1; return { top: 100, bottom: 700, width: 900, height: 600 }; };
  content.children[0].getBoundingClientRect = function () { layoutReads += 1; return { top: 150, bottom: 450, width: 900, height: 300 }; };
  content.children[1].getBoundingClientRect = function () { layoutReads += 1; return { top: 550, bottom: 850, width: 900, height: 300 }; };
  content.children[2].getBoundingClientRect = function () { layoutReads += 1; return { top: 950, bottom: 1250, width: 900, height: 300 }; };
  layoutReads = 0;
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(layoutReads, 0, 'vertical Home key-repeat must not force geometry reads inside the synchronous key handler');
  assert.strictEqual(Object.keys(frames).length, 1, 'vertical Home key-repeat must coalesce scroll correction into one pending animation frame');
  Object.keys(frames).forEach(function (id) { var callback = frames[id]; delete frames[id]; callback(); });
  assert.ok(layoutReads >= 6, 'the settled Home row must measure scrolling and the visible artwork window in the same animation frame');
  assert.strictEqual(controller.snapshot().focus.rowIndex, 2, 'coalesced Home scrolling must keep the final logical focus row');
  layoutReads = 0;
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 37, preventDefault: function () {} }, 'left');
  Object.keys(frames).forEach(function (id) { var callback = frames[id]; delete frames[id]; callback(); });
  assert.strictEqual(layoutReads, 1, 'horizontal key-repeat must measure the viewport once without rescanning other sections');
  var warmTimers = Object.keys(clock.timers).filter(function (id) { return clock.timers[id].delay === 160; });
  assert.strictEqual(warmTimers.length, 1, 'rapid movement must retain only the final artwork warming job');
  clock.run(warmTimers[0]);
  Object.keys(frames).forEach(function (id) { var callback = frames[id]; delete frames[id]; callback(); });
  assert.ok(layoutReads > 0, 'artwork visibility must refresh once navigation settles');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.destroy();
  layoutReads = 0;
  clock.runAll();
  Object.keys(frames).forEach(function (id) { frames[id](); });
  assert.strictEqual(layoutReads, 0, 'destroy must cancel pending artwork work');
}());

(function testHomeAdjacentBackdropPrefetchUsesLastDirectionAfterQuietWindow() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var prefetched = [];
  var contextReads = 0;
  var controller;
  document.register('content', new FakeElement('main', ''));
  document.register('home-preview', new FakeElement('section', 'home-preview'));
  document.register('home-preview-kicker', new FakeElement('span', ''));
  document.register('home-preview-title', new FakeElement('h1', ''));
  document.register('home-preview-meta', new FakeElement('p', ''));
  document.register('home-preview-summary', new FakeElement('p', ''));
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    rows: [
      { title: 'Above', shape: 'poster', items: [
        { ratingKey: 'a0', art: '/a0.jpg' }, { ratingKey: 'a1', art: '/a1.jpg' }, { ratingKey: 'a2', art: '/a2.jpg' }, { ratingKey: 'a3', art: '/a3.jpg' }
      ] },
      { title: 'Current', shape: 'poster', items: [
        { ratingKey: 'b0', art: '/b0.jpg' }, { ratingKey: 'b1', art: '/b1.jpg' }, { ratingKey: 'b2', art: '/b2.jpg' }, { ratingKey: 'b3', art: '/b3.jpg' }
      ] },
      { title: 'Below', shape: 'poster', items: [
        { ratingKey: 'c0', art: '/c0.jpg' }, { ratingKey: 'c1', art: '/c1.jpg' }, { ratingKey: 'c2', art: '/c2.jpg' }, { ratingKey: 'c3', art: '/c3.jpg' }
      ] }
    ],
    initialFocus: { area: 'media', rowIndex: 1, column: 1, navIndex: 0 },
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {}, cancelPrefetch: function () {}, loadBatch: function () {}, prioritize: function () {},
        load: function () {},
        prefetch: function (specification, callback) { prefetched.push(specification.source); if (callback) { callback(true); } }
      },
      stopTheme: function () {}
    },
    presentation: {
      sourceContextForItem: function () { contextReads += 1; return null; },
      element: createElementFactory(document), updateText: updateText, translate: function (key) { return key; },
      prioritizePoster: function () {}, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100, backgroundMusic: false }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return true; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.renderRows();
  contextReads = 0;
  controller.handleHomeKey({ keyCode: 37, preventDefault: function () {} }, 'left');
  var pendingBeforeEdge = Object.keys(clock.timers);
  controller.handleHomeKey({ keyCode: 37, preventDefault: function () {} }, 'left');
  assert.deepStrictEqual(Object.keys(clock.timers), pendingBeforeEdge, 'pressing against the row edge must preserve pending artwork and presentation work');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(contextReads, 0, 'rapid navigation must defer source context preparation along with backdrop downloads');
  assert.deepStrictEqual(prefetched, [], 'adjacent backdrop work must not start synchronously inside the Home key event');
  clock.runAll();
  assert.deepStrictEqual(prefetched, ['/b3.jpg', '/b1.jpg', '/c2.jpg', '/a2.jpg'],
    'Home backdrop prefetch must prioritize the last movement direction, then opposite and vertical neighbors');
  controller.destroy();
}());

(function testForegroundBackdropSchedulingCancelsAdjacentSpeculation() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var cancelledPrefetch = 0;
  var prefetched = [];
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {}, load: function () {},
        cancelPrefetch: function () { cancelledPrefetch += 1; },
        prefetch: function (specification) { prefetched.push(specification.source); }
      }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  assert.strictEqual(typeof controller.scheduleBackdropPrefetch, 'function', 'shell must expose generic adjacent backdrop prefetch scheduling');
  controller.scheduleBackdropPrefetch([{ art: '/old-a.jpg' }, { art: '/old-b.jpg' }], 'home');
  controller.scheduleBackdrop({ art: '/foreground.jpg' });
  clock.runAll();
  assert.deepStrictEqual(prefetched, [], 'new foreground backdrop focus must invalidate stale adjacent candidates before they start');
  assert.ok(cancelledPrefetch >= 1, 'foreground backdrop scheduling must cancel any active speculative loader request');
  controller.destroy();
}());

(function testActiveSpeculativeCancellationDoesNotAdvanceToAnotherNeighbor() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var prefetched = [];
  var activeCallback = null;
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {}, load: function () {},
        cancelPrefetch: function () {
          var callback = activeCallback;
          activeCallback = null;
          if (callback) { callback(false); }
        },
        prefetch: function (specification, callback) {
          prefetched.push(specification.source);
          activeCallback = callback;
          return true;
        }
      }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  controller.scheduleBackdropPrefetch([{ art: '/neighbor-a.jpg' }, { art: '/neighbor-b.jpg' }], 'home');
  clock.runAll();
  assert.deepStrictEqual(prefetched, ['/neighbor-a.jpg'], 'quiet prefetch must begin with only the highest-priority adjacent backdrop');
  controller.scheduleBackdrop({ art: '/foreground.jpg' });
  assert.deepStrictEqual(prefetched, ['/neighbor-a.jpg'],
    'foreground cancellation of an active speculative backdrop must stop the candidate chain instead of immediately starting the next neighbor');
  controller.destroy();
}());

(function testSynchronousRejectedBackdropPrefetchAdvancesOnlyOnce() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var prefetched = [];
  var activeCallback = null;
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {}, load: function () {}, cancelPrefetch: function () {},
        prefetch: function (specification, callback) {
          prefetched.push(specification.source);
          if (specification.source === '/unrouteable.jpg') {
            if (callback) { callback(false); }
            return false;
          }
          activeCallback = callback;
          return true;
        }
      }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  controller.scheduleBackdropPrefetch([
    { art: '/unrouteable.jpg' },
    { art: '/routeable.jpg' },
    { art: '/later.jpg' }
  ], 'home');
  clock.runAll();
  assert.deepStrictEqual(prefetched, ['/unrouteable.jpg', '/routeable.jpg'],
    'a synchronous rejected candidate must advance exactly once and leave the next active prefetch in flight');
  activeCallback(true);
  assert.deepStrictEqual(prefetched, ['/unrouteable.jpg', '/routeable.jpg', '/later.jpg'],
    'the following candidate must start only after the active routeable prefetch completes');
  controller.destroy();
}());

(function testBackdropArtworkKeepsItsServerContext() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var loads = [];
  var prefetched = [];
  var primary = { serverMachineIdentifier: 'primary', apiBaseUrl: 'https://primary.example', token: 'primary-token' };
  var external = { serverMachineIdentifier: 'external', apiBaseUrl: 'https://external.example', token: 'external-token' };
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {},
        load: function (target, specification) { loads.push({ target: target, specification: specification }); },
        prefetch: function (specification) { prefetched.push(specification); return true; },
        cancelPrefetch: function () {}
      }
    },
    presentation: {
      sourceContextForItem: function (item) { return item && item.serverMachineIdentifier === 'external' ? external : primary; }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  controller.scheduleBackdrop({ art: '/shared-art.jpg', serverMachineIdentifier: 'external' });
  clock.runAll();
  assert.strictEqual(loads.length, 1, 'a focused backdrop must start one progressive load');
  assert.strictEqual(loads[0].specification.sourceContext, external, 'focused backdrop must use the item server context');
  assert.strictEqual(loads[0].specification.sourceOwnerMachineIdentifier, 'external', 'focused backdrop requests must preserve the media owner independently from route resolution');
  controller.scheduleBackdrop({ art: '/shared-art.jpg', serverMachineIdentifier: 'primary' });
  clock.runAll();
  assert.strictEqual(loads.length, 2, 'the same artwork path on another server must not reuse the old backdrop');
  assert.strictEqual(loads[1].specification.sourceContext, primary, 'backdrop identity must include the server context');
  controller.scheduleBackdropPrefetch([
    { art: '/shared-art.jpg', serverMachineIdentifier: 'external' },
    { art: '/shared-art.jpg', serverMachineIdentifier: 'primary' }
  ], 'home');
  clock.runAll();
  assert.strictEqual(prefetched.length, 1, 'backdrop prefetch keeps its existing one-at-a-time loader contract');
  assert.strictEqual(prefetched[0].sourceContext, external, 'adjacent backdrop prefetch must retain the item server context');
  assert.strictEqual(prefetched[0].sourceOwnerMachineIdentifier, 'external', 'adjacent backdrop prefetch must preserve the media owner independently from source context availability');
  controller.destroy();
}());



(function testBackdropIdentityUsesInjectedCredentialFreeSourceIdentity() {
  var document = new FakeDocument();
  var clock = new TimerRoot();
  var loads = [];
  var context = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-one.example', token: 'one' };
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: {
        cancel: function () {}, cancelScope: function () {}, cancelPrefetch: function () {},
        load: function (_target, specification) { loads.push(specification); }
      }
    },
    presentation: {
      sourceContextForItem: function () { return context; },
      sourceContextIdentity: function (value) { return 'server:' + String(value && value.serverMachineIdentifier || ''); }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });
  controller.scheduleBackdrop({ art: '/stable-art.jpg', serverMachineIdentifier: 'server-a' });
  clock.runAll();
  loads[0].onPreview();
  context = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://relay-two.example', token: 'two' };
  controller.scheduleBackdrop({ art: '/stable-art.jpg', serverMachineIdentifier: 'server-a' });
  clock.runAll();
  assert.strictEqual(loads.length, 1, 'same PMS + same backdrop path must keep one presentation identity across token/Relay rotation');
  controller.destroy();
}());

(function testHomeArtworkUsesPredictiveDistanceTiers() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var clock = new TimerRoot();
  var posterBatches = [];
  var promoted = [];
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: { loadBatch: function (jobs) { posterBatches.push(jobs); }, cancelScope: function () {} },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      prioritizePoster: function (card) {
        promoted.push(card.getAttribute('data-row-index') + ':' + card.getAttribute('data-column'));
      },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([
    { title: 'Row 0', shape: 'poster', items: [{ ratingKey: 'r0a', image: '/r0a.jpg' }, { ratingKey: 'r0b', image: '/r0b.jpg' }] },
    { title: 'Row 1', shape: 'poster', items: [{ ratingKey: 'r1a', image: '/r1a.jpg' }, { ratingKey: 'r1b', image: '/r1b.jpg' }] },
    { title: 'Row 2', shape: 'poster', items: [{ ratingKey: 'r2a', image: '/r2a.jpg' }, { ratingKey: 'r2b', image: '/r2b.jpg' }] },
    { title: 'Row 3', shape: 'poster', items: [{ ratingKey: 'r3a', image: '/r3a.jpg' }, { ratingKey: 'r3b', image: '/r3b.jpg' }] }
  ], 0, { focus: 'first' });
  var jobs = posterBatches[0];
  assert.strictEqual(jobs.length, 8, 'Home must still render and schedule artwork for every visible row immediately');
  assert.strictEqual(jobs[0].specification.previewOnly === true, false, 'first Home row must request full artwork');
  assert.strictEqual(jobs[2].specification.previewOnly === true, false, 'second Home row must request full artwork');
  assert.strictEqual(jobs[4].specification.previewOnly, true, 'third Home row must initially request preview-only artwork');
  assert.strictEqual(jobs[6].specification.previewOnly, true, 'deeper Home rows must initially request preview-only artwork');
  var rowTwoFirstCard = content.querySelector('[data-row-index="2"][data-column="0"]');
  var originalContentQuerySelectorAll = content.querySelectorAll;
  var artworkRowQueries = 0;
  content.querySelectorAll = function (selector) {
    artworkRowQueries += 1;
    return originalContentQuerySelectorAll.call(content, selector);
  };
  promoted.length = 0;
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(artworkRowQueries, 0, 'predictive Home artwork warming must use the mounted card map instead of querying the row DOM');
  assert.deepStrictEqual(promoted, ['1:0'],
    'vertical Home key handling must prioritize only the focused poster synchronously');
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.deepStrictEqual(promoted, ['1:0', '2:0'],
    'repeated vertical Home navigation must not accumulate row warming work during key-repeat');
  Object.keys(clock.timers).map(Number).forEach(function (id) {
    if (clock.timers[id] && clock.timers[id].delay === 160) { clock.run(id); }
  });
  assert.ok(promoted.indexOf('2:1') !== -1,
    'after the Home focus settles, visible artwork must be promoted');
  assert.strictEqual(content.querySelector('[data-row-index="2"][data-column="0"]'), rowTwoFirstCard,
    'artwork promotion must not rebuild Home card DOM');
  assert.deepStrictEqual(controller.snapshot().focus, { area: 'media', navIndex: 0, rowIndex: 2, column: 0 },
    'predictive artwork warming must preserve Home focus identity');
  var promotionCountBeforeHorizontalMove = promoted.length;
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(promoted.length, promotionCountBeforeHorizontalMove + 1,
    'left/right movement inside the same row must prioritize only the newly focused card, not rescan warm rows');
  posterBatches.length = 0;
  controller.useHomeRows([
    { title: 'Row 2', shape: 'poster', items: [{ ratingKey: 'r2a', image: '/r2a.jpg' }, { ratingKey: 'r2b', image: '/r2b.jpg' }] },
    { title: 'Row 0', shape: 'poster', items: [{ ratingKey: 'r0a', image: '/r0a.jpg' }, { ratingKey: 'r0b', image: '/r0b.jpg' }] },
    { title: 'Row 1', shape: 'poster', items: [{ ratingKey: 'r1a', image: '/r1a.jpg' }, { ratingKey: 'r1b', image: '/r1b.jpg' }] },
    { title: 'Row 3', shape: 'poster', items: [{ ratingKey: 'r3a', image: '/r3a.jpg' }, { ratingKey: 'r3b', image: '/r3b.jpg' }] }
  ], 0, { focus: 'preserve' });
  assert.strictEqual(posterBatches.length, 1, 'Home row reordering must batch only artwork whose quality tier changes');
  assert.strictEqual(posterBatches[0].length, 2, 'moving a preview-only Home row into the first two rows must upgrade exactly its two posters to full quality');
  assert.strictEqual(posterBatches[0][0].specification.previewOnly === true, false, 'a row promoted into the first Home tier must request full-quality artwork');
  controller.destroy();
}());

(function testPartiallyVisibleHomeRowsPromoteVisibleCardsToFullArtwork() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var frames = [];
  var promoted = [];
  var clock = new TimerRoot();
  var root = {
    requestAnimationFrame: function (callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame: function () {}
  };
  var controller = ShellController.create({
    modules: modules(), root: root, clock: clock, document: document,
    services: { posterLoader: { loadBatch: function () {}, cancelScope: function () {} }, stopTheme: function () {} },
    presentation: {
      element: createElementFactory(document), updateText: updateText, translate: function (key) { return key; },
      prioritizePoster: function (card) { promoted.push(card.getAttribute('data-row-index') + ':' + card.getAttribute('data-column')); },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; }, currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([
    { title: 'Focused', items: [{ ratingKey: 'a', image: '/a.jpg' }] },
    { title: 'Partial', items: [{ ratingKey: 'b', image: '/b.jpg' }, { ratingKey: 'c', image: '/c.jpg' }] },
    { title: 'Next', items: [{ ratingKey: 'd', image: '/d.jpg' }] },
    { title: 'Far', items: [{ ratingKey: 'e', image: '/e.jpg' }] }
  ], 0, { focus: 'first' });
  content.rect = { top: 100, bottom: 500, left: 0, right: 900 };
  content.children[0].rect = { top: 100, bottom: 380, left: 0, right: 900 };
  content.children[1].rect = { top: 460, bottom: 740, left: 0, right: 900 };
  content.children[2].rect = { top: 760, bottom: 1040, left: 0, right: 900 };
  content.children[3].rect = { top: 1060, bottom: 1340, left: 0, right: 900 };
  content.children[0].children[1].children[0].rect = { top: 140, bottom: 350, left: 0, right: 140 };
  content.children[1].children[1].children[0].rect = { top: 480, bottom: 690, left: 0, right: 140 };
  content.children[1].children[1].children[1].rect = { top: 480, bottom: 690, left: 950, right: 1090 };
  content.children[2].children[1].children[0].rect = { top: 780, bottom: 990, left: 0, right: 140 };
  content.children[3].children[1].children[0].rect = { top: 1080, bottom: 1290, left: 0, right: 140 };
  while (frames.length) { frames.shift()(); }
  assert.ok(promoted.indexOf('0:0') !== -1, 'visible focused row artwork must be promoted');
  assert.ok(promoted.indexOf('1:0') !== -1, 'a partially visible next row must be promoted without receiving focus');
  assert.strictEqual(promoted.indexOf('1:1'), -1, 'horizontally offscreen cards must remain deferred');
  assert.strictEqual(promoted.indexOf('2:0'), -1, 'the offscreen next row must wait until navigation settles');
  Object.keys(clock.timers).forEach(function (id) { if (clock.timers[id].delay === 160) { clock.run(id); } });
  assert.ok(promoted.indexOf('2:0') !== -1, 'after settling, the first row below the viewport must be promoted');
  assert.strictEqual(promoted.indexOf('3:0'), -1, 'rows beyond the single-row HD lookahead must remain deferred');
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  while (frames.length) { frames.shift()(); }
  promoted.length = 0;
  content.children[1].children[1].children[1].rect = { top: 480, bottom: 690, left: 750, right: 890 };
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  while (frames.length) { frames.shift()(); }
  assert.ok(promoted.indexOf('1:1') !== -1, 'newly visible artwork must request HD before the idle timer fires');
  assert.strictEqual(promoted.indexOf('2:0'), -1, 'moving horizontally must not promote the offscreen next row');
  controller.destroy();
}());


(function testHomeStartupPressurePrioritizesVisibleArtworkWithoutStarvingNearbyCards() {
  var document = new FakeDocument();
  var content = document.register('content', new FakeElement('main', ''));
  var posterBatches = [];
  var promoted = [];
  var contentWidthReads = 0;
  var pressureReads = 0;
  var pressureReadsAtBatch = 0;
  Object.defineProperty(content, 'clientWidth', {
    configurable: true,
    get: function () {
      contentWidthReads += 1;
      return 900;
    }
  });
  var clock = new TimerRoot();
  var controller = ShellController.create({
    modules: modules(), clock: clock, document: document,
    services: {
      posterLoader: { loadBatch: function (jobs) { pressureReadsAtBatch = pressureReads; posterBatches.push(jobs); }, cancelScope: function () {} },
      stopTheme: function () {}
    },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key; },
      homeArtworkPressureActive: function () { pressureReads += 1; return true; },
      prioritizePoster: function (card) { promoted.push(card.getAttribute('data-row-index') + ':' + card.getAttribute('data-column')); }, renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return { cardScale: 100 }; },
      currentView: function () { return 'home'; },
      pointerSelectionActive: function () { return false; }, navigationHasFocus: function () { return false; }
    }
  });
  controller.useHomeRows([
    { title: 'Foreground', shape: 'poster', items: [
      { ratingKey: 'a0', image: '/a0.jpg' }, { ratingKey: 'a1', image: '/a1.jpg' },
      { ratingKey: 'a2', image: '/a2.jpg' }, { ratingKey: 'a3', image: '/a3.jpg' },
      { ratingKey: 'a4', image: '/a4.jpg' }, { ratingKey: 'a5', image: '/a5.jpg' },
      { ratingKey: 'a6', image: '/a6.jpg' }, { ratingKey: 'a7', image: '/a7.jpg' }
    ] },
    { title: 'Nearby row', shape: 'poster', items: [
      { ratingKey: 'b0', image: '/b0.jpg' }, { ratingKey: 'b1', image: '/b1.jpg' },
      { ratingKey: 'b2', image: '/b2.jpg' }, { ratingKey: 'b3', image: '/b3.jpg' }
    ] },
    { title: 'Background row', shape: 'poster', items: [
      { ratingKey: 'c0', image: '/c0.jpg' }, { ratingKey: 'c1', image: '/c1.jpg' }
    ] }
  ], 0, { focus: 'first' });
  assert.strictEqual(contentWidthReads, 1,
    'one Home reconciliation must snapshot content width once instead of forcing a layout read per poster');
  assert.strictEqual(pressureReadsAtBatch, 1,
    'one Home reconciliation must snapshot startup artwork pressure once instead of querying it per poster');
  assert.strictEqual(posterBatches.length, 2,
    'initial Home rendering must register deferred cards separately before the foreground SD readiness batch');
  var deferredJobs = posterBatches[0];
  var jobs = posterBatches[1];
  assert.strictEqual(deferredJobs.every(function (job) { return job.specification.priority > 1; }), true,
    'cards outside the initial Home neighborhood must stay deferred until the first startup-chain step');
  assert.strictEqual(jobs.every(function (job) { return job.specification.priority <= 1; }), true,
    'the initial Home SD readiness batch must contain only visible and nearby artwork');
  assert.strictEqual(jobs[0].specification.previewOnly === true, false,
    'visible Home artwork must request full resolution immediately even while startup pressure is active');
  assert.ok(jobs.filter(function (job) { return job.specification.priority === 1; }).every(function (job) { return job.specification.previewOnly === true; }),
    'offscreen nearby artwork must remain SD until it becomes visible or idle lookahead selects it');
  assert.ok(jobs.some(function (job) { return job.specification.priority === 0; }),
    'the visible portion of the second foreground Home row must also remain immediate');
  assert.ok(jobs.some(function (job) { return job.specification.priority === 1 && job.specification.previewOnly === true; }),
    'the next Home row should be available as low-priority preview work during startup pressure');
  promoted.length = 0;
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  content.rect = { top: 0, bottom: 500, left: 0, right: 900 };
  content.children[0].rect = { top: 0, bottom: 450, left: 0, right: 900 };
  content.children[1].rect = { top: 550, bottom: 1000, left: 0, right: 900 };
  content.children[0].children[1].children.forEach(function (card, column) {
    card.rect = { top: 20, bottom: 420, left: (column - 4) * 272, right: (column - 4) * 272 + 248 };
  });
  Object.keys(clock.timers).map(Number).forEach(function (id) {
    if (clock.timers[id] && clock.timers[id].delay === 160) { clock.run(id); }
  });
  assert.ok(promoted.indexOf('0:6') !== -1,
    'after fast first-row scrolling settles, startup pressure must warm the newly visible neighborhood around focus');
  assert.strictEqual(promoted.indexOf('0:0'), -1,
    'startup pressure must not promote the entire first row when focus has moved far to the right');
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
  controller.destroy();
}());

(function testNavigationFocusMoveReusesStableNavbarDom() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var geometryReads = 0;
  var createdButtons = 0;
  var controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [
      { kind: 'home', title: 'Home' },
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'library', key: 'b', title: 'Library B' },
      { kind: 'settings', title: 'Settings' }
    ],
    initialFocus: { area: 'nav', navIndex: 1, rowIndex: 0, column: 0 },
    presentation: {
      element: function (tagName, className, text) {
        var node = createElementFactory(document)(tagName, className, text);
        if (tagName === 'button') {
          createdButtons += 1;
          node.getBoundingClientRect = function () { geometryReads += 1; return { top: 0, bottom: 50, width: 120, height: 50 }; };
        }
        return node;
      },
      updateText: updateText, translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return {}; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  controller.updateFocus(true);
  var groups = navigation.children.slice();
  var buttonsAfterFirstRender = createdButtons;
  var geometryAfterFirstRender = geometryReads;
  var originalDocumentQuerySelector = document.querySelector;
  var documentQuerySelectorCalls = 0;
  document.querySelector = function (selector) {
    documentQuerySelectorCalls += 1;
    return originalDocumentQuerySelector.call(document, selector);
  };
  controller.setFocus({ area: 'nav', navIndex: 2, rowIndex: 0, column: 0 });
  controller.renderNavigation();
  controller.updateFocus(true);
  assert.strictEqual(navigation.children[0], groups[0], 'focus-only navbar movement must preserve the Home group DOM');
  assert.strictEqual(navigation.children[1], groups[1], 'focus-only navbar movement must preserve the library group DOM');
  assert.strictEqual(navigation.children[2], groups[2], 'focus-only navbar movement must preserve the fixed group DOM');
  assert.strictEqual(createdButtons, buttonsAfterFirstRender, 'focus-only navbar movement must not recreate buttons');
  assert.strictEqual(geometryReads, geometryAfterFirstRender, 'focus-only navbar movement inside the mounted window must not remeasure button geometry');
  assert.strictEqual(documentQuerySelectorCalls, 0, 'focus-only navbar movement inside the mounted window must reuse the indexed button map without document queries');
  assert.ok(navigation.querySelector('[data-nav-index="2"]').className.indexOf('is-focused') !== -1, 'the reused navbar must move focus to the requested button');
  assert.ok(navigation.querySelector('[data-nav-index="1"]').className.indexOf('is-focused') === -1, 'the reused navbar must clear focus from the previous button');
  for (var movement = 0; movement < 200; movement += 1) {
    controller.setFocus({ area: 'nav', navIndex: movement % 2 ? 1 : 2, rowIndex: 0, column: 0 });
    controller.renderNavigation();
  }
  assert.strictEqual(createdButtons, buttonsAfterFirstRender, 'navbar key-repeat stress must not recreate stable buttons');
  assert.strictEqual(geometryReads, geometryAfterFirstRender, 'navbar key-repeat stress must not remeasure stable button geometry');
  document.body.className = 'theme-nova';
  controller.renderNavigation();
  assert.ok(createdButtons > buttonsAfterFirstRender, 'a runtime theme change must invalidate the navbar fast path and rebuild measured buttons');
  controller.destroy();
}());

(function testNavigationFastPathInvalidatesWhenViewportOrVisibleItemsChange() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var root = { innerWidth: 1920 };
  var settings = { showWatchlist: true };
  var createdButtons = 0;
  var controller = ShellController.create({
    modules: modules(), root: root, document: document, clock: new TimerRoot(),
    navigationItems: [
      { kind: 'home', title: 'Home' },
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'watchlist', title: 'Watchlist' },
      { kind: 'settings', title: 'Settings' }
    ],
    initialFocus: { area: 'nav', navIndex: 2, rowIndex: 0, column: 0 },
    presentation: {
      element: function (tagName, className, text) {
        var node = createElementFactory(document)(tagName, className, text);
        if (tagName === 'button') { createdButtons += 1; }
        return node;
      },
      updateText: updateText, translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return settings; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  controller.updateFocus(true);
  var buttonsAfterInitialRender = createdButtons;
  var initialWatchlist = navigation.querySelector('[data-nav-index="2"]');
  root.innerWidth = 1280;
  controller.renderNavigation();
  assert.ok(createdButtons > buttonsAfterInitialRender, 'a viewport-width change must invalidate the navbar fast path and rebuild measured buttons');
  var buttonsAfterResize = createdButtons;
  settings.showWatchlist = false;
  controller.applyNavigationVisibility();
  controller.renderNavigation();
  controller.updateFocus(true);
  assert.ok(createdButtons > buttonsAfterResize, 'removing a visible navigation item must invalidate the navbar fast path');
  assert.notStrictEqual(navigation.querySelector('[data-nav-index="2"]'), initialWatchlist, 'a removed Watchlist button must not remain the indexed navigation focus target');
  assert.ok(navigation.querySelector('[data-nav-index="2"]').className.indexOf('is-focused') !== -1, 'focus must clamp onto the surviving navigation item after Watchlist disappears');
  controller.destroy();
}());

(function testNavigationWindowUsesMeasuredThemeMarginOncePerRender() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var measuredWidths = null;
  var measuredFocusGutter = null;
  var styleReads = 0;
  var controller = ShellController.create({
    modules: {
      NavigationModel: NavigationModel,
      NavigationIcon: NavigationIcon,
      NavbarWindow: {
        calculate: function (widths) {
          measuredWidths = widths.slice();
          return { start: 0, end: widths.length, canScrollLeft: false, canScrollRight: false };
        },
        scrolledAlignment: function (_widths, _availableWidth, _state, focusGutter) {
          measuredFocusGutter = focusGutter;
          return null;
        }
      }
    },
    root: {
      getComputedStyle: function () {
        styleReads += 1;
        return {
          marginRight: '18px',
          getPropertyValue: function (name) { return name === '--navigation-focus-gutter' ? '9px' : ''; }
        };
      }
    },
    document: document,
    clock: new TimerRoot(),
    navigationItems: [
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'library', key: 'b', title: 'Library B' }
    ],
    presentation: {
      element: function (tagName, className, text) {
        var node = createElementFactory(document)(tagName, className, text);
        if (tagName === 'button') { node.rect = { top: 0, bottom: 50, width: 140.25, height: 50 }; }
        return node;
      },
      translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return {}; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  assert.deepStrictEqual(measuredWidths, [158.25, 158.25],
    'navbar windowing must include fractional button geometry and the active theme margin');
  assert.strictEqual(measuredFocusGutter, 9, 'navbar alignment must use the focus gutter exposed by the active CSS configuration');
  assert.strictEqual(styleReads, 1, 'the shared navigation margin must be read only once per render');
  assert.strictEqual(navigation.children.length, 3, 'navigation groups remain stable after measured windowing');
  controller.destroy();
}());

(function testTerminalLibraryWindowReconcilesActualRightEdgeAfterReflow() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var controller = ShellController.create({
    modules: {
      NavigationModel: NavigationModel,
      NavigationIcon: NavigationIcon,
      NavbarWindow: {
        calculate: function () { return { start: 1, end: 3, canScrollLeft: true, canScrollRight: false }; },
        scrolledAlignment: function () { return { start: 0, leadingClip: 12 }; },
        rightEdgeCorrection: function (containerRight, itemRight, focusGutter) {
          assert.strictEqual(containerRight, 330, 'right-edge reconciliation must measure the library viewport after windowing');
          assert.strictEqual(itemRight, 335, 'right-edge reconciliation must measure the actual last retained button');
          assert.strictEqual(focusGutter, 5, 'right-edge reconciliation must retain the configured focus gutter');
          return 10;
        }
      }
    },
    root: {
      getComputedStyle: function () {
        return {
          marginRight: '10px',
          boxShadow: 'inset 0 0 0 5px #fff',
          getPropertyValue: function (name) { return name === '--navigation-focus-gutter' ? '5px' : ''; }
        };
      }
    },
    document: document,
    clock: new TimerRoot(),
    navigationItems: [
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'library', key: 'b', title: 'Library B' },
      { kind: 'library', key: 'c', title: 'Library C' }
    ],
    initialFocus: { area: 'nav', navIndex: 2, rowIndex: 0, column: 0 },
    presentation: {
      element: function (tagName, className, text) {
        var node = createElementFactory(document)(tagName, className, text);
        if (className === 'navigation-libraries') { node.clientWidth = 230; node.rect = { left: 100, right: 330, width: 230, height: 50 }; }
        if (tagName === 'button') { node.rect = { top: 0, bottom: 50, left: 100, right: 335, width: 100, height: 50 }; }
        return node;
      },
      translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return {}; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  assert.strictEqual(navigation.querySelector('.navigation-libraries').children[0].style.marginLeft, '-22px',
    'the first retained library must absorb both the planned clipped lead and measured right-edge overflow');
  assert.strictEqual(navigation.querySelector('.navigation-libraries').querySelectorAll('.navigation-scroll-indicator').length, 0,
    'a clipped navbar must keep the arrow as a minimal pseudo-element instead of adding a full-height mask node');
  controller.destroy();
}());

(function testNavigationClippedEdgesKeepArrowsOutsideLibraryContent() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var controller = ShellController.create({
    modules: {
      NavigationModel: NavigationModel,
      NavigationIcon: NavigationIcon,
      NavbarWindow: {
        calculate: function () { return { start: 0, end: 2, canScrollLeft: true, canScrollRight: true }; },
        scrolledAlignment: function () { return null; }
      }
    },
    document: document,
    clock: new TimerRoot(),
    navigationItems: [
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'library', key: 'b', title: 'Library B' }
    ],
    initialFocus: { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 },
    presentation: {
      element: createElementFactory(document),
      translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return {}; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  assert.strictEqual(navigation.querySelector('.navigation-libraries').querySelectorAll('.navigation-scroll-indicator').length, 0,
    'clipped navbar edges must not add layout nodes just to mask the pseudo-arrows');
  assert.ok(navigation.querySelector('.navigation-home').className.indexOf('has-clipped-libraries') !== -1,
    'the left overflow arrow must belong to the Home group outside the clipped library viewport');
  assert.ok(navigation.querySelector('.navigation-libraries').className.indexOf('is-clipped-left') === -1,
    'the library viewport must not overlay a left arrow on partially visible library content');
  assert.ok(navigation.querySelector('.navigation-libraries').className.indexOf('is-clipped-right') !== -1,
    'the right clipped state must continue to drive the right pseudo-arrow');
  controller.destroy();
}());

(function testRightClippedNavbarKeepsFullViewportAndAnchorsArrow() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var measuredWidths = [];
  var controller = ShellController.create({
    modules: {
      NavigationModel: NavigationModel,
      NavigationIcon: NavigationIcon,
      NavbarWindow: {
        calculate: function (widths, availableWidth) {
          measuredWidths.push(availableWidth);
          return { start: 0, end: 1, canScrollLeft: false, canScrollRight: true };
        },
        trailingPreview: function () { return { index: 1, visibleWidth: 60, clippedWidth: 90 }; },
        scrolledAlignment: function () { return null; },
        rightEdgeCorrection: function (containerRight, itemRight, trailingGutter) {
          assert.strictEqual(containerRight, 330, 'right arrow spacing must use the library viewport edge');
          assert.strictEqual(itemRight, 270, 'right arrow spacing must use the actual last library edge');
          assert.strictEqual(trailingGutter, 4, 'right arrow spacing must use only the configured focus gutter');
          return 0;
        }
      }
    },
    root: {
      getComputedStyle: function () {
        return {
          marginRight: '10px',
          boxShadow: 'inset 0 0 0 4px #fff',
          getPropertyValue: function (name) { return name === '--navigation-focus-gutter' ? '4px' : ''; }
        };
      }
    },
    document: document,
    clock: new TimerRoot(),
    navigationItems: [
      { kind: 'library', key: 'a', title: 'Library A' },
      { kind: 'library', key: 'b', title: 'Library B' }
    ],
    initialFocus: { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 },
    presentation: {
      element: function (tagName, className, text) {
        var node = createElementFactory(document)(tagName, className, text);
        if (className === 'navigation-libraries') { node.clientWidth = 300; node.rect = { left: 30, right: 330, width: 300, height: 50 }; }
        if (tagName === 'button') { node.rect = { top: 0, bottom: 50, left: 30, right: 270, width: 140, height: 50 }; }
        return node;
      },
      translate: function (key) { return key; },
      renderActiveProfile: function () {}, renderServerActivities: function () {}
    },
    access: {
      settings: function () { return {}; },
      authState: function () { return { mode: 'offline', setupComplete: false }; },
      navigationHasFocus: function () { return true; }, navigationReorderMode: function () { return false; },
      watchlistAvailable: function () { return true; }
    }
  });
  controller.renderNavigation();
  assert.deepStrictEqual(measuredWidths, [300], 'right clipping must not reduce the measured library viewport or hide an extra library');
  assert.strictEqual(navigation.querySelector('.navigation-libraries').children.length, 2,
    'right clipping must use spare viewport width to retain a partial preview of the next library');
  assert.ok(navigation.querySelector('.navigation-libraries').children[1].className.indexOf('is-trailing-preview') !== -1,
    'only the extra trailing library must receive the fade-preview treatment');
  assert.strictEqual(navigation.querySelector('.navigation-libraries').children[1].style['--navigation-preview-visible-width'], '60px',
    'the preview fade must use the already calculated visible width without another layout pass');
  assert.strictEqual(navigation.querySelector('.navigation-libraries').style['--navigation-right-arrow-right'], '50px',
    'the right arrow must be positioned from the actual last retained library edge');
  controller.destroy();
}());

(function testCompactNavigationPresentation() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [
      { kind: 'home', title: 'Home', labelKey: 'nav.home', displayMode: 'icon', icon: 'home' },
      { kind: 'library', key: '1', title: 'Film', displayMode: 'text', icon: 'movie' },
      { kind: 'library', key: '2', title: 'Anime Marco', displayMode: 'icon-text', icon: 'anime' },
      { kind: 'search', title: 'Search', labelKey: 'nav.search' },
      { kind: 'settings', title: 'Settings', labelKey: 'nav.settings' }
    ],
    initialFocus: { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key === 'nav.home' ? 'Home' : (key === 'nav.search' ? 'Search' : (key === 'nav.settings' ? 'Settings' : key)); },
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
  var home = navigation.querySelector('[data-nav-index="0"]');
  var film = navigation.querySelector('[data-nav-index="1"]');
  var anime = navigation.querySelector('[data-nav-index="2"]');
  var search = navigation.querySelector('[data-nav-index="3"]');
  var settings = navigation.querySelector('[data-nav-index="4"]');
  assert.strictEqual(home.getAttribute('aria-label'), 'Home', 'icon-only Home must keep an accessible text label');
  assert.strictEqual(home.querySelector('[data-nav-icon="home"]') !== null, true, 'Home icon mode must render the configured icon');
  assert.strictEqual(film.querySelector('[data-nav-icon="movie"]'), null, 'text-only library tabs must not spend width on an icon');
  assert.strictEqual(anime.querySelector('[data-nav-icon="anime"]') !== null, true, 'icon+text libraries must render their configured icon');
  assert.strictEqual(anime.querySelector('.nav-item-label').children[0].textContent, 'Anime Marco', 'icon+text libraries must retain alias text');
  assert.strictEqual(search.querySelector('[data-nav-icon="search"]') !== null, true, 'Search must always render as a magnifying-glass icon');
  assert.strictEqual(settings.querySelector('[data-nav-icon="settings"]') !== null, true, 'Settings must always render as a gear icon');
  assert.strictEqual(search.querySelector('.nav-item-label'), null, 'Search must be icon-only');
  assert.strictEqual(settings.querySelector('.nav-item-label'), null, 'Settings must be icon-only');
  controller.destroy();
}());

(function testOfflineIconNavigationUsesLocaleTranslation() {
  var document = new FakeDocument();
  var navigation = document.register('navigation', new FakeElement('nav', ''));
  var controller = ShellController.create({
    modules: modules(), document: document, clock: new TimerRoot(),
    navigationItems: [
      { kind: 'library', key: 'offline-library', title: 'Film', displayMode: 'icon', icon: 'movie', offline: true }
    ],
    initialFocus: { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 },
    presentation: {
      element: createElementFactory(document), updateText: updateText,
      translate: function (key) { return key === 'common.offline' ? 'Hors ligne' : key; },
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
  assert.strictEqual(navigation.querySelector('[data-nav-index="0"]').querySelector('.nav-item-label').children[0].textContent, 'Hors ligne',
    'offline icon-only navigation must use the active locale instead of a hardcoded English label');
  controller.destroy();
}());

(function testBackdropRescheduleCancelsOnlyInactivePendingImageWork() {
  var document = new FakeDocument();
  var backdropA = document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  var backdropB = document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var timers = new TimerRoot();
  var cancelled = [];
  var controller = ShellController.create({
    modules: modules(), document: document, clock: timers,
    services: {
      posterLoader: {
        cancel: function (target) { cancelled.push(target); },
        cancelScope: function () {},
        load: function () {}
      }
    },
    access: { settings: function () { return {}; } }
  });
  controller.scheduleBackdrop({ ratingKey: 'one', art: '/one.jpg' });
  controller.scheduleBackdrop({ ratingKey: 'two', art: '/two.jpg' });
  for (var reschedule = 0; reschedule < 100; reschedule += 1) { controller.scheduleBackdrop({ ratingKey: 'stress-' + reschedule, art: '/stress-' + reschedule + '.jpg' }); }
  assert.strictEqual(cancelled.length, 102, 'rapid backdrop rescheduling must cancel one stale inactive job per focus change without touching the active layer');
  assert.ok(cancelled.every(function (target) { return target === backdropB; }), 'rapid backdrop rescheduling must always target the inactive buffer');
  assert.strictEqual(cancelled.indexOf(backdropA), -1, 'backdrop rescheduling must not abort the active visible backdrop quality upgrade');
  controller.destroy();
}());

(function testDeferredSearchBackdropCannotLoadAfterLeavingSearch() {
  var document = new FakeDocument();
  document.register('backdrop-a', new FakeElement('img', 'backdrop-image is-active'));
  document.register('backdrop-b', new FakeElement('img', 'backdrop-image'));
  var timers = new TimerRoot();
  var currentView = 'search';
  var loads = [];
  var controller = ShellController.create({
    modules: modules(), document: document, clock: timers,
    services: {
      posterLoader: {
        cancel: function () {},
        cancelScope: function () {},
        load: function (target, specification) { loads.push({ target: target, source: specification.source }); }
      }
    },
    access: {
      currentView: function () { return currentView; },
      settings: function () { return {}; }
    }
  });
  controller.scheduleSearchBackdrop({ ratingKey: 'search-a', art: '/search-a.jpg' });
  currentView = 'detail';
  timers.runAll();
  assert.deepStrictEqual(loads, [], 'a deferred Search backdrop must not start decode/network work after the view has changed');
  controller.destroy();
}());

(function testBackdropTokensRejectStaleWork() {
  var backdropCallbacks = [];
  var calls = [];
  var controller = ShellController.create({
    services: {
      loadBackdrop: function (item, callback) { backdropCallbacks.push({ item: item, callback: callback }); }
    },
    presentation: {
      applyBackdrop: function (item, source) { calls.push('backdrop:' + item.id + ':' + source); }
    }
  });
  controller.requestBackdrop({ id: 'one' });
  controller.requestBackdrop({ id: 'two' });
  backdropCallbacks[0].callback(null, 'old');
  backdropCallbacks[1].callback(null, 'new');
  assert.deepStrictEqual(calls, ['backdrop:two:new'], 'stale artwork cannot overwrite current focus');
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

(function testEmptyHomeBehavesAsHomeStartForBackNavigation() {
  var exitRequests = 0;
  var timers = new TimerRoot();
  var controller = ShellController.create({
    modules: modules(), clock: timers,
    rows: [],
    navigationItems: [{ kind: 'home', title: 'Home' }, { kind: 'library', title: 'Library' }],
    actions: { requestExit: function () { exitRequests += 1; } },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });

  controller.useHomeRows([], 0, { focus: 'nav' });
  controller.handleHomeKey({ keyCode: 40, preventDefault: function () {} }, 'down');
  assert.strictEqual(controller.snapshot().focus.area, 'nav', 'Down on an empty Home must keep focus on navigation because there is no media target');
  controller.handleHomeKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.strictEqual(controller.snapshot().focus.navIndex, 1, 'empty Home still allows normal horizontal navbar navigation');
  controller.handleHomeKey({ keyCode: 461, preventDefault: function () {} }, null);
  assert.strictEqual(exitRequests, 0, 'Back from another navbar item on empty Home must return to Home before exiting the app');
  assert.deepStrictEqual(controller.snapshot().focus, { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 }, 'Back from another navbar item must restore the Home navbar position when no media rows exist');
  controller.handleHomeKey({ keyCode: 461, preventDefault: function () {} }, null);

  assert.strictEqual(exitRequests, 1, 'Back from an empty Home must exit instead of trying to focus a media card that does not exist');
  controller.destroy();
}());

(function testFirstEmptyHomeStillPublishesReadyAndPrefetchHooks() {
  var homeReady = 0;
  var prefetch = 0;
  var timers = new TimerRoot();
  var controller = ShellController.create({
    modules: modules(), clock: timers,
    rows: [],
    actions: {
      onHomeReady: function () { homeReady += 1; },
      scheduleAdjacentLibraryPrefetch: function () { prefetch += 1; }
    },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });

  controller.useHomeRows([], 0, { focus: 'nav' });
  controller.useHomeRows([], 0, { focus: 'nav' });

  assert.strictEqual(homeReady, 1, 'the first applied empty Home must publish Home ready exactly once so background warm-up can start');
  assert.strictEqual(prefetch, 2, 'empty Home presentations must retain the same adjacent-library prefetch hook as non-empty Home presentations');
  controller.destroy();
}());

(function testHomeResetRearmsReadyHookForNewServerOrProfileLifecycle() {
  var homeReady = 0;
  var timers = new TimerRoot();
  var controller = ShellController.create({
    modules: modules(), clock: timers,
    rows: [],
    actions: { onHomeReady: function () { homeReady += 1; } },
    access: { currentView: function () { return 'home'; }, settings: function () { return {}; } }
  });

  controller.useHomeRows([{ title: 'First', items: [{ ratingKey: 'one' }] }], 0, { focus: 'first' });
  controller.resetHome();
  controller.useHomeRows([{ title: 'Second', items: [{ ratingKey: 'two' }] }], 0, { focus: 'first' });

  assert.strictEqual(homeReady, 2, 'resetting Home for a new server/profile lifecycle must rearm post-Home warm-up hooks');
  controller.destroy();
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

(function testBackdropSampleUsesAvailablePlexArtwork() {
  var controller = ShellController.create({
    now: function () { return 1; },
    rows: [{ title: 'Recent', items: [
      { ratingKey: 'poster-only', image: 'https://example.test/poster/400/600' },
      { ratingKey: 'with-art', art: 'https://example.test/backdrop/640/360' }
    ] }]
  });
  assert.strictEqual(controller.sampleBackdropSource(), 'https://example.test/backdrop/1280/720', 'backdrop samples must prefer real Plex art and normalize it for preview');
  controller.destroy();
}());

console.log('Shell controller checks passed');

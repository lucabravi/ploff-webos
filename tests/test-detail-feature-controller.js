'use strict';

var assert = require('assert');
var MediaChoiceModel = require('../app/media-choice-model');
var DetailFeatureController = require('../app/coordinator/detail-feature-controller');

function FakeNode(id) {
  this.id = id || '';
  this.className = '';
  this.textContent = '';
  this.innerHTML = '';
  this.disabled = false;
  this.style = {};
  this.attributes = {};
  this.scrollHeight = 0;
  this.clientHeight = 0;
  this.offsetWidth = 100;
}
FakeNode.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
FakeNode.prototype.getAttribute = function (name) { return this.attributes[name]; };
FakeNode.prototype.focus = function () { this.focused = true; };

function FakeDocument() {
  this.nodes = {};
  this.body = new FakeNode('body');
}
FakeDocument.prototype.getElementById = function (id) {
  if (!this.nodes[id]) { this.nodes[id] = new FakeNode(id); }
  return this.nodes[id];
};
FakeDocument.prototype.querySelector = function () { return null; };
FakeDocument.prototype.querySelectorAll = function () { return []; };

function createHarness() {
  var calls = [];
  var controllerCreates = 0;
  var presentationCreates = 0;
  var episodeCreates = 0;
  var preferenceCreates = 0;
  var destroyed = 0;
  var state = {
    selectedItem: null,
    currentDetail: null,
    seriesContext: null,
    returnView: 'home',
    fromContinueWatching: false,
    zone: 'play',
    actionIndex: 0,
    seasonIndex: 0,
    episodeIndex: 0,
    mediaProfileRatingKey: '',
    mediaProfileLoading: false,
    mediaLoadingLabelVisible: false,
    seasonTransitionMediaKey: '',
    playPending: false,
    generation: 0,
    destroyed: false
  };
  var controllerOptions;
  var presentationOptions;
  var episodeOptions;
  var seasonEpisodes = [
    { ratingKey: 'episode-1', title: 'Episode 1', viewed: false, viewOffset: 12000, progress: 0.1 },
    { ratingKey: 'episode-2', title: 'Episode 2', viewed: false, viewOffset: 0, progress: 0 }
  ];
  var watchedFailures = {};
  var preference = {
    snapshot: function () { return { profile: { summary: '1080p', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] }, override: null, identity: 'id' }; },
    prepare: function (identity) { calls.push(['preparePreferences', identity]); },
    clear: function () { calls.push(['clearPreferences']); },
    setProfile: function () {},
    versions: function () { return [this.snapshot().profile]; },
    selectedProfile: function () { return this.snapshot().profile; },
    choiceState: function () { return { audio: false, subtitles: false, versions: false }; },
    playbackPreferences: function (settings, quality) { return { settings: settings, videoQuality: quality }; },
    save: function () {},
    setVersion: function () {},
    setTrack: function () {},
    cycleTrack: function () {},
    cycleVersion: function () {}
  };
  var presentation = {
    snapshot: function () { return { summaryOverflowing: false, summaryDialogOpen: false }; },
    renderMetadata: function (detail, subtitle) { calls.push(['metadata', detail.ratingKey, subtitle]); },
    renderMediaControls: function (model) { calls.push(['mediaControls', model.values.version]); },
    clear: function () { calls.push(['presentationClear']); },
    updateSummaryOverflow: function () { calls.push(['summaryOverflow']); return false; },
    openSummary: function () { calls.push(['summaryOpen']); return true; },
    closeSummary: function () { calls.push(['summaryClose']); },
    scrollSummary: function (direction) { calls.push(['summaryScroll', direction]); }
  };
  var episodeView = {
    setContext: function (context) { calls.push(['episodeContext', context.episodes.length]); },
    setEpisodes: function (episodes) { calls.push(['episodes', episodes.length]); },
    setSeasonIndex: function (index) { return index; },
    setEpisodeIndex: function (index) { return index; },
    render: function () { calls.push(['episodeRender']); },
    renderSeasons: function () { calls.push(['seasonRender']); },
    renderEpisodes: function () { calls.push(['episodeStripRender']); },
    refreshSelection: function () { calls.push(['episodeSelection']); },
    refreshPlaybackCards: function () { calls.push(['playbackCards']); },
    reconcilePlayback: function () {},
    startTitlePan: function () {},
    reset: function () { calls.push(['episodeReset']); }
  };
  var controller = {
    open: function (item, options) { state.generation += 1; state.selectedItem = item; state.returnView = options.returnView; state.fromContinueWatching = options.fromContinueWatching === true; return state; },
    close: function () { state.generation += 1; state.currentDetail = null; state.selectedItem = null; return state; },
    setCurrentDetail: function (detail) { state.currentDetail = detail; return detail; },
    setSelectedItem: function (item) { state.selectedItem = item; return item; },
    setSeriesContext: function (context) { state.seriesContext = context; return context; },
    setEpisodes: function (episodes, index) { state.seriesContext.episodes = episodes; state.episodeIndex = index || 0; return state; },
    selectSeason: function (index) { state.seasonIndex = index; return index; },
    selectEpisode: function (index) { state.episodeIndex = index; return index; },
    setFocus: function (focus) { Object.keys(focus || {}).forEach(function (key) { state[key] = focus[key]; }); return state; },
    setReturnView: function (view) { state.returnView = view; return view; },
    setFromContinueWatching: function (value) { state.fromContinueWatching = value === true; return state.fromContinueWatching; },
    setPlayPending: function (pending) { state.playPending = pending; },
    setBackLockedUntil: function () {},
    setSeasonTransitionMediaKey: function (key) { state.seasonTransitionMediaKey = key; },
    patchCurrentDetail: function (patch) { Object.keys(patch).forEach(function (key) { state.currentDetail[key] = patch[key]; }); },
    patchSelectedItem: function (patch) { Object.keys(patch).forEach(function (key) { state.selectedItem[key] = patch[key]; }); },
    patchEpisode: function (index, patch) { Object.keys(patch).forEach(function (key) { state.seriesContext.episodes[index][key] = patch[key]; }); },
    prepareMediaProfile: function (detail, identity) { state.mediaProfileRatingKey = detail.ratingKey; controllerOptions.preparePreferences(identity, detail); },
    queueMediaProfile: function () {},
    requestPlayback: function (options) { return controllerOptions.requestPlayback({ detail: state.currentDetail, options: options || {} }); },
    snapshot: function () { return state; },
    handleKey: function (event, direction) { calls.push(['key', event.keyCode, direction]); return { handled: true }; },
    cancelEpisodePreview: function () {},
    cancelTransitions: function () {},
    clearMetadataStatusTimer: function () {},
    setMetadataStatusTemporary: function () {},
    destroy: function () { if (!state.destroyed) { state.destroyed = true; destroyed += 1; } }
  };
  var root = {
    setTimeout: function (callback) { callback(); return 1; },
    clearTimeout: function () {}
  };
  var document = new FakeDocument();
  var options = {
    platform: { root: root, document: document, storage: {} },
    modules: {
      DetailController: { create: function (values) { controllerCreates += 1; controllerOptions = values; return controller; } },
      DetailNavigation: {},
      DetailPresentationView: { create: function (values) { presentationCreates += 1; presentationOptions = values; return presentation; } },
      DetailEpisodeView: { create: function (values) { episodeCreates += 1; episodeOptions = values; return episodeView; } },
      DetailPreferenceState: { create: function () { preferenceCreates += 1; return preference; } },
      MetadataRefresh: {},
      MediaPreferences: { key: function () { return 'identity'; }, resolve: function () { return { audioTrack: null, subtitleTrack: null }; } },
      MediaInfo: { create: function (profile, options) { calls.push(['mediaInfoModel', profile.summary, options.audioStreamID || '']); return { sections: [{ title: 'model' }] }; } },
      MediaChoiceModel: MediaChoiceModel,
      MediaProfile: {
        choiceState: function () { return { audio: false, subtitles: false, versions: false }; },
        trackDisplayLabel: function () { return ''; }
      },
      VersionSelection: { selectAutomatic: function (versions) { return versions[0] || null; } },
      ProgressiveImages: {}
    },
    data: {
      PlexClient: {
        loadSeriesContext: function (_config, _detail, callback) { callback(null, null); return null; },
        loadSeasonEpisodes: function (_config, seasonKey, _selectedKey, callback) {
          calls.push(['loadSeasonEpisodes', seasonKey]);
          callback(null, seasonEpisodes.map(function (episode) { return Object.assign({}, episode); }));
          return null;
        },
        setWatchedAndReset: function (_config, ratingKey, watched, callback) {
          var index;
          calls.push(['setWatched', ratingKey, watched]);
          if (watchedFailures[String(ratingKey)]) { callback(new Error('watched failure')); return null; }
          for (index = 0; index < seasonEpisodes.length; index += 1) {
            if (String(seasonEpisodes[index].ratingKey) === String(ratingKey)) {
              seasonEpisodes[index].viewed = watched;
              seasonEpisodes[index].viewOffset = 0;
              seasonEpisodes[index].progress = 0;
            }
          }
          callback(null);
          return null;
        },
        removeFromContinueWatching: function (_config, ratingKey, callback) {
          calls.push(['removeContinueClient', ratingKey]);
          callback(null);
          return null;
        }
      },
      mediaContext: {
        removeFromContinueWatching: function (target, callback) {
          calls.push(['removeContinuePort', target.item && target.item.ratingKey]);
          callback(null, target);
          return null;
        }
      },
      config: {},
      mediaPreferenceIdentity: function () { return 'server:profile:media'; },
      playbackCapabilities: function () { return { directPlay: true, codecs: [], containers: [] }; },
      settings: function () { return { playbackMode: 'auto', videoVersionPriorities: [] }; },
      activeVideoQuality: function () { return 'original'; },
      waitForActivity: function () {}
    },
    shell: {
      t: function (key) { return key; },
      element: function () { return new FakeNode(); },
      setText: function (id, value) { document.getElementById(id).textContent = String(value || ''); },
      posterLoader: function () { return {}; },
      loadRenderedPoster: function (_node, source) { calls.push(['poster', source]); },
      cancelImages: function (scope) { calls.push(['cancelImages', scope]); },
      scheduleBackdrop: function (item) { calls.push(['backdrop', item.ratingKey]); },
      clearBackdrop: function () { calls.push(['clearBackdrop']); },
      scheduleTheme: function (item) { calls.push(['theme', item && item.ratingKey || '']); },
      showMessage: function (text) { calls.push(['message', text]); },
      showViewState: function () {},
      hideViewState: function () {},
      clearFocus: function () {},
      navigationTarget: function () { return null; },
      navigationIndex: function () { return 0; },
      navigationCount: function () { return 1; },
      moveNavigation: function () {},
      activateNavigation: function () {}
    },
    watchlist: {
      available: function () { return false; },
      identity: function () { return ''; },
      snapshot: function () { return {}; },
      findLocal: function () { return null; },
      load: function () {},
      toggle: function () {}
    },
    dialogs: {
      openChoice: function (title, choices, selectedValue, apply, returnFocus) {
        calls.push(['openChoice', { title: title, choices: choices, selectedValue: selectedValue, apply: apply, returnFocus: returnFocus }]);
        return true;
      },
      mediaInfoOpen: function () { return false; },
      openMediaInfo: function (model, origin) { calls.push(['openMediaInfo', model.sections[0].title, origin]); return true; },
      openMediaVersions: function (options, origin) { calls.push(['openMediaVersions', options, origin]); return true; },
      handleMediaInfoKey: function (event, direction) { calls.push(['mediaInfoKey', event && event.keyCode, direction]); return { handled: true }; },
      closeMediaInfo: function () {},
      scrollMediaInfo: function () {}
    },
    state: {
      currentView: function () { return 'detail'; },
      pointerSelectionActive: function () { return false; },
      animationsEnabled: function () { return false; },
      animationDuration: function (milliseconds) { return milliseconds; }
    },
    transitions: {
      enterDetail: function (returnView) { calls.push(['enterDetail', returnView]); },
      hideBrowsingSurfaces: function () { calls.push(['hideBrowsing']); },
      restoreOrigin: function (returnView) { calls.push(['restoreOrigin', returnView]); },
      requestPlayback: function (request) { calls.push(['requestPlayback', request.detail && request.detail.ratingKey]); return request; }
    }
  };
  return {
    calls: calls,
    controller: controller,
    controllerOptions: function () { return controllerOptions; },
    presentationOptions: function () { return presentationOptions; },
    episodeOptions: function () { return episodeOptions; },
    counts: function () { return { controller: controllerCreates, presentation: presentationCreates, episode: episodeCreates, preference: preferenceCreates, destroyed: destroyed }; },
    feature: DetailFeatureController.create(options),
    document: document,
    state: state,
    preference: preference,
    setSeasonEpisodes: function (episodes) { seasonEpisodes = episodes.map(function (episode) { return Object.assign({}, episode); }); },
    setWatchedFailure: function (ratingKey, enabled) { watchedFailures[String(ratingKey)] = enabled === true; }
  };
}

(function testConstructionAndLoadedDetailRendering() {
  var harness = createHarness();
  var detail = { ratingKey: 'movie-1', title: 'Movie', subtitle: '2026', facts: '120 min', summary: 'Summary', image: '/poster.jpg' };
  assert.deepStrictEqual(harness.counts(), { controller: 1, presentation: 1, episode: 1, preference: 1, destroyed: 0 }, 'feature constructs each owned component exactly once');
  harness.feature.openLoaded(detail, { returnView: 'library' });
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'enterDetail' && entry[1] === 'library'; }), 'loaded detail enters through the explicit transition port');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'metadata' && entry[1] === 'movie-1'; }), 'loaded detail renders through the owned presentation view');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'poster' && entry[1] === '/poster.jpg'; }), 'detail poster work is owned by the feature');
  harness.controllerOptions().openVersionDetails();
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'mediaInfoModel' && entry[1] === '1080p'; }), 'Detail must build the technical model for the selected version');
  var browserCall = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; })[0];
  assert.ok(browserCall, 'Detail must open the shared media dialog in version-browser mode');
  assert.strictEqual(browserCall[1].choices.length, 1, 'a single physical file must expose one informational choice without a fake automatic duplicate');
  assert.strictEqual(browserCall[1].selectedValue, 'auto', 'the single automatic selection remains the active browser value');
  assert.strictEqual(browserCall[2], 'detail', 'the dialog origin must remain detail');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'movie-1', 'current detail stays private behind a semantic getter');
  assert.strictEqual(harness.feature.handleKey({ keyCode: 13 }, ''), true, 'remote input delegates through the feature boundary');
}());


(function testVersionBrowserDefersMultipleVersionMutationUntilApply() {
  var harness = createHarness();
  var first = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var second = { summary: '2160p HEVC HDR', mediaIndex: 1, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var override = null;
  var setVersionCalls = [];
  var browserCall;
  var options;
  harness.preference.snapshot = function () { return { profile: first, override: override, identity: 'id' }; };
  harness.preference.versions = function () { return [first, second]; };
  harness.preference.selectedProfile = function () { return override && override.mediaIndex === 1 ? second : first; };
  harness.preference.setVersion = function (mediaIndex, partIndex) { setVersionCalls.push([mediaIndex, partIndex]); };

  harness.controllerOptions().openVersionDetails();
  browserCall = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; })[0];
  options = browserCall[1];
  assert.strictEqual(options.choices.length, 3, 'multiple files expose automatic plus each physical version');
  assert.strictEqual(options.choices[0].value, 'auto');
  assert.strictEqual(options.choices[1].value, '0:0');
  assert.strictEqual(options.choices[2].value, '1:0');
  assert.strictEqual(options.selectedValue, 'auto');
  assert.deepStrictEqual(setVersionCalls, [], 'opening and preview construction must not mutate the version override');

  options.apply(options.choices[2]);
  assert.deepStrictEqual(setVersionCalls, [[1, 0]], 'the explicit version is applied only after confirmation');
  options.apply(options.choices[0]);
  assert.deepStrictEqual(setVersionCalls, [[1, 0], [null, null]], 'confirming Automatic clears the explicit version override');
}());


(function testDetailOptionsExposeSeasonBulkActionsAndRefresh() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [
      { ratingKey: 'episode-1', title: 'Episode 1', viewed: false },
      { ratingKey: 'episode-2', title: 'Episode 2', viewed: false }
    ]
  };
  var menu;
  var confirm;
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.deepStrictEqual(menu.choices.map(function (choice) { return choice.value; }), ['season-watched', 'season-unwatched', 'refresh-metadata'], 'series detail options must expose both season bulk actions plus metadata refresh');
  menu.apply(menu.choices[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  assert.strictEqual(confirm.title, 'detail.markSeasonWatchedConfirm', 'season bulk actions must require a second confirmation dialog');
  confirm.apply(confirm.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'episode-1', true],
    ['setWatched', 'episode-2', true]
  ], 'confirming watched must update every episode in the selected season');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length, 2, 'bulk updates must reload the season after all writes complete');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'detail.seasonWatchedComplete'; }), 'successful bulk updates must report completion');
}());

(function testDetailOptionsExposeContinueRemovalForContinueWatchingOrigin() {
  var harness = createHarness();
  var detail = { ratingKey: 'movie-continue', type: 'movie', title: 'Continue movie', viewed: false };
  var menu;
  harness.feature.openLoaded(detail, { returnView: 'home', fromContinueWatching: true, skipSeriesLoad: true });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.deepStrictEqual(menu.choices.map(function (choice) { return choice.value; }), ['remove-continue', 'refresh-metadata'], 'detail options must expose Continue Watching removal for that origin');
  menu.apply(menu.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'removeContinuePort'; }), [['removeContinuePort', 'movie-continue']], 'detail options must reuse the shared Continue Watching mutation port');
  assert.strictEqual(harness.feature.snapshot().fromContinueWatching, false, 'successful removal must clear the origin action for the open detail');
}());

(function testSeasonBulkContinuesAfterIndividualFailureAndReportsPartialResult() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1', viewed: true };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [
      { ratingKey: 'episode-1', title: 'Episode 1', viewed: true },
      { ratingKey: 'episode-2', title: 'Episode 2', viewed: true }
    ]
  };
  var menu;
  var confirm;
  harness.setSeasonEpisodes(context.episodes);
  harness.setWatchedFailure('episode-1', true);
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices[1]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'episode-1', false],
    ['setWatched', 'episode-2', false]
  ], 'a failed episode must not prevent later episodes from being processed');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'detail.seasonBulkPartial'; }), 'partial failures must be visible to the user');
}());

(function testPublicDetailSnapshotsAreMutationIsolated() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-2', type: 'episode', title: 'Original episode' };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [{ ratingKey: 'episode-1', title: 'First' }, detail]
  };
  var exposed;

  harness.feature.setPlaybackContext(detail, detail, context, 0, 1);
  exposed = harness.feature.snapshot();
  exposed.currentDetail.title = 'Mutated detail';
  exposed.selectedItem.title = 'Mutated item';
  exposed.seriesContext.seasons[0].title = 'Mutated season';
  exposed.seriesContext.episodes[1].title = 'Mutated episode';

  assert.strictEqual(harness.feature.snapshot().currentDetail.title, 'Original episode', 'public detail snapshots must not mutate controller-owned detail');
  assert.strictEqual(harness.feature.queueSnapshot().seriesContext.seasons[0].title, 'Season 1', 'series season DTOs must be isolated');
  assert.strictEqual(harness.feature.queueSnapshot().seriesContext.episodes[1].title, 'Original episode', 'series episode DTOs must be isolated');
}());

(function testPlaybackContextAndIdempotentDestroy() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-2', type: 'episode', title: 'Episode 2' };
  var context = { seasons: [{ ratingKey: 'season-1' }], episodes: [{ ratingKey: 'episode-1' }, detail] };
  var boundary;
  harness.feature.setPlaybackContext(detail, detail, context, 0, 1);
  assert.strictEqual(harness.feature.queueSnapshot().episodeIndex, 1, 'player and queue consumers receive a semantic detail snapshot');
  assert.deepStrictEqual(harness.feature.queueSnapshot(), {
    currentDetail: detail,
    seriesContext: context,
    seasonIndex: 0,
    episodeIndex: 1
  }, 'queue consumers receive the current detail and series context without exposing the controller');
  boundary = harness.feature.snapshot();
  boundary.currentDetail.title = 'Mutated';
  boundary.seriesContext.episodes[1].title = 'Mutated episode';
  boundary.seriesContext.episodes.push({ ratingKey: 'extra' });
  assert.strictEqual(harness.state.currentDetail.title, 'Episode 2', 'detail boundary snapshots must not expose the current detail object');
  assert.strictEqual(harness.state.seriesContext.episodes[1].title, 'Episode 2', 'detail boundary snapshots must not expose episode objects');
  assert.strictEqual(harness.state.seriesContext.episodes.length, 2, 'detail boundary snapshots must not expose the episode array');
  harness.feature.destroy();
  harness.feature.destroy();
  assert.strictEqual(harness.counts().destroyed, 1, 'feature teardown is idempotent');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'episodeReset'; }), 'owned episode presentation is reset during teardown');
}());


function createLifecycleHarness() {
  var DetailController = require('../app/coordinator/detail-controller');
  var DetailNavigation = require('../app/detail-navigation');
  var view = 'home';
  var calls = [];
  var requests = { metadata: [], series: [], seasons: [], watched: [], watchlist: [] };
  var nextTimer = 1;
  var timers = {};
  var destroyed = 0;
  var document = new FakeDocument();
  var preference = {
    snapshot: function () { return { profile: null, override: null, identity: 'lifecycle' }; },
    prepare: function () {},
    clear: function () { calls.push(['preferencesClear']); },
    setProfile: function () {},
    versions: function () { return []; },
    selectedProfile: function () { return null; },
    choiceState: function () { return { audio: false, subtitles: false, versions: false }; },
    playbackPreferences: function () { return {}; },
    save: function () {},
    setVersion: function () {},
    setTrack: function () {},
    cycleTrack: function () {},
    cycleVersion: function () {}
  };
  var presentation = {
    snapshot: function () { return { summaryOverflowing: false, summaryDialogOpen: false }; },
    renderMetadata: function (detail) { calls.push(['metadata', detail && detail.ratingKey || '']); },
    renderMediaControls: function () {},
    clear: function () { calls.push(['presentationClear']); },
    updateSummaryOverflow: function () { return false; },
    openSummary: function () { return true; },
    closeSummary: function () {},
    scrollSummary: function () {}
  };
  var episodeView = {
    setContext: function (context) { calls.push(['episodeContext', context && context.episodes && context.episodes.length || 0]); },
    setEpisodes: function () {},
    setSeasonIndex: function (index) { return index; },
    setEpisodeIndex: function (index) { return index; },
    render: function () {},
    renderSeasons: function () {},
    renderEpisodes: function () {},
    refreshSelection: function () {},
    refreshPlaybackCards: function () { calls.push(['playbackCards']); },
    reconcilePlayback: function () { calls.push(['reconcilePlayback']); },
    startTitlePan: function () {},
    reset: function () { calls.push(['episodeReset']); }
  };

  function deferred(bucket, key, callback, abortValue) {
    var entry = {
      key: String(key || ''),
      callback: callback,
      aborts: 0,
      completed: false,
      request: null,
      resolve: function (error, value) {
        if (entry.completed) { return; }
        entry.completed = true;
        callback(error || null, value);
      }
    };
    entry.request = {
      abort: function () {
        entry.aborts += 1;
        if (!entry.completed && abortValue) {
          entry.completed = true;
          callback(abortValue.error || null, abortValue.value);
        }
      }
    };
    bucket.push(entry);
    return entry.request;
  }

  var root = {
    setTimeout: function (callback) { var id = nextTimer; nextTimer += 1; timers[id] = callback; return id; },
    clearTimeout: function (id) { delete timers[id]; }
  };
  var PlexClient = {
    loadMetadata: function (_config, ratingKey, callback) {
      return deferred(requests.metadata, ratingKey, callback, { value: { ratingKey: String(ratingKey), title: 'aborted-' + ratingKey } });
    },
    loadSeriesContext: function (_config, detail, callback) {
      return deferred(requests.series, detail && detail.ratingKey, callback, {
        value: { seasons: [{ ratingKey: 'abort-season' }], episodes: [{ ratingKey: 'abort-episode' }] }
      });
    },
    loadSeasonEpisodes: function (_config, seasonKey, _selectedKey, callback) {
      return deferred(requests.seasons, seasonKey, callback, {
        value: [{ ratingKey: 'abort-episode', duration: 120000, viewOffset: 60000 }]
      });
    },
    setWatchedAndReset: function (_config, ratingKey, _watched, callback) {
      return deferred(requests.watched, ratingKey, callback, { value: null });
    }
  };
  var feature = DetailFeatureController.create({
    platform: { root: root, document: document, storage: {} },
    modules: {
      DetailController: {
        create: function (options) {
          var controller = DetailController.create(options);
          var originalDestroy = controller.destroy;
          controller.destroy = function () { destroyed += 1; originalDestroy(); };
          return controller;
        }
      },
      DetailNavigation: DetailNavigation,
      DetailPresentationView: { create: function () { return presentation; } },
      DetailEpisodeView: { create: function () { return episodeView; } },
      DetailPreferenceState: { create: function () { return preference; } },
      MetadataRefresh: { run: function () {} },
      MediaPreferences: { resolve: function () { return null; } },
      MediaInfo: { create: function () { return { sections: [] }; } },
      MediaChoiceModel: MediaChoiceModel,
      MediaProfile: { choiceState: function () { return { audio: false, subtitles: false, versions: false }; }, trackDisplayLabel: function () { return ''; } },
      VersionSelection: { selectAutomatic: function () { return null; } },
      ProgressiveImages: {}
    },
    data: {
      PlexClient: PlexClient,
      config: {},
      mediaPreferenceIdentity: function () { return 'lifecycle'; },
      playbackCapabilities: function () { return { directPlay: true, codecs: [], containers: [] }; },
      settings: function () { return { playbackMode: 'auto', videoVersionPriorities: [] }; },
      activeVideoQuality: function () { return 'original'; },
      waitForActivity: function () {}
    },
    shell: {
      t: function (key) { return key; },
      element: function () { return new FakeNode(); },
      setText: function (id, value) { document.getElementById(id).textContent = String(value || ''); },
      posterLoader: function () { return {}; },
      loadRenderedPoster: function (_node, source) { calls.push(['poster', source]); },
      cancelImages: function (scope) { calls.push(['cancelImages', scope]); },
      scheduleBackdrop: function (item) { calls.push(['backdrop', item && item.ratingKey || '']); },
      activeBackdropSource: function () { return ''; },
      clearBackdrop: function () { calls.push(['clearBackdrop']); },
      scheduleTheme: function (item) { calls.push(['theme', item && item.ratingKey || '', item]); },
      showMessage: function (message) { calls.push(['message', message]); },
      showViewState: function () {},
      hideViewState: function () {},
      clearFocus: function () {},
      navigationTarget: function () { return null; },
      navigationIndex: function () { return 0; },
      navigationCount: function () { return 1; },
      moveNavigation: function () {},
      activateNavigation: function () {},
      mediaTitle: function (item) { return item && item.title || ''; },
      mediaMeta: function () { return ''; },
      mediaDetail: function () { return ''; }
    },
    watchlist: {
      available: function () { return true; },
      identity: function () { return 'watchlist'; },
      snapshot: function () { return { provider: { id: 'provider' }, loading: false, mutationPending: false, loadedIdentity: 'watchlist' }; },
      findLocal: function () { return null; },
      load: function () { return null; },
      toggle: function (cloudKey, _enabled, _local, callback) {
        return deferred(requests.watchlist, cloudKey, callback, { value: null });
      }
    },
    dialogs: {
      openChoice: function () {},
      mediaInfoOpen: function () { return false; },
      openMediaInfo: function () {},
      closeMediaInfo: function () {},
      scrollMediaInfo: function () {}
    },
    state: {
      currentView: function () { return view; },
      pointerSelectionActive: function () { return false; },
      animationsEnabled: function () { return false; },
      animationDuration: function (milliseconds) { return milliseconds; }
    },
    transitions: {
      enterDetail: function () { view = 'detail'; },
      hideBrowsingSurfaces: function () {},
      restoreOrigin: function () { view = 'home'; },
      requestPlayback: function () {},
      onWatchedChanged: function (ratingKey, watched) { calls.push(['watchedChanged', ratingKey, watched]); }
    }
  });

  return {
    calls: calls,
    requests: requests,
    feature: feature,
    document: document,
    setView: function (next) { view = next; },
    runTimers: function () {
      var ids = Object.keys(timers);
      ids.forEach(function (id) { var callback = timers[id]; delete timers[id]; callback(); });
    },
    timerCount: function () { return Object.keys(timers).length; },
    destroyed: function () { return destroyed; }
  };
}

(function testSynchronousAbortCannotPublishPreviousMetadata() {
  var harness = createLifecycleHarness();
  harness.feature.open({ ratingKey: 'first', title: 'First' }, { returnView: 'home' });
  assert.strictEqual(harness.requests.metadata.length, 1, 'first detail starts one metadata request');
  harness.feature.open({ ratingKey: 'second', title: 'Second' }, { returnView: 'home' });
  assert.strictEqual(harness.requests.metadata[0].aborts, 1, 'opening another media aborts the previous metadata request');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, undefined, 'the synchronous abort callback cannot publish the previous detail');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'metadata' && entry[1] === 'first'; }).length, 0, 'stale metadata is never rendered');
}());

(function testOpeningDetailKeepsTheFocusedThemeUntilMetadataArrives() {
  var harness = createLifecycleHarness();
  harness.feature.open({
    ratingKey: 'episode-1',
    type: 'episode',
    title: 'Episode',
    themeLookupKey: 'show-1'
  }, { returnView: 'home' });
  assert.strictEqual(
    harness.calls.filter(function (entry) { return entry[0] === 'theme' && entry[1] === ''; }).length,
    0,
    'the metadata placeholder must not stop the theme already playing for the focused Home card'
  );
}());

(function testOpeningDetailRetainsTheHomeThemeWhenMetadataOmitsIt() {
  var harness = createLifecycleHarness();
  var theme;
  harness.feature.open({
    ratingKey: 'show-1',
    type: 'show',
    title: 'Show',
    themeLookupKey: 'show:1',
    themeKey: 'show:1',
    themeUrl: '/theme.mp3'
  }, { returnView: 'home' });
  harness.requests.metadata[0].resolve(null, {
    ratingKey: 'episode-1',
    type: 'episode',
    title: 'Episode'
  });
  theme = harness.calls.filter(function (entry) { return entry[0] === 'theme'; }).pop()[2];
  assert.strictEqual(theme.themeLookupKey, 'show:1', 'an episode detail must retain the source cache key used by the Home theme');
  assert.strictEqual(theme.themeKey, 'show:1', 'an episode detail must retain the already-playing source show theme identity');
  assert.strictEqual(theme.themeUrl, '/theme.mp3', 'an episode detail must retain the already-playing source show theme URL');
}());

(function testReplacingAnOpenDetailKeepsAudioContinuousUntilMetadataArrives() {
  var harness = createLifecycleHarness();
  harness.feature.openLoaded({
    ratingKey: 'episode-1',
    type: 'episode',
    title: 'First episode'
  }, { returnView: 'home', skipSeriesLoad: true });
  harness.calls.length = 0;
  harness.feature.open({
    ratingKey: 'episode-2',
    type: 'episode',
    title: 'Second episode',
    themeLookupKey: 'show-1'
  }, { returnView: 'home' });
  assert.strictEqual(
    harness.calls.filter(function (entry) { return entry[0] === 'theme' && entry[1] === ''; }).length,
    0,
    'replacing an open detail must not insert silence before the next metadata response'
  );
}());

(function testLateSeriesContextAfterLeaveIsIgnored() {
  var harness = createLifecycleHarness();
  harness.feature.openLoaded({ ratingKey: 'show-1', type: 'show', title: 'Show' }, { returnView: 'home' });
  assert.strictEqual(harness.requests.series.length, 1, 'loaded series starts one context request');
  harness.feature.leave();
  assert.strictEqual(harness.requests.series[0].aborts, 1, 'leaving detail aborts the series request');
  harness.requests.series[0].callback(null, { seasons: [{ ratingKey: 'late-season' }], episodes: [{ ratingKey: 'late-episode' }] });
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'episodeContext'; }).length, 0, 'late series context cannot rebuild a closed detail');
}());

(function testLateWatchedAndWatchlistCallbacksCannotMutateNextDetail() {
  var harness = createLifecycleHarness();
  var first = { ratingKey: 'movie-1', type: 'movie', title: 'First', cloudRatingKey: 'cloud-1', viewed: false };
  var second = { ratingKey: 'movie-2', type: 'movie', title: 'Second', cloudRatingKey: 'cloud-2', viewed: false };
  harness.feature.openLoaded(first, { returnView: 'home', skipSeriesLoad: true });
  harness.document.getElementById('detail-watched').onclick();
  harness.document.getElementById('detail-watchlist').onclick();
  assert.strictEqual(harness.requests.watched.length, 1, 'watched mutation is owned by the feature');
  assert.strictEqual(harness.requests.watchlist.length, 1, 'watchlist mutation is owned by the feature');
  harness.feature.openLoaded(second, { returnView: 'home', skipSeriesLoad: true });
  harness.requests.watched[0].callback(null);
  harness.requests.watchlist[0].callback(null);
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'movie-2', 'late mutations keep the newer detail selected');
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewed, false, 'late watched response cannot change the newer detail');
  assert.strictEqual(harness.feature.snapshot().currentDetail.inWatchlist, false, 'late watchlist response cannot change the newer detail');
}());

(function testLateProgressRefreshAfterNewDetailIsIgnored() {
  var harness = createLifecycleHarness();
  var episode = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0 };
  var context = { seasons: [{ ratingKey: 'season-1' }], episodes: [episode] };
  harness.feature.openLoaded(episode, { returnView: 'home', context: context });
  harness.feature.refreshPlaybackState('episode-1', 60);
  assert.strictEqual(harness.requests.seasons.length, 1, 'progress reconciliation owns one season request');
  harness.feature.openLoaded({ ratingKey: 'movie-2', type: 'movie', title: 'Second' }, { returnView: 'home', skipSeriesLoad: true });
  harness.requests.seasons[0].callback(null, [{ ratingKey: 'episode-1', duration: 120000, viewOffset: 60000 }]);
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'reconcilePlayback'; }).length, 0, 'late progress refresh cannot patch the next detail');
}());

(function testPlaybackReturnHydratesTheCurrentSeasonAndKeepsTheActiveEpisode() {
  var harness = createLifecycleHarness();
  var active = { ratingKey: 'episode-4', type: 'episode', index: 4, duration: 120000, viewOffset: 30000 };
  var context = {
    seasons: [{ ratingKey: 'season-2', index: 2 }],
    episodes: [active],
    playlistQueue: false,
    type: 'show'
  };
  var fresh = [
    { ratingKey: 'episode-1', type: 'episode', index: 1, viewed: true, duration: 120000, viewOffset: 0 },
    { ratingKey: 'episode-2', type: 'episode', index: 2, viewed: true, duration: 120000, viewOffset: 0 },
    { ratingKey: 'episode-3', type: 'episode', index: 3, viewed: true, duration: 120000, viewOffset: 0 },
    { ratingKey: 'episode-4', type: 'episode', index: 4, viewed: false, duration: 120000, viewOffset: 30000 }
  ];

  harness.feature.openLoaded(active, { returnView: 'home', context: context });
  harness.feature.refreshPlaybackState('episode-4', 30);
  harness.requests.seasons[0].callback(null, fresh);

  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes.length, 4, 'returning from a cross-season queue must restore the complete current season');
  assert.strictEqual(harness.feature.snapshot().episodeIndex, 3, 'the active queue episode must remain selected after season hydration');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[2].viewed, true, 'fresh Plex watched state must be reflected for previously completed episodes');
}());

(function testLeaveAndDestroyAreIdempotent() {
  var harness = createLifecycleHarness();
  var cancelBefore;
  var resetBefore;
  harness.feature.openLoaded({ ratingKey: 'movie-1', type: 'movie', title: 'Movie' }, { returnView: 'home', skipSeriesLoad: true });
  cancelBefore = harness.calls.filter(function (entry) { return entry[0] === 'cancelImages'; }).length;
  resetBefore = harness.calls.filter(function (entry) { return entry[0] === 'episodeReset'; }).length;
  harness.feature.leave();
  harness.feature.leave();
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'cancelImages'; }).length - cancelBefore, 1, 'repeated leave cancels the image scope once');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'episodeReset'; }).length - resetBefore, 1, 'repeated leave resets episode presentation once');
  harness.feature.destroy();
  harness.feature.destroy();
  assert.strictEqual(harness.destroyed(), 1, 'repeated destroy tears down the owned controller once');
  assert.strictEqual(harness.document.getElementById('detail-play').onclick, null, 'destroy removes owned click handlers');
}());

console.log('Detail feature controller checks passed');

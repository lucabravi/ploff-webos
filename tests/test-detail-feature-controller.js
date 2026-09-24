'use strict';

var assert = require('assert');
var MediaChoiceModel = require('../app/media-choice-model');
var MultiServerMedia = require('../app/multi-server-media');
var MediaSourcePreference = require('../app/media-source-preference');
var DetailFeatureController = require('../app/coordinator/detail-feature-controller');
var PlexSourceRouter = require('../app/coordinator/plex-source-router');
var MediaSourceResolver = require('../app/coordinator/media-source-resolver');

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
  this.focusCalls = 0;
}
FakeNode.prototype.setAttribute = function (name, value) { this.attributes[name] = String(value); };
FakeNode.prototype.getAttribute = function (name) { return this.attributes[name]; };
FakeNode.prototype.focus = function () { this.focused = true; this.focusCalls += 1; };

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

function createHarness(overrides) {
  var values = overrides || {};
  var calls = [];
  var requestConfigs = [];
  var mediaControlsModel = null;
  var controllerCreates = 0;
  var presentationCreates = 0;
  var episodeCreates = 0;
  var extendedCreates = 0;
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
  var extrasCallback = null;
  var metadataCallback = null;
  var assPrefetchCandidates = [];
  var seasonEpisodes = [
    { ratingKey: 'episode-1', title: 'Episode 1', viewed: false, viewOffset: 12000, progress: 0.1 },
    { ratingKey: 'episode-2', title: 'Episode 2', viewed: false, viewOffset: 0, progress: 0 }
  ];
  var deferSeasonEpisodeLoads = false;
  var pendingSeasonEpisodeLoads = [];
  var watchedFailures = {};
  var deferredWatched = {};
  var preference = {
    snapshot: function () { return { profile: values.preferenceProfile || { summary: '1080p', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] }, override: values.preferenceOverride || null, identity: 'id' }; },
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
    cycleVersion: function () {},
    preferenceSource: function () { return typeof values.preferenceSource === 'function' ? values.preferenceSource() : 'global'; }
  };
  var presentation = {
    snapshot: function () { return { summaryOverflowing: false, summaryDialogOpen: false }; },
    renderMetadata: function (detail, subtitle) { calls.push(['metadata', detail.ratingKey, subtitle]); },
    renderMediaControls: function (model) { mediaControlsModel = model; calls.push(['mediaControls', model.values.version]); },
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
    refreshSelection: function () { calls.push(['episodeSelection']); },
    refreshPlaybackCards: function () { calls.push(['playbackCards']); },
    reconcilePlayback: function () {},
    cardAt: function (index) { calls.push(['episodeCardAt', Number(index)]); return document.getElementById('episode-card-' + Number(index)); },
    startTitlePan: function () {},
    reset: function () { calls.push(['episodeReset']); }
  };
  var extendedState = { active: false, row: 'cast', atTop: true, extras: [], extraIndex: 0 };
  var extendedView = {
    setDetail: function (detail) { calls.push(['extendedDetail', detail && detail.ratingKey || '']); },
    setExtrasLoading: function (loading) { calls.push(['extrasLoading', loading === true]); },
    setExtras: function (items) { extendedState.extras = (items || []).slice(); calls.push(['extras', extendedState.extras.map(function (item) { return item.ratingKey; })]); },
    enter: function () { extendedState.active = true; calls.push(['extendedEnter']); return extendedState; },
    leave: function () { extendedState.active = false; calls.push(['extendedLeave']); return extendedState; },
    atTop: function () { return extendedState.atTop; },
    select: function (row, index) { extendedState.row = row; if (row === 'extras') { extendedState.extraIndex = Number(index || 0); } calls.push(['extendedSelect', row, Number(index || 0)]); return true; },
    focusTarget: function () { return document.getElementById('detail-extended-anchor'); },
    selectedExtra: function () { return extendedState.row === 'extras' ? (extendedState.extras[extendedState.extraIndex] || null) : null; },
    navigate: function (direction) { if (direction === 'down' && extendedState.extras.length) { extendedState.row = 'extras'; } calls.push(['extendedNavigate', direction]); return { row: extendedState.row, leave: false }; },
    snapshot: function () { return extendedState; },
    reset: function () { extendedState.active = false; calls.push(['extendedReset']); }
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
    setFromContinueWatching: function (value) { state.fromContinueWatching = value === true; return state.fromContinueWatching; },
    setPlayPending: function (pending) { state.playPending = pending; },
    setBackLockedUntil: function () {},
    setSeasonTransitionMediaKey: function (key) { state.seasonTransitionMediaKey = key; },
    patchCurrentDetail: function (patch) { Object.keys(patch).forEach(function (key) { state.currentDetail[key] = patch[key]; }); },
    patchSelectedItem: function (patch) { Object.keys(patch).forEach(function (key) { state.selectedItem[key] = patch[key]; }); },
    patchEpisode: function (index, patch) { Object.keys(patch).forEach(function (key) { state.seriesContext.episodes[index][key] = patch[key]; }); },
    prepareMediaProfile: function (detail, identity) { state.mediaProfileRatingKey = detail.ratingKey; controllerOptions.preparePreferences(identity, detail); },
    queueMediaProfile: function () {},
    loadSelected: function (item, callback) { return controllerOptions.loadMetadata(item.ratingKey, function (error, detail) { if (!error && detail) { state.currentDetail = detail; } if (callback) { callback(error, detail); } }); },
    loadEpisode: function (episode, callback) {
      if (typeof values.loadEpisodeDetail === 'function') { return values.loadEpisodeDetail(episode, callback); }
      if (callback) { callback(null, Object.assign({ type: 'episode' }, episode || {})); }
      return null;
    },
    requestPlayback: function (options) { return controllerOptions.requestPlayback({ detail: state.currentDetail, options: options || {} }); },
    refresh: function (keys, reload, callback) {
      if (typeof values.refreshFlow === 'function') { return values.refreshFlow(keys, reload, callback); }
      if (callback) { callback(null); }
      return null;
    },
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
  var baseConfig = values.config || {};
  var sourceRouter = values.sourceRouter || PlexSourceRouter.create({
    config: baseConfig,
    sources: {
      primaryContext: function () {
        return { apiBaseUrl: baseConfig.apiBaseUrl || '', token: baseConfig.token || '', requestTimeout: baseConfig.requestTimeout };
      },
      contextForMachine: function () { return null; }
    }
  });
  var options = {
    platform: { root: root, document: document, storage: values.storage || {} },
    modules: {
      DetailController: { create: function (values) { controllerCreates += 1; controllerOptions = values; return controller; } },
      DetailNavigation: {},
      DetailPresentationView: { create: function (values) { presentationCreates += 1; presentationOptions = values; return presentation; } },
      DetailEpisodeView: { create: function (values) { episodeCreates += 1; episodeOptions = values; return episodeView; } },
      DetailExtendedView: { create: function () { extendedCreates += 1; return extendedView; } },
      DetailPreferenceState: { create: function () { preferenceCreates += 1; return preference; } },
      MetadataRefresh: {},
      MediaPreferences: values.MediaPreferences || { key: function () { return 'identity'; }, resolve: function () { return { audioTrack: null, subtitleTrack: null }; } },
      MediaInfo: { create: function (profile, options) { calls.push(['mediaInfoModel', profile.summary, options.audioStreamID || '']); return { sections: [{ title: 'model' }] }; } },
      MediaChoiceModel: MediaChoiceModel,
      MediaProfile: values.MediaProfile || {
        choiceState: function () { return { audio: false, subtitles: false, versions: false }; },
        trackDisplayLabel: function () { return ''; }
      },
      VersionSelection: values.VersionSelection || { selectAutomatic: function (versions) { return versions[0] || null; } },
      ProgressiveImages: {},
      MultiServerMedia: values.MultiServerMedia || MultiServerMedia,
      MediaSourcePreference: values.MediaSourcePreference || MediaSourcePreference
    },
      data: {
      PlexClient: {
        loadMetadata: function (_config, ratingKey, callback) {
          requestConfigs.push({ method: 'loadMetadata', ratingKey: ratingKey, config: _config });
          calls.push(['loadMetadata', ratingKey]);
          if (typeof values.loadMetadata === 'function') { return values.loadMetadata(_config, ratingKey, callback); }
          metadataCallback = callback;
          return { abort: function () { calls.push(['abortMetadata', ratingKey]); } };
        },
        loadExtras: function (_config, ratingKey, callback) {
          requestConfigs.push({ method: 'loadExtras', ratingKey: ratingKey, config: _config });
          calls.push(['loadExtras', ratingKey]);
          extrasCallback = callback;
          return { abort: function () { calls.push(['abortExtras', ratingKey]); } };
        },
        loadSeriesContext: function (_config, _detail, callback) { requestConfigs.push({ method: 'loadSeriesContext', ratingKey: _detail && _detail.ratingKey, config: _config }); callback(null, null); return null; },
        loadMediaProfile: function (_config, ratingKey, callback) {
          requestConfigs.push({ method: 'loadMediaProfile', ratingKey: ratingKey, config: _config });
          if (typeof values.loadMediaProfile === 'function') { return values.loadMediaProfile(_config, ratingKey, callback); }
          callback(null, values.preferenceProfile || { summary: '1080p', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [], versions: [] });
          return null;
        },
        loadSeasonEpisodes: function (_config, seasonKey, _selectedKey, callback) {
          requestConfigs.push({ method: 'loadSeasonEpisodes', ratingKey: seasonKey, config: _config });
          calls.push(['loadSeasonEpisodes', seasonKey]);
          if (typeof values.loadSeasonEpisodes === 'function') { return values.loadSeasonEpisodes(_config, seasonKey, callback); }
          if (deferSeasonEpisodeLoads) {
            pendingSeasonEpisodeLoads.push({ seasonKey: seasonKey, callback: callback });
            return { abort: function () {} };
          }
          callback(null, seasonEpisodes.map(function (episode) { return Object.assign({}, episode); }));
          return null;
        },
        setWatchedAndReset: function (_config, ratingKey, watched, callback) {
          var index;
          requestConfigs.push({ method: 'setWatched', ratingKey: ratingKey, config: _config });
          calls.push(['setWatched', ratingKey, watched]);
          if (deferredWatched[String(ratingKey)]) {
            deferredWatched[String(ratingKey)] = { callback: callback, watched: watched };
            return null;
          }
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
          if (typeof values.onRemoveContinue === 'function') { values.onRemoveContinue(target); }
          calls.push(['removeContinuePort', target.item && target.item.ratingKey]);
          callback(null, target);
          return null;
        }
      },
      config: values.config || {},
      sourceRouter: sourceRouter,
      sourceResolver: MediaSourceResolver.create({ sourceRouter: sourceRouter }),
      loadMergedSeriesContext: values.loadMergedSeriesContext,
      loadMergedSeasonEpisodes: values.loadMergedSeasonEpisodes,
      resolveGuid: values.resolveGuid,
      displayServerName: values.displayServerName,
      recoverPrimary: values.recoverPrimary,
      mediaPreferenceIdentity: values.mediaPreferenceIdentity || function () { return 'server:profile:media'; },
      subtitlePresentationIdentity: function () { return values.subtitlePresentationIdentity || 'server-a'; },
      playbackCapabilities: function () { return { directPlay: true, codecs: [], containers: [] }; },
      settings: function () { return values.settings || { playbackMode: 'auto', videoVersionPriorities: [], aggregateLibraries: true, aggregateHomeLibraries: true }; },
      activeVideoQuality: function () { return 'original'; },
      waitForActivity: function () {},
      onAssPrefetchCandidate: function (detail, profile, resolved) {
        assPrefetchCandidates.push({ detail: detail, profile: profile, resolved: resolved });
        if (typeof values.onAssPrefetchCandidate === 'function') { values.onAssPrefetchCandidate(detail, profile, resolved); }
      }
      },
    shell: {
      t: function (key, parameters) { return values.translate ? values.translate(key, parameters || {}) : key; },
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
      clearFocus: function () { if (typeof values.onClearFocus === 'function') { values.onClearFocus(); } },
      navigationTarget: function () { return values.navigationTarget || null; },
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
      currentView: function () { return values.currentView || 'detail'; },
      pointerSelectionActive: function () { return typeof values.pointerSelectionActive === 'function' ? values.pointerSelectionActive() : values.pointerSelectionActive === true; },
      animationsEnabled: function () { return false; },
      animationDuration: function (milliseconds) { return milliseconds; }
    },
    transitions: {
      enterDetail: function (returnView) { calls.push(['enterDetail', returnView]); },
      hideBrowsingSurfaces: function () { calls.push(['hideBrowsing']); },
      restoreOrigin: function (returnView) { calls.push(['restoreOrigin', returnView]); },
      requestPlayback: function (request) { calls.push(['requestPlayback', request.detail && request.detail.ratingKey]); return request; },
      requestStandalonePlayback: function (request) {
        calls.push([
          'requestStandalonePlayback',
          request.detail && request.detail.ratingKey,
          request.item && request.item.ratingKey,
          request.item && request.item.serverMachineIdentifier || '',
          request.sourceContext && request.sourceContext.serverMachineIdentifier || ''
        ]);
        return request;
      },
      onWatchedChanged: function (ratingKey, watched, sourceContext) { calls.push(['watchedChangedSource', ratingKey, watched, sourceContext || null]); }
    }
  };
  return {
    calls: calls,
    requestConfigs: requestConfigs,
    controller: controller,
    controllerOptions: function () { return controllerOptions; },
    presentationOptions: function () { return presentationOptions; },
    mediaControls: function () { return mediaControlsModel; },
    episodeOptions: function () { return episodeOptions; },
    counts: function () { return { controller: controllerCreates, presentation: presentationCreates, episode: episodeCreates, extended: extendedCreates, preference: preferenceCreates, destroyed: destroyed }; },
    feature: DetailFeatureController.create(options),
    document: document,
    state: state,
    preference: preference,
    assPrefetchCandidates: assPrefetchCandidates,
    resolveMetadata: function (error, detail) { if (metadataCallback) { metadataCallback(error || null, detail || null); } },
    resolveExtras: function (error, items) { if (extrasCallback) { extrasCallback(error || null, items || []); } },
    setSeasonEpisodes: function (episodes) { seasonEpisodes = episodes.map(function (episode) { return Object.assign({}, episode); }); },
    deferSeasonLoads: function () { deferSeasonEpisodeLoads = true; },
    resolveSeasonLoad: function (index, error, episodes) {
      var pending = pendingSeasonEpisodeLoads[index];
      if (pending) { pending.callback(error || null, (episodes || []).map(function (episode) { return Object.assign({}, episode); })); }
    },
    setWatchedFailure: function (ratingKey, enabled) { watchedFailures[String(ratingKey)] = enabled === true; },
    deferWatched: function (ratingKey) { deferredWatched[String(ratingKey)] = true; },
    resolveWatched: function (ratingKey, error) {
      var entry = deferredWatched[String(ratingKey)];
      var index;
      if (!entry || entry === true) { return false; }
      delete deferredWatched[String(ratingKey)];
      if (!error) {
        for (index = 0; index < seasonEpisodes.length; index += 1) {
          if (String(seasonEpisodes[index].ratingKey) === String(ratingKey)) {
            seasonEpisodes[index].viewed = entry.watched;
            seasonEpisodes[index].viewOffset = 0;
            seasonEpisodes[index].progress = 0;
          }
        }
      }
      entry.callback(error || null);
      return true;
    }
  };
}


(function testEpisodeFocusUsesMountedEpisodeCardWithoutDocumentLookup() {
  var harness = createHarness();
  var queryCalls = 0;
  harness.document.querySelector = function () { queryCalls += 1; return null; };
  harness.feature.setFocus({ zone: 'episodes', episodeIndex: 2 });
  var target = harness.feature.updateFocus();
  assert.strictEqual(queryCalls, 0, 'episode focus must not search the document for a card already owned by DetailEpisodeView');
  assert.strictEqual(target, harness.document.getElementById('episode-card-2'), 'episode focus must use the mounted card exposed by DetailEpisodeView');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'episodeCardAt' && entry[1] === 2; }),
    'episode focus must resolve the mounted node through DetailEpisodeView');
}());

(function testLateMergedSeriesContextKeepsAlreadyLoadedSelectedSeason() {
  var primary = { serverMachineIdentifier: 'late-loaded-a', apiBaseUrl: 'https://late-loaded-a', token: 'a', primary: true };
  var secondary = { serverMachineIdentifier: 'late-loaded-b', apiBaseUrl: 'https://late-loaded-b', token: 'b' };
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'late-loaded-a' ? primary : (machine === 'late-loaded-b' ? secondary : null); }
  } });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'late-loaded-show-a', guid: 'plex://show/late-loaded', type: 'show' }, primary),
    MultiServerMedia.decorateItem({ ratingKey: 'late-loaded-show-b', guid: 'plex://show/late-loaded', type: 'show' }, secondary)
  );
  var finalCallback;
  var seasonNineEpisode = { ratingKey: 'late-loaded-s9-e1', type: 'episode', seasonIndex: 9, episodeIndex: 1, serverMachineIdentifier: 'late-loaded-a' };
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: {},
    loadMergedSeriesContext: function (_item, callback, onProgress) {
      finalCallback = callback;
      onProgress({
        seasons: [
          { ratingKey: 'late-loaded-a-s1', type: 'season', seasonNumber: 1, serverMachineIdentifier: 'late-loaded-a' },
          { ratingKey: 'late-loaded-a-s9', type: 'season', seasonNumber: 9, serverMachineIdentifier: 'late-loaded-a' }
        ],
        episodes: [{ ratingKey: 'late-loaded-a-s1-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'late-loaded-a' }],
        multiServer: true
      });
      return { abort: function () {} };
    }
  });
  harness.feature.openLoaded(show, { returnView: 'library', selectedItem: show });
  harness.feature.setFocus({ zone: 'seasons', seasonIndex: 1, episodeIndex: 0 });
  harness.controller.setEpisodes([seasonNineEpisode], 0);
  finalCallback(null, {
    seasons: [
      { ratingKey: 'late-loaded-a-s1', type: 'season', seasonNumber: 1, serverMachineIdentifier: 'late-loaded-a' },
      { ratingKey: 'late-loaded-a-s9', type: 'season', seasonNumber: 9, serverMachineIdentifier: 'late-loaded-a' }
    ],
    episodes: [{ ratingKey: 'late-loaded-b-s1-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'late-loaded-b' }],
    multiServer: true
  });
  assert.strictEqual(harness.feature.snapshot().seasonIndex, 1,
    'a late first-season response must leave the selected season index unchanged');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].ratingKey, seasonNineEpisode.ratingKey,
    'a late first-season response must preserve already loaded episodes for the selected season');
}());

(function testConstructionAndLoadedDetailRendering() {
  var harness = createHarness();
  var detail = { ratingKey: 'movie-1', title: 'Movie', subtitle: '2026', facts: '120 min', summary: 'Summary', image: '/poster.jpg' };
  assert.deepStrictEqual(harness.counts(), { controller: 1, presentation: 1, episode: 1, extended: 1, preference: 1, destroyed: 0 }, 'feature constructs each owned component exactly once');
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

(function primaryDetailMetadataRetriesAfterRuntimeFailover() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-runtime', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'http://primary-old.example', token: 'primary-token', requestTimeout: 1500
  };
  var attempts = [];
  var recoveries = 0;
  var loaded = null;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    sourceRouter: router,
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = {
        serverMachineIdentifier: 'primary-runtime', serverName: 'Primary', primary: true, owned: true,
        apiBaseUrl: 'https://primary-direct.example', token: 'primary-token', requestTimeout: 1500
      };
      callback(null, primaryRoute);
      return true;
    },
    loadMetadata: function (config, ratingKey, callback) {
      var error;
      attempts.push(config.apiBaseUrl);
      if (attempts.length === 1) {
        error = new Error('primary route failed');
        error.transportFailure = true;
        callback(error);
      } else {
        callback(null, { ratingKey: ratingKey, type: 'movie', title: 'Recovered detail' });
      }
      return { abort: function () {} };
    }
  });
  harness.controllerOptions().loadMetadata('primary-movie', function (error, detail) {
    assert.ifError(error);
    loaded = detail;
  });
  assert.strictEqual(recoveries, 1, 'primary Detail metadata must request bounded route recovery after a transport failure');
  assert.deepStrictEqual(attempts, ['http://primary-old.example', 'https://primary-direct.example'],
    'primary Detail metadata must retry once on the promoted runtime route');
  assert.ok(loaded && loaded.ratingKey === 'primary-movie', 'Detail must publish the successful metadata retry');
}());

(function testDirectPrimaryPlayRetriesMetadataAfterRuntimeFailover() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-play', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'http://primary-play-old.example', token: 'primary-token', requestTimeout: 1500
  };
  var attempts = [];
  var recoveries = 0;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    currentView: 'home',
    sourceRouter: router,
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = {
        serverMachineIdentifier: 'primary-play', serverName: 'Primary', primary: true, owned: true,
        apiBaseUrl: 'https://primary-play-direct.example', token: 'primary-token', requestTimeout: 1500
      };
      callback(null, primaryRoute);
      return true;
    },
    loadMetadata: function (config, ratingKey, callback) {
      var error;
      attempts.push(config.apiBaseUrl);
      if (attempts.length === 1) {
        error = new Error('primary direct-play route failed');
        error.transportFailure = true;
        callback(error);
      } else {
        callback(null, { ratingKey: ratingKey, type: 'movie', title: 'Recovered direct play' });
      }
      return { abort: function () {} };
    }
  });

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'primary-direct-play', type: 'movie', title: 'Primary direct play' }, { sourceContext: primaryRoute }), true);
  assert.strictEqual(recoveries, 1, 'direct Play metadata must request bounded primary route recovery after a transport failure');
  assert.deepStrictEqual(attempts, ['http://primary-play-old.example', 'https://primary-play-direct.example'],
    'direct Play metadata must retry once on the promoted primary route');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'requestPlayback' && entry[1] === 'primary-direct-play'; }),
    'direct Play must preserve the original play intent after the bounded route retry succeeds');
  assert.strictEqual(harness.feature.sourceContext().apiBaseUrl, 'https://primary-play-direct.example',
    'direct Play must retain the promoted primary route instead of restoring its stale entry context');
}());

(function testDirectPrimarySeasonPlayRetriesEpisodeListAfterRuntimeFailover() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-season-play', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'http://primary-season-old.example', token: 'primary-token'
  };
  var seasonAttempts = [];
  var metadataRoutes = [];
  var recoveries = 0;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    currentView: 'library',
    sourceRouter: router,
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = {
        serverMachineIdentifier: 'primary-season-play', serverName: 'Primary', primary: true, owned: true,
        apiBaseUrl: 'https://primary-season-direct.example', token: 'primary-token'
      };
      callback(null, primaryRoute);
      return true;
    },
    loadSeasonEpisodes: function (config, _seasonKey, callback) {
      var error;
      seasonAttempts.push(config.apiBaseUrl);
      if (seasonAttempts.length === 1) {
        error = new Error('primary season route failed');
        error.transportFailure = true;
        callback(error);
      } else {
        callback(null, [{ ratingKey: 'season-play-e1', type: 'episode', title: 'Episode' }]);
      }
      return { abort: function () {} };
    },
    loadMetadata: function (config, ratingKey, callback) {
      metadataRoutes.push(config.apiBaseUrl);
      callback(null, { ratingKey: ratingKey, type: 'episode', title: 'Episode' });
      return { abort: function () {} };
    }
  });

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'season-play', type: 'season', title: 'Season' }, { sourceContext: primaryRoute }), true);
  assert.strictEqual(recoveries, 1, 'direct season Play must recover the primary route when episode enumeration fails in transport');
  assert.deepStrictEqual(seasonAttempts, ['http://primary-season-old.example', 'https://primary-season-direct.example'],
    'direct season Play must retry episode enumeration once on the promoted route');
  assert.deepStrictEqual(metadataRoutes, ['https://primary-season-direct.example'],
    'the selected episode metadata must continue on the promoted route');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'requestPlayback' && entry[1] === 'season-play-e1'; }),
    'direct season Play must preserve the play intent after route recovery');
}());

(function testDirectPrimaryPlayDoesNotFailOverForApplicationErrors() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-http', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'https://primary-http.example', token: 'primary-token'
  };
  var recoveries = 0;
  var attempts = 0;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    currentView: 'home',
    sourceRouter: router,
    recoverPrimary: function () { recoveries += 1; return true; },
    loadMetadata: function (_config, _ratingKey, callback) {
      var error = new Error('Plex rejected metadata request');
      error.status = 500;
      attempts += 1;
      callback(error);
      return { abort: function () {} };
    }
  });

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'primary-http-play', type: 'movie' }, { sourceContext: primaryRoute }), true);
  assert.strictEqual(attempts, 1, 'direct Play must not retry an HTTP/application metadata failure');
  assert.strictEqual(recoveries, 0, 'direct Play must not treat an HTTP/application failure as a dead primary route');
}());

(function testDirectSecondaryPlayNeverUsesPrimaryFailover() {
  var secondaryRoute = {
    serverMachineIdentifier: 'secondary-play', serverName: 'Shared', primary: false, owned: false,
    apiBaseUrl: 'https://secondary-play.example', token: 'secondary-token'
  };
  var recoveries = 0;
  var attempts = 0;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'primary', primary: true, apiBaseUrl: 'https://primary.example', token: 'primary-token' }; },
      contextForMachine: function (machine) { return machine === 'secondary-play' ? secondaryRoute : null; }
    }
  });
  var harness = createHarness({
    currentView: 'library',
    sourceRouter: router,
    recoverPrimary: function () { recoveries += 1; return true; },
    loadMetadata: function (_config, _ratingKey, callback) {
      var error = new Error('secondary route failed');
      error.transportFailure = true;
      attempts += 1;
      callback(error);
      return { abort: function () {} };
    }
  });

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'secondary-direct-play', type: 'movie', serverMachineIdentifier: 'secondary-play' }, { sourceContext: secondaryRoute }), true);
  assert.strictEqual(attempts, 1, 'secondary direct Play must fail after its own route transport error without retrying on the primary PMS');
  assert.strictEqual(recoveries, 0, 'secondary direct Play must never invoke primary route failover');
}());

(function testResolvedExternalAssTrackPublishesPrefetchCandidate() {
  var detail = { ratingKey: 'episode-prefetch', type: 'episode', title: 'Prefetch episode' };
  var track = { id: 'ass-prefetch', format: 'ass', codec: 'ASS', external: true, key: '/subtitles/prefetch.ass' };
  var profile = {
    ratingKey: detail.ratingKey,
    partId: 'part-prefetch',
    mediaIndex: 0,
    partIndex: 0,
    summary: '1080p',
    audioTracks: [],
    subtitleTracks: [track]
  };
  var harness = createHarness({
    MediaPreferences: {
      key: function () { return 'identity'; },
      resolve: function () { return { audioTrack: null, subtitleTrack: track }; }
    }
  });
  harness.preference.snapshot = function () { return { profile: profile, override: null, identity: 'id' }; };
  harness.preference.selectedProfile = function () { return profile; };
  harness.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  harness.controllerOptions().onMediaProfileState({
    mediaProfileLoading: false,
    mediaProfileRatingKey: detail.ratingKey
  });
  assert.strictEqual(harness.assPrefetchCandidates.length, 1, 'Detail must publish a resolved ASS candidate');
  assert.strictEqual(harness.assPrefetchCandidates[0].detail.ratingKey, detail.ratingKey);
  assert.strictEqual(harness.assPrefetchCandidates[0].profile, profile);
  assert.strictEqual(harness.assPrefetchCandidates[0].resolved.subtitleTrack, track);
}());

(function testExtendedDetailEntersImmediatelyAndLoadsExtrasOnlyOnce() {
  var harness = createHarness();
  var detail = {
    ratingKey: 'movie-extended',
    type: 'movie',
    title: 'Extended movie',
    genres: ['Fantasy'],
    directors: ['Director'],
    cast: [{ id: 'person-1', name: 'Actor', role: 'Lead' }]
  };
  harness.feature.openLoaded(detail, { returnView: 'library', skipSeriesLoad: true });
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }).length, 0, 'extras must not be prefetched while the primary detail viewport is active');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'extendedDetail' && entry[1] === 'movie-extended'; }), 'already-loaded title metadata must be handed to the lazy extended view without another metadata request');

  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'extendedEnter'; }), 'extended focus must enter the lower viewport immediately');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }), [['loadExtras', 'movie-extended']], 'first entry must lazily request extras for the root title');

  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }).length, 1, 're-entering the lower viewport must not duplicate the extras request in the same detail session');
  harness.resolveExtras(null, [
    { ratingKey: 'extra-1', title: 'Trailer One' },
    { ratingKey: 'extra-2', title: 'Trailer Two' }
  ]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'extras'; }).pop(), ['extras', ['extra-1', 'extra-2']], 'lazy extras completion must preserve Plex occurrence order in the extended view');
}());

(function testRefreshReloadRetriesOnPromotedPrimaryRoute() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-refresh', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'http://primary-refresh-old.example', token: 'primary-token'
  };
  var recoveries = 0;
  var attempts = [];
  var refreshCompleted = false;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    sourceRouter: router,
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = {
        serverMachineIdentifier: 'primary-refresh', serverName: 'Primary', primary: true, owned: true,
        apiBaseUrl: 'https://primary-refresh-direct.example', token: 'primary-token'
      };
      callback(null, primaryRoute);
      return true;
    },
    refreshFlow: function (_keys, reload, callback) {
      return reload('movie-refresh-failover', function (error) {
        refreshCompleted = !error;
        callback(error || null);
      });
    },
    loadMetadata: function (config, ratingKey, callback) {
      var error;
      attempts.push(config.apiBaseUrl);
      if (attempts.length === 1) {
        error = new Error('refresh reload route failed');
        error.transportFailure = true;
        callback(error);
      } else {
        callback(null, { ratingKey: ratingKey, type: 'movie', title: 'Refreshed' });
      }
      return { abort: function () {} };
    }
  });

  harness.feature.openLoaded({ ratingKey: 'movie-refresh-failover', type: 'movie', title: 'Refresh failover' }, {
    returnView: 'library', sourceContext: primaryRoute, skipSeriesLoad: true
  });
  assert.strictEqual(harness.controllerOptions().refreshCurrentMetadata(), true);
  assert.strictEqual(recoveries, 1, 'post-refresh metadata reload must recover the primary route after a transport failure');
  assert.deepStrictEqual(attempts, ['http://primary-refresh-old.example', 'https://primary-refresh-direct.example'],
    'post-refresh metadata reload must retry once on the promoted primary route');
  assert.strictEqual(refreshCompleted, true, 'metadata refresh must complete after the bounded reload retry');
}());

(function testExtendedExtrasRetriesOnPromotedPrimaryRoute() {
  var primaryRoute = {
    serverMachineIdentifier: 'primary-extras', serverName: 'Primary', primary: true, owned: true,
    apiBaseUrl: 'http://primary-extras-old.example', token: 'primary-token'
  };
  var recoveries = 0;
  var router = PlexSourceRouter.create({
    config: {},
    sources: {
      primaryContext: function () { return primaryRoute; },
      contextForMachine: function () { return null; }
    }
  });
  var harness = createHarness({
    sourceRouter: router,
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = {
        serverMachineIdentifier: 'primary-extras', serverName: 'Primary', primary: true, owned: true,
        apiBaseUrl: 'https://primary-extras-direct.example', token: 'primary-token'
      };
      callback(null, primaryRoute);
      return true;
    }
  });
  var error = new Error('extras route failed');
  error.transportFailure = true;

  harness.feature.openLoaded({ ratingKey: 'movie-extras-failover', type: 'movie', title: 'Extras failover' }, {
    returnView: 'library', sourceContext: primaryRoute, skipSeriesLoad: true
  });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  harness.resolveExtras(error);

  assert.strictEqual(recoveries, 1, 'lazy Detail extras must recover the primary route after a transport failure');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }).length, 2,
    'lazy Detail extras must retry once after primary route promotion');
  harness.resolveExtras(null, [{ ratingKey: 'extra-after-failover', title: 'Recovered extra' }]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'extras'; }).pop(), ['extras', ['extra-after-failover']],
    'lazy Detail extras must publish the successful bounded retry');
}());

(function testGeneratedSeasonFallbackInDetailUsesActiveLocale() {
  var harness = createHarness({
    translate: function (key, parameters) {
      if (key === 'media.season') { return 'Stagione ' + parameters.number; }
      if (key === 'player.episode') { return 'Episodio'; }
      return key;
    }
  });
  var detail = {
    ratingKey: 'episode-localized-season', type: 'episode', title: 'Show',
    subtitle: 'Season 2 - E03 - Episode title', seasonTitleKey: 'media.season',
    seasonTitleParameters: { number: 2 }, seasonIndex: 2, episodeIndex: 3
  };

  harness.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  assert.ok(harness.calls.some(function (entry) {
    return entry[0] === 'metadata' && entry[1] === detail.ratingKey && entry[2] === 'Stagione 2 - Episodio 3 - Episode title';
  }), 'Detail must localize both generated season and episode labels before presentation');
}());

(function testDetailDisplaysEffectiveSubtitleScope() {
  var detail = { type: 'episode', ratingKey: 'episode-scope', parentRatingKey: 'season-scope' };
  var track = { id: 'episode-track', languageTag: 'it', language: 'Italiano', codec: 'ASS', format: 'ass', external: true, title: 'Dialoghi', forced: false };
  var profile = { ratingKey: detail.ratingKey, mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [track] };
  var h = createHarness({
    preferenceProfile: profile,
    preferenceOverride: { subtitleTrack: { language: 'it', name: 'dialoghi', codec: 'ass', channels: 0, external: true } },
    preferenceSource: function () { return 'season'; },
    MediaPreferences: {
      key: function () { return 'identity'; },
      resolve: function () { return { audioTrack: null, subtitleTrack: track }; }
    },
    MediaProfile: {
      choiceState: function () { return { audio: false, subtitles: true, versions: false }; },
      trackDisplayLabel: function (value) { return value && value.title || ''; }
    }
  });
  h.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  h.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: detail.ratingKey });
  assert.strictEqual(h.mediaControls().sources.subtitles, 'season', 'detail must expose the season provenance separately from the subtitle value');
  assert.strictEqual(h.mediaControls().values.subtitles, 'Dialoghi', 'preference provenance must not be appended to the playable subtitle label');
}());

(function testExtendedExtraActivationUsesStandalonePlayerWithoutDuplicateMetadataLoad() {
  var harness = createHarness();
  var parent = { ratingKey: 'movie-extra-play', type: 'movie', title: 'Parent' };
  var extra = { ratingKey: 'extra-play-1', type: 'clip', subtype: 'trailer', title: 'Trailer', duration: 30000 };
  harness.feature.openLoaded(parent, { returnView: 'library', skipSeriesLoad: true });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  harness.resolveExtras(null, [extra]);
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-down');

  assert.strictEqual(harness.controllerOptions().activateExtended(), true, 'OK on a selected extra must start its standalone activation flow');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadMetadata' && entry[1] === 'extra-play-1'; }).length, 0, 'extra activation must not duplicate the metadata request that PlaybackController performs itself');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'requestStandalonePlayback'; }).pop(), ['requestStandalonePlayback', 'extra-play-1', 'extra-play-1', '', ''], 'the selected extra must be handed directly to the standalone Player path without replacing the parent Detail');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'movie-extra-play', 'starting an extra must preserve the parent Detail as the return surface');
}());

(function testSharedSeriesContextRetainsTheOwningPmsOnEpisodesAndSeasons() {
  var harness = createHarness();
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Marco',
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b'
  };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [{ ratingKey: 'episode-1', title: 'Episode 1', type: 'episode' }]
  };
  var snapshot;

  harness.feature.openLoaded({ ratingKey: 'show-shared', type: 'show', title: 'Shared Show' }, {
    returnView: 'library',
    sourceContext: sourceContext,
    context: context
  });
  snapshot = harness.feature.snapshot();
  assert.strictEqual(snapshot.seriesContext.seasons[0].serverMachineIdentifier, 'server-b',
    'season records must retain the owning PMS identifier');
  assert.strictEqual(snapshot.seriesContext.episodes[0].serverMachineIdentifier, 'server-b',
    'episode records must retain the owning PMS identifier');
  assert.strictEqual(snapshot.seriesContext.episodes[0].sourceId, 'server-b|4',
    'episode records must retain the originating source identity');
}());

(function testSharedExtraRetainsOwnerAndExplicitSourceContextForStandalonePlayback() {
  var harness = createHarness();
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Marco',
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b'
  };
  var request;

  harness.feature.openLoaded({ ratingKey: 'movie-shared-extra', type: 'movie', title: 'Parent' }, {
    returnView: 'library',
    sourceContext: sourceContext,
    skipSeriesLoad: true
  });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  harness.resolveExtras(null, [{ ratingKey: 'extra-shared-1', type: 'clip', subtype: 'trailer', title: 'Trailer' }]);
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-down');
  assert.strictEqual(harness.controllerOptions().activateExtended(), true);
  request = harness.calls.filter(function (entry) { return entry[0] === 'requestStandalonePlayback'; }).pop();
  assert.strictEqual(request[3], 'server-b', 'extra records must retain their owning PMS identifier');
  assert.strictEqual(request[4], 'server-b', 'standalone extra playback must carry the source context explicitly');
}());

(function testResumeAfterStandalonePlayerRestoresExtendedViewport() {
  var harness = createHarness();
  var parent = { ratingKey: 'movie-extra-return', type: 'movie', title: 'Parent' };
  harness.feature.openLoaded(parent, { returnView: 'library', skipSeriesLoad: true });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.ok(String(harness.document.getElementById('detail-view').className || '').indexOf('is-extended') !== -1,
    'entering extended details must snap the retained Detail to the lower viewport');

  harness.feature.hideSurface();
  assert.ok(String(harness.document.getElementById('detail-view').className || '').indexOf('is-extended') !== -1,
    'hiding Detail for playback must preserve its lower viewport instead of resetting the snap track to the top');
  harness.feature.resumeAfterPlayer(0);

  assert.strictEqual(harness.state.zone, 'extended', 'returning from standalone playback must preserve the logical extended focus zone');
  assert.ok(String(harness.document.getElementById('detail-view').className || '').indexOf('is-extended') !== -1,
    'returning from standalone playback must restore the lower Detail viewport instead of showing the primary pane with extended logical focus');
  assert.strictEqual(String(harness.document.getElementById('detail-view').className || '').indexOf('is-snap-restoring'), -1,
    'the no-animation restore state must be removed immediately after applying the lower viewport');
}());

(function testDetailFocusOwnershipAvoidsGlobalClearForDpadAndPointerMoves() {
  var clearCalls = 0;
  var pointerActive = false;
  var harness = createHarness({
    onClearFocus: function () { clearCalls += 1; },
    pointerSelectionActive: function () { return pointerActive; }
  });
  var detail = { ratingKey: 'movie-focus-owner', type: 'movie', title: 'Focus owner' };
  var baseline;
  var watched;
  var watchlist;

  harness.feature.openLoaded(detail, { returnView: 'library', skipSeriesLoad: true });
  baseline = clearCalls;
  harness.controller.setFocus({ zone: 'play', actionIndex: 1 });
  harness.feature.updateFocus();
  assert.strictEqual(clearCalls, baseline, 'D-pad movement inside Detail must reuse locally owned focus instead of scanning the document');
  watched = harness.document.getElementById('detail-watched');
  assert.ok(String(watched.className || '').indexOf('is-focused') !== -1, 'D-pad movement must still move the logical focus ring');

  pointerActive = true;
  baseline = clearCalls;
  harness.feature.pointerFocus('play', 2);
  assert.strictEqual(clearCalls, baseline, 'Magic Remote movement inside Detail must reuse the same local focus ownership path');
  watchlist = harness.document.getElementById('detail-watchlist');
  assert.ok(String(watchlist.className || '').indexOf('is-focused') !== -1, 'pointer movement must still move the logical focus ring');
  assert.strictEqual(watchlist.focusCalls, 0, 'pointer movement must not force native keyboard focus');

  watchlist.className = String(watchlist.className || '').replace(/\s*is-focused/g, '');
  baseline = clearCalls;
  harness.feature.pointerFocus('play', 3);
  assert.strictEqual(clearCalls, baseline + 1, 'Detail must fall back to the global clear when its previous focus ownership was lost');

  harness = createHarness({
    onClearFocus: function () { clearCalls += 1; },
    navigationTarget: new FakeNode('nav-target')
  });
  harness.feature.openLoaded(detail, { returnView: 'library', skipSeriesLoad: true });
  baseline = clearCalls;
  harness.feature.focusNavigation();
  assert.strictEqual(clearCalls, baseline + 1, 'Detail content-to-navbar transitions must retain the global clear as a cross-surface recovery boundary');
}());

(function testPointerFocusRoutesExtendedExtrasThroughTheExtendedView() {
  var harness = createHarness();
  var parent = { ratingKey: 'movie-extra-pointer', type: 'movie', title: 'Parent' };
  harness.feature.openLoaded(parent, { returnView: 'library', skipSeriesLoad: true });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  harness.resolveExtras(null, [{ ratingKey: 'extra-pointer-1', type: 'clip', subtype: 'trailer', title: 'Trailer' }]);

  assert.strictEqual(harness.feature.pointerFocus('extra', 0), true, 'pointer focus on an extra must be accepted while Detail is active');
  assert.strictEqual(harness.state.zone, 'extended', 'pointer focus on an extra must keep the Detail controller in the extended zone');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'extendedSelect'; }).pop(), ['extendedSelect', 'extras', 0], 'pointer focus must select the addressed extra occurrence in the extended view');
}());

(function testExtendedDetailRetriesExtrasAfterTransientFailure() {
  var harness = createHarness();
  var detail = {
    ratingKey: 'movie-extras-retry',
    type: 'movie',
    title: 'Extras retry movie'
  };
  harness.feature.openLoaded(detail, { returnView: 'library', skipSeriesLoad: true });
  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }).length, 1, 'first lower-viewport entry must request extras');

  harness.resolveExtras(new Error('offline'));
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-leave');
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }).length, 2, 're-entering after a transient extras failure must retry the request');
}());

(function testEpisodeEntryLazyLoadsSeriesMetadataForExtendedDetail() {
  var harness = createHarness();
  var episode = { ratingKey: 'episode-1', showRatingKey: 'show-1', type: 'episode', title: 'Episode', cast: [{ id: 'episode-person', name: 'Episode Actor' }] };
  var show = { ratingKey: 'show-1', type: 'show', title: 'Series', genres: ['Anime'], directors: ['Series Director'], cast: [{ id: 'series-person', name: 'Series Actor' }] };
  harness.feature.openLoaded(episode, { returnView: 'home', skipSeriesLoad: true });
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadMetadata'; }).length, 0, 'opening an episode must not eagerly load series metadata');

  harness.controller.setFocus({ zone: 'extended' });
  harness.controllerOptions().onFocusChanged({ zone: 'extended' }, 'extended-enter');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadMetadata'; }), [['loadMetadata', 'show-1']], 'first extended entry from an episode must lazy-load the root series metadata');
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadExtras'; }), [['loadExtras', 'show-1']], 'series extras must be anchored to the root show rather than the highlighted episode');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'extendedDetail' && entry[1] === 'episode-1'; }).length, 0, 'episode-specific cast must not replace the approved series-level extended metadata');

  harness.resolveMetadata(null, show);
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'extendedDetail' && entry[1] === 'show-1'; }), 'lazy root metadata completion must publish the series-level cast and genres into the active lower viewport');
}());

(function testLateSeasonActivationCannotReplaceNewerSeasonEpisodes() {
  var harness = createHarness();
  var seasonOneEpisodes = [
    { ratingKey: 's1-e1', title: 'Season 1 Episode 1' },
    { ratingKey: 's1-e2', title: 'Season 1 Episode 2' }
  ];
  var seasonTwoEpisodes = [
    { ratingKey: 's2-e1', title: 'Season 2 Episode 1' },
    { ratingKey: 's2-e2', title: 'Season 2 Episode 2' }
  ];
  var context = {
    seasons: [
      { ratingKey: 'season-1', title: 'Season 1' },
      { ratingKey: 'season-2', title: 'Season 2' }
    ],
    episodes: seasonOneEpisodes.slice()
  };
  harness.feature.setPlaybackContext(seasonOneEpisodes[0], seasonOneEpisodes[0], context, 0, 0);
  harness.deferSeasonLoads();

  harness.controllerOptions().loadSeason();
  harness.controller.selectSeason(1);
  harness.controllerOptions().loadSeason();
  harness.resolveSeasonLoad(1, null, seasonTwoEpisodes);
  assert.deepStrictEqual(harness.state.seriesContext.episodes.map(function (episode) { return episode.ratingKey; }), ['s2-e1', 's2-e2'], 'the newer season activation must publish its own episodes');

  harness.resolveSeasonLoad(0, null, seasonOneEpisodes);
  assert.strictEqual(harness.state.seasonIndex, 1, 'a late older season response must preserve the newer season selection');
  assert.deepStrictEqual(harness.state.seriesContext.episodes.map(function (episode) { return episode.ratingKey; }), ['s2-e1', 's2-e2'], 'a late older season response must not replace episodes belonging to the newer selection');
}());


(function testMultipleLocalVersionsExposeCyclingWithoutExternalPms() {
  var first = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var second = { summary: '2160p HEVC HDR', mediaIndex: 1, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var harness = createHarness({
    MediaProfile: {
      choiceState: function (_profile, versions) { return { audio: false, subtitles: false, versions: (versions || []).length > 1 }; },
      trackDisplayLabel: function () { return ''; }
    }
  });
  first.versions = [first, second];
  harness.preference.snapshot = function () { return { profile: first, override: null, identity: 'id' }; };
  harness.preference.versions = function () { return [first, second]; };
  harness.preference.selectedProfile = function () { return first; };
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'movie-a' });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'multiple physical versions on one PMS must expose Version cycling even without any external server copy');
}());

(function testVersionBrowserDefersMultipleVersionMutationUntilApply() {
  var harness = createHarness();
  var first = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var second = { summary: '2160p HEVC HDR', mediaIndex: 1, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var setVersionCalls = [];
  var browserCall;
  var options;
  harness.preference.snapshot = function () { return { profile: first, override: null, identity: 'id' }; };
  harness.preference.versions = function () { return [first, second]; };
  harness.preference.selectedProfile = function () { return first; };
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



(function testVersionBrowserSelectsResolvedSemanticPreferenceAcrossBitrates() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var preferred = { summary: '2160p HEVC HDR', mediaIndex: 0, partIndex: 0, videoCodec: 'HEVC', container: 'MKV', width: 3840, height: 2160, bitrate: 20000, videoResolution: '4k', hdr: true, audioTracks: [], subtitleTracks: [] };
  var alternate = { summary: '1080p H264', mediaIndex: 1, partIndex: 0, videoCodec: 'H264', container: 'MP4', width: 1920, height: 1080, bitrate: 5000, videoResolution: '1080', hdr: false, audioTracks: [], subtitleTracks: [] };
  var resolved = { summary: '2160p HEVC HDR', mediaIndex: 0, partIndex: 0, videoCodec: 'HEVC', container: 'MKV', width: 3840, height: 2160, bitrate: 14500, videoResolution: '4k', hdr: true, audioTracks: [], subtitleTracks: [] };
  var harness = createHarness({ MediaPreferences: MediaPreferences, VersionSelection: VersionSelection });
  var browserCall;
  harness.preference.snapshot = function () { return { profile: resolved, override: { versionSignature: VersionSelection.signature(preferred) }, identity: 'id' }; };
  harness.preference.versions = function () { return [alternate, resolved]; };
  harness.preference.selectedProfile = function () { return resolved; };
  harness.controllerOptions().openVersionDetails();
  browserCall = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; })[0][1];
  assert.strictEqual(browserCall.selectedValue, '0:0', 'version browser must highlight the physically resolved version when the saved semantic signature differs only by bitrate/order');
}());


(function testDetailVersionLabelMarksMissingPreferenceAsAutomaticFallback() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var fallback = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, videoCodec: 'H264', container: 'MP4', width: 1920, height: 1080, bitrate: 5000, audioTracks: [], subtitleTracks: [] };
  var missing = { mediaIndex: 1, partIndex: 0, videoCodec: 'HEVC', container: 'MKV', width: 3840, height: 2160, bitrate: 20000, audioTracks: [], subtitleTracks: [] };
  var harness = createHarness({
    preferenceProfile: fallback,
    preferenceOverride: { versionSignature: VersionSelection.signature(missing) },
    MediaPreferences: MediaPreferences,
    VersionSelection: VersionSelection,
    MediaProfile: { choiceState: function () { return { audio: false, subtitles: false, versions: false }; }, trackDisplayLabel: function () { return ''; } }
  });
  harness.feature.openLoaded({ ratingKey: 'movie-fallback', type: 'movie', title: 'Fallback' }, { returnView: 'home' });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'movie-fallback' });
  assert.strictEqual(harness.mediaControls().values.version, 'player.versionAuto - 1080p H264', 'an unavailable saved version must be presented as an Automatic fallback without clearing the saved preference');
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

(function testSharedSeasonBulkWatchedPreservesOwningPms() {
  var harness = createHarness();
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Marco',
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b'
  };
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
  var changes;
  harness.feature.openLoaded(detail, { returnView: 'library', sourceContext: sourceContext, context: context });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'season-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);
  changes = harness.calls.filter(function (entry) { return entry[0] === 'watchedChangedSource'; });
  assert.strictEqual(changes.length, 2, 'bulk watched must publish every successfully changed episode');
  changes.forEach(function (entry) {
    assert.strictEqual(entry[3] && entry[3].serverMachineIdentifier, 'server-b',
      'bulk watched notifications must retain the owning PMS so equal ratingKeys on other servers are not mutated');
  });
}());


(function testDetailOptionsMarkOnlyPreviousUnwatchedEpisodes() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-3', type: 'episode', title: 'Episode 3', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [
      { ratingKey: 'episode-1', title: 'Episode 1', viewed: true },
      { ratingKey: 'episode-2', title: 'Episode 2', viewed: false },
      detail
    ]
  };
  var menu;
  var confirm;
  harness.setSeasonEpisodes(context.episodes);
  harness.feature.setPlaybackContext(detail, detail, context, 0, 2);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.deepStrictEqual(menu.choices.map(function (choice) { return choice.value; }), ['previous-watched', 'season-watched', 'season-unwatched', 'refresh-metadata'], 'later episodes must expose the focused previous-episodes action before whole-season actions');
  menu.apply(menu.choices[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  assert.strictEqual(confirm.title, 'detail.markPreviousWatchedConfirm', 'previous-episodes action must require confirmation');
  confirm.apply(confirm.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'episode-2', true]
  ], 'previous-episodes action must skip already-viewed entries and never mutate the selected episode');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length, 2, 'previous-episodes action must reload fresh season state before writes and again after completion');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'detail.previousWatchedComplete'; }), 'successful previous-episodes updates must report completion');
}());


(function testPreviousEpisodesCompletionDoesNotReplaceNewSeasonSelection() {
  var harness = createHarness();
  var selected = { ratingKey: 's1-e2', title: 'Season 1 Episode 2', viewed: false };
  var seasonOneEpisodes = [
    { ratingKey: 's1-e1', title: 'Season 1 Episode 1', viewed: false },
    selected
  ];
  var seasonTwoEpisodes = [
    { ratingKey: 's2-e1', title: 'Season 2 Episode 1', viewed: false },
    { ratingKey: 's2-e2', title: 'Season 2 Episode 2', viewed: false }
  ];
  var context = {
    seasons: [
      { ratingKey: 'season-1', title: 'Season 1' },
      { ratingKey: 'season-2', title: 'Season 2' }
    ],
    episodes: seasonOneEpisodes.slice()
  };
  var menu;
  var confirm;
  harness.setSeasonEpisodes(seasonOneEpisodes);
  harness.deferWatched('s1-e1');
  harness.feature.setPlaybackContext(selected, selected, context, 0, 1);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);

  harness.controller.selectSeason(1);
  harness.controller.setEpisodes(seasonTwoEpisodes.slice(), 0);
  harness.setSeasonEpisodes(seasonOneEpisodes);
  harness.resolveWatched('s1-e1');

  assert.strictEqual(harness.state.seasonIndex, 1, 'completing a previous-episodes batch must not change the newer season selection');
  assert.deepStrictEqual(harness.state.seriesContext.episodes.map(function (episode) { return episode.ratingKey; }), ['s2-e1', 's2-e2'],
    'the completion reload for an older season must not replace episodes from the season the user moved to');
}());


(function testLeavingDetailClearsPendingSeasonBulkState() {
  var harness = createHarness();
  var selected = { ratingKey: 'episode-2', type: 'episode', title: 'Episode 2', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [
      { ratingKey: 'episode-1', title: 'Episode 1', viewed: false },
      selected
    ]
  };
  var menu;
  var confirm;
  var firstLoadCount;
  harness.setSeasonEpisodes(context.episodes);
  harness.deferWatched('episode-1');
  harness.feature.setPlaybackContext(selected, selected, context, 0, 1);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);
  assert.strictEqual(harness.document.getElementById('detail-options').disabled, true, 'bulk watched work disables Detail options while the operation is active');

  harness.feature.leave();
  assert.strictEqual(harness.document.getElementById('detail-options').disabled, false, 'leaving Detail must clear the disabled state even when an aborted bulk callback never arrives');

  harness.feature.setPlaybackContext(selected, selected, context, 0, 1);
  firstLoadCount = harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length;
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  confirm.apply(confirm.choices[0]);
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length, firstLoadCount + 1,
    'a new Detail session must be able to start another bulk watched action after the previous request was abandoned');
}());

(function testStaleBulkCallbackCannotUnlockNewDetailBulk() {
  var harness = createHarness();
  var oldSelected = { ratingKey: 'old-e2', type: 'episode', title: 'Old Episode 2', viewed: false };
  var oldContext = {
    seasons: [{ ratingKey: 'old-season', title: 'Old Season' }],
    episodes: [{ ratingKey: 'old-e1', title: 'Old Episode 1', viewed: false }, oldSelected]
  };
  var newSelected = { ratingKey: 'new-e2', type: 'episode', title: 'New Episode 2', viewed: false };
  var newContext = {
    seasons: [{ ratingKey: 'new-season', title: 'New Season' }],
    episodes: [{ ratingKey: 'new-e1', title: 'New Episode 1', viewed: false }, newSelected]
  };
  var menu;
  var confirm;
  var loadCount;

  harness.setSeasonEpisodes(oldContext.episodes);
  harness.deferWatched('old-e1');
  harness.feature.setPlaybackContext(oldSelected, oldSelected, oldContext, 0, 1);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  confirm.apply(confirm.choices[0]);

  harness.feature.leave();
  harness.setSeasonEpisodes(newContext.episodes);
  harness.deferWatched('new-e1');
  harness.feature.setPlaybackContext(newSelected, newSelected, newContext, 0, 1);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  confirm.apply(confirm.choices[0]);
  loadCount = harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length;
  assert.strictEqual(harness.document.getElementById('detail-options').disabled, true, 'the new Detail bulk remains visibly locked while its write is pending');

  harness.resolveWatched('old-e1');
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  confirm.apply(confirm.choices[0]);

  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'loadSeasonEpisodes'; }).length, loadCount,
    'a stale watched callback from the previous Detail session must not clear the pending guard for the active bulk');
}());


(function testFirstEpisodeDoesNotExposePreviousWatchedAction() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [detail, { ratingKey: 'episode-2', title: 'Episode 2', viewed: false }]
  };
  var menu;
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.strictEqual(menu.choices.some(function (choice) { return choice.value === 'previous-watched'; }), false, 'the first episode must not expose a no-op previous-episodes action');
}());

(function testPreviousWatchedRequiresSelectedEpisodeInFreshSeason() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-2', type: 'episode', title: 'Episode 2', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [{ ratingKey: 'episode-1', title: 'Episode 1', viewed: false }, detail]
  };
  var menu;
  var confirm;
  harness.setSeasonEpisodes([{ ratingKey: 'episode-1', title: 'Episode 1', viewed: false }]);
  harness.feature.setPlaybackContext(detail, detail, context, 0, 1);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [], 'a stale selected episode must prevent all watched mutations');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'status.mediaUnavailable'; }), 'a stale selected episode must surface an availability error instead of guessing by index');
}());

(function testPreviousWatchedContinuesAfterIndividualFailure() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-3', type: 'episode', title: 'Episode 3', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [
      { ratingKey: 'episode-1', title: 'Episode 1', viewed: false },
      { ratingKey: 'episode-2', title: 'Episode 2', viewed: false },
      detail
    ]
  };
  var menu;
  var confirm;
  harness.setSeasonEpisodes(context.episodes);
  harness.setWatchedFailure('episode-1', true);
  harness.feature.setPlaybackContext(detail, detail, context, 0, 2);
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'previous-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'episode-1', true],
    ['setWatched', 'episode-2', true]
  ], 'an individual failure must not prevent later previous episodes from being updated');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'detail.seasonBulkPartial'; }), 'previous-episodes partial failure must reuse the established bulk warning');
}());

(function testPartialDetailOptionsStartWithMarkUnwatched() {
  var harness = createHarness();
  var detail = { ratingKey: 'movie-partial', type: 'movie', title: 'Partial movie', viewed: false, viewOffset: 42000, duration: 120000, progress: 35 };
  var menu;
  harness.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.strictEqual(menu.choices[0].value, 'mark-unwatched', 'partial media must expose Mark Unwatched as the first detail option');
  menu.apply(menu.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'movie-partial', false]
  ], 'Mark Unwatched from detail options must clear both watched state and resume progress');
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewed, false);
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewOffset, 0);
  assert.strictEqual(harness.feature.snapshot().currentDetail.progress, 0);
}());

(function testViewedPartialDetailOptionsStartWithMarkWatched() {
  var harness = createHarness();
  var detail = { ratingKey: 'episode-rewatch-partial', type: 'episode', title: 'Partial rewatch', viewed: true, viewOffset: 42000, duration: 120000, progress: 35 };
  var menu;
  harness.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  assert.strictEqual(menu.choices[0].value, 'mark-watched', 'partially resumed media already marked viewed must expose Mark Watched as the first detail option');
  menu.apply(menu.choices[0]);
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'setWatched'; }), [
    ['setWatched', 'episode-rewatch-partial', true]
  ], 'Mark Watched from detail options must preserve the complementary action to the visible Mark Unwatched button');
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewed, true);
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewOffset, 0);
  assert.strictEqual(harness.feature.snapshot().currentDetail.progress, 0);
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
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'extendedReset'; }), 'owned extended presentation and pending artwork are reset during teardown');
}());


function createLifecycleHarness(harnessOptions) {
  harnessOptions = harnessOptions || {};
  var DetailController = require('../app/coordinator/detail-controller');
  var DetailNavigation = require('../app/detail-navigation');
  var view = 'home';
  var calls = [];
  var requests = { metadata: [], series: [], seasons: [], extras: [], watched: [], watchlist: [] };
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
    refreshSelection: function () {},
    refreshPlaybackCards: function () { calls.push(['playbackCards']); },
    reconcilePlayback: function () { calls.push(['reconcilePlayback']); },
    startTitlePan: function () {},
    reset: function () { calls.push(['episodeReset']); }
  };
  var extendedView = {
    setDetail: function (detail) { calls.push(['extendedDetail', detail && detail.ratingKey || '']); },
    setExtrasLoading: function (loading) { calls.push(['extrasLoading', loading === true]); },
    setExtras: function (items) { calls.push(['extras', (items || []).length]); },
    enter: function () { calls.push(['extendedEnter']); return { row: 'anchor' }; },
    leave: function () { calls.push(['extendedLeave']); },
    atTop: function () { return true; },
    focusTarget: function () { return document.getElementById('detail-extended-anchor'); },
    selectedExtra: function () { return null; },
    navigate: function () { return { leave: false }; },
    snapshot: function () { return { active: false, row: 'anchor' }; },
    reset: function () { calls.push(['extendedReset']); }
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
    loadExtras: function (_config, ratingKey, callback) {
      return deferred(requests.extras, ratingKey, callback, { value: [] });
    },
    setWatchedAndReset: function (_config, ratingKey, _watched, callback) {
      return deferred(requests.watched, ratingKey, callback, { value: null });
    }
  };
  var sourceRouter = PlexSourceRouter.create({
        config: {},
        sources: {
          primaryContext: function () { return { apiBaseUrl: '', token: '' }; },
          contextForMachine: function () { return null; }
        }
      });
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
      DetailExtendedView: { create: function () { return extendedView; } },
      DetailPreferenceState: { create: function () { return preference; } },
      MetadataRefresh: { run: function () {} },
      MediaPreferences: { resolve: function () { return null; } },
      MediaInfo: { create: function () { return { sections: [] }; } },
      MediaChoiceModel: MediaChoiceModel,
      MediaProfile: { choiceState: function () { return { audio: false, subtitles: false, versions: false }; }, trackDisplayLabel: function () { return ''; } },
      VersionSelection: { selectAutomatic: function () { return null; } },
      ProgressiveImages: {},
      MultiServerMedia: MultiServerMedia,
      MediaSourcePreference: MediaSourcePreference
    },
    data: {
      PlexClient: PlexClient,
      config: {},
      sourceRouter: sourceRouter,
      sourceResolver: MediaSourceResolver.create({ sourceRouter: sourceRouter }),
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
      findLocal: harnessOptions.findWatchlistLocal || function () { return null; },
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
      animationsEnabled: function () { return harnessOptions.animationsEnabled === true; },
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

(function testExtendedDomFocusWaitsForVerticalSnapTransition() {
  var harness = createLifecycleHarness({ animationsEnabled: true });
  var anchor = harness.document.getElementById('detail-extended-anchor');
  harness.feature.openLoaded({ ratingKey: 'movie-snap', type: 'movie', title: 'Movie' }, { returnView: 'home', skipSeriesLoad: true });
  harness.feature.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(anchor.focusCalls, 0, 'entering extended details must not DOM-focus a target inside the transformed lower pane');
  assert.ok(String(anchor.className || '').indexOf('is-focused') !== -1, 'extended details keep logical TV focus visible without browser auto-scroll');
  harness.runTimers();
  assert.strictEqual(anchor.focusCalls, 0, 'settling the vertical snap must not introduce DOM focus that can scroll overflow-hidden ancestors');
}());

(function testWatchlistLookupKeepsDetailOwner() {
  var lookups = [];
  var harness = createLifecycleHarness({
    findWatchlistLocal: function (ratingKey, machineIdentifier) {
      lookups.push([ratingKey, machineIdentifier]);
      return machineIdentifier === 'server-b' ? {
        ratingKey: ratingKey,
        serverMachineIdentifier: machineIdentifier,
        cloudRatingKey: 'cloud-b'
      } : null;
    }
  });
  harness.feature.openLoaded({
    ratingKey: 'same',
    serverMachineIdentifier: 'server-b',
    type: 'movie',
    title: 'Shared movie'
  }, {
    returnView: 'home',
    skipSeriesLoad: true,
    sourceContext: { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://server-b.example', token: 'shared-token' }
  });
  assert.deepStrictEqual(lookups[0], ['same', 'server-b'], 'detail watchlist lookup must include the owning PMS identifier');
  assert.strictEqual(harness.feature.snapshot().currentDetail.inWatchlist, true, 'detail must match the watchlist item from its own PMS');
}());

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

(function testChangingOnlyPlexOwnerClearsThePreviousDetailPresentation() {
  var harness = createHarness();
  var firstContext = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'http://server-b', token: 'token-b' };
  var secondContext = { serverMachineIdentifier: 'server-c', apiBaseUrl: 'http://server-c', token: 'token-c' };
  harness.feature.openLoaded({
    ratingKey: 'same-key',
    type: 'movie',
    title: 'Movie B',
    serverMachineIdentifier: 'server-b'
  }, { returnView: 'home', skipSeriesLoad: true, sourceContext: firstContext });
  harness.calls.length = 0;
  harness.feature.openLoaded({
    ratingKey: 'same-key',
    type: 'movie',
    title: 'Movie C',
    serverMachineIdentifier: 'server-c'
  }, { returnView: 'home', skipSeriesLoad: true, sourceContext: secondContext });
  assert.strictEqual(
    harness.calls.filter(function (entry) { return entry[0] === 'cancelImages' && entry[1] === 'detail'; }).length,
    1,
    'the same ratingKey on another PMS must clear the previous Detail presentation'
  );
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

(function testSupersededSeasonPreviewAbortsThePreviousSeasonRequest() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1' };
  var context = {
    seasons: [{ ratingKey: 'season-1' }, { ratingKey: 'season-2' }, { ratingKey: 'season-3' }],
    episodes: [detail, { ratingKey: 'episode-2' }, { ratingKey: 'episode-3' }]
  };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.feature.setFocus({ zone: 'seasons', seasonIndex: 0 });

  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.seasons.length, 1);
  assert.strictEqual(harness.requests.seasons[0].key, 'season-2');

  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.seasons.length, 2, 'new season intent starts the next preview request');
  assert.strictEqual(harness.requests.seasons[0].aborts, 1, 'superseded season preview request is aborted immediately');
  assert.strictEqual(harness.requests.seasons[1].key, 'season-3');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].ratingKey, 'episode-1', 'synchronous abort callback cannot publish stale season episodes');
}());

(function testSupersededEpisodePreviewAbortsThePreviousMetadataRequest() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1' };
  var context = {
    seasons: [{ ratingKey: 'season-1' }],
    episodes: [detail, { ratingKey: 'episode-2' }, { ratingKey: 'episode-3' }]
  };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.feature.setFocus({ zone: 'episodes', episodeIndex: 0 });

  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.metadata.length, 1);
  assert.strictEqual(harness.requests.metadata[0].key, 'episode-2');

  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.metadata.length, 2, 'new episode intent starts the next metadata preview');
  assert.strictEqual(harness.requests.metadata[0].aborts, 1, 'superseded episode metadata preview is aborted immediately');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'episode-1', 'synchronous abort callback cannot publish stale episode metadata');

  harness.requests.metadata[1].resolve(null, { ratingKey: 'episode-3', type: 'episode', title: 'Episode 3' });
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'episode-3', 'latest episode preview remains authoritative');
}());

(function testLeavingDetailAbortsOnlyTheCurrentPendingEpisodePreviewOnce() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1' };
  var context = {
    seasons: [{ ratingKey: 'season-1' }],
    episodes: [detail, { ratingKey: 'episode-2' }]
  };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.feature.setFocus({ zone: 'episodes', episodeIndex: 0 });
  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.metadata.length, 1);

  harness.feature.leave();
  assert.strictEqual(harness.requests.metadata[0].aborts, 1, 'leaving Detail aborts the current pending preview exactly once');
  harness.feature.leave();
  assert.strictEqual(harness.requests.metadata[0].aborts, 1, 'repeated leave does not abort the same preview again');
}());


(function testSeasonIntentAbortsPendingEpisodePreviewWithoutPublishingAbortData() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1' };
  var context = {
    seasons: [{ ratingKey: 'season-1' }, { ratingKey: 'season-2' }],
    episodes: [detail, { ratingKey: 'episode-2', type: 'episode', title: 'Episode 2' }]
  };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.feature.setFocus({ zone: 'episodes', episodeIndex: 0 });
  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.metadata.length, 1, 'episode movement starts one metadata preview');

  harness.feature.setFocus({ zone: 'seasons', seasonIndex: 0 });
  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();

  assert.strictEqual(harness.requests.seasons.length, 1, 'new season intent starts its season request');
  assert.strictEqual(harness.requests.metadata[0].aborts, 1, 'new season intent aborts metadata from the previous episode intent');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'episode-1', 'synchronous abort data cannot replace the detail after season intent changes');
}());

(function testSelectedSeasonResponseRemainsAuthoritativeAfterFocusMovesBelowTabs() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-1', type: 'episode', title: 'Episode 1' };
  var context = {
    seasons: [{ ratingKey: 'season-1' }, { ratingKey: 'season-2' }],
    episodes: [detail]
  };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, detail, context, 0, 0);
  harness.feature.setFocus({ zone: 'seasons', seasonIndex: 0 });
  harness.feature.handleKey({ keyCode: 39 }, 'right');
  harness.runTimers();
  assert.strictEqual(harness.requests.seasons.length, 1, 'season preview starts one request');

  harness.feature.handleKey({ keyCode: 40 }, 'down');
  harness.requests.seasons[0].resolve(null, [{ ratingKey: 'season2-episode1', type: 'episode', title: 'Season 2 Episode 1' }]);

  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].ratingKey, 'season2-episode1', 'the latest selected season must update its episode list even after focus moves below the tabs');
}());

(function testLazyExtendedExtrasAbortWhenDetailLeaves() {
  var harness = createLifecycleHarness();
  harness.feature.openLoaded({ ratingKey: 'movie-extras', type: 'movie', title: 'Movie' }, { returnView: 'home', skipSeriesLoad: true });
  assert.strictEqual(harness.requests.extras.length, 0, 'opening detail must not start the lazy extras request');
  harness.feature.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(harness.requests.extras.length, 1, 'first Down into extended details starts one extras request');
  harness.feature.leave();
  assert.strictEqual(harness.requests.extras[0].aborts, 1, 'leaving detail aborts the owned lazy extras request');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'extras'; }).length, 0, 'the synchronous abort callback cannot publish extras into a closed detail');
}());

(function testPartialWatchedMutationKeepsDetailAlignedWithPlex() {
  var harness = createLifecycleHarness();
  var detail = { ratingKey: 'episode-partial-write', type: 'episode', title: 'Partial write', viewed: false, viewOffset: 42000, duration: 120000, progress: 35 };
  harness.feature.openLoaded(detail, { returnView: 'home', skipSeriesLoad: true });
  harness.document.getElementById('detail-watched').onclick();
  assert.strictEqual(harness.requests.watched.length, 1, 'detail watched action must own one Plex mutation');
  harness.requests.watched[0].callback(new Error('progress reset failed'), { watchedApplied: true, progressReset: false });
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewed, true,
    'if Plex changed watched state before progress reset failed, Detail must not keep the stale watched flag');
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewOffset, 42000,
    'partial failure must not pretend the resume point was cleared');
  assert.strictEqual(harness.feature.snapshot().currentDetail.progress, 35,
    'partial failure must preserve the known progress until Plex can be refreshed');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'watchedChanged' && entry[1] === 'episode-partial-write' && entry[2] === true; }),
    'partial watched success must reconcile watched state across other features');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'status.updateError'; }),
    'partial watched success must still report the failed progress reset');
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

(function testLocalPlaybackProgressUsesTheSharedPercentageScale() {
  var harness = createLifecycleHarness();
  var selected = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0 };
  var detail = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0 };
  var context = { seasons: [{ ratingKey: 'season-1' }], episodes: [detail] };
  harness.feature.setPlaybackContext(detail, selected, context, 0, 0);
  harness.feature.applyLocalPlaybackProgress('episode-1', 60);
  assert.strictEqual(harness.feature.snapshot().currentDetail.progress, 50, 'local player checkpoints must use the same 0-100 progress percentage as Plex mapped media');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].progress, 50, 'episode-strip progress must use the shared 0-100 percentage scale');
  assert.strictEqual(harness.feature.snapshot().selectedItem.progress, 50, 'local player checkpoints must update the retained browsing item used when returning from Detail');
}());

(function testPendingLocalProgressKeepsPercentageScaleDuringPlexReconciliation() {
  var harness = createLifecycleHarness();
  var episode = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0 };
  var context = { seasons: [{ ratingKey: 'season-1' }], episodes: [episode] };
  harness.feature.openLoaded(episode, { returnView: 'home', context: context });
  harness.feature.applyLocalPlaybackProgress('episode-1', 60);
  harness.feature.refreshPlaybackState('episode-1', 60);
  harness.requests.seasons[0].callback(null, [{ ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 30000, progress: 25 }]);
  assert.strictEqual(harness.feature.snapshot().currentDetail.viewOffset, 60000, 'fresh metadata behind the local checkpoint must keep the confirmed local offset');
  assert.strictEqual(harness.feature.snapshot().currentDetail.progress, 50, 'reconciliation must preserve progress on the shared 0-100 percentage scale');
}());

(function testPlaybackReconciliationUpdatesRetainedEpisodeAndBrowsingModels() {
  var harness = createLifecycleHarness();
  var selected = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0, viewed: false };
  var detail = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0, viewed: false };
  var contextEpisode = { ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 0, progress: 0, viewed: false };
  var context = { seasons: [{ ratingKey: 'season-1' }], episodes: [contextEpisode] };
  harness.setView('detail');
  harness.feature.setPlaybackContext(detail, selected, context, 0, 0);
  harness.feature.refreshPlaybackState('episode-1', 120);
  harness.requests.seasons[0].callback(null, [{
    ratingKey: 'episode-1', type: 'episode', duration: 120000, viewOffset: 120000, progress: 100, viewed: true
  }]);
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].viewed, true, 'Plex reconciliation must update the retained series model when the episode list shape is unchanged');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].progress, 100, 'the retained series model must receive fresh playback progress');
  assert.strictEqual(harness.feature.snapshot().selectedItem.viewed, true, 'fresh playback state must propagate to the retained browsing item');
  assert.strictEqual(harness.feature.snapshot().selectedItem.progress, 100, 'fresh playback progress must propagate to the retained browsing item');
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

(function testSharedDetailKeepsSourceScopedTransportAndPreferenceIdentity() {
  var identityContexts = [];
  var harness = createHarness({
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 },
    mediaPreferenceIdentity: function (_detail, sourceContext) {
      identityContexts.push(sourceContext || null);
      return String(sourceContext && sourceContext.serverMachineIdentifier || 'primary') + ':profile';
    }
  });
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Marco',
    owned: false,
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b',
    requestTimeout: 9000
  };
  var load;

  harness.feature.openLoaded({ ratingKey: 'shared-movie', type: 'movie', title: 'Shared Movie' }, {
    returnView: 'library',
    sourceContext: sourceContext
  });
  load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadSeriesContext' && entry.ratingKey === 'shared-movie'; })[0];
  assert.strictEqual(load.config.apiBaseUrl, 'https://relay-b.example', 'Detail metadata must use the source PMS route');
  assert.strictEqual(load.config.token, 'shared-token-b', 'Detail metadata must use the source-specific PMS token');
  assert.strictEqual(load.config.itemLimit, 77, 'source transport must retain non-transport application settings');
  assert.strictEqual(harness.feature.snapshot().sourceId, 'server-b|4', 'Detail must retain the originating library source identity');
  assert.strictEqual(harness.feature.snapshot().currentDetail.serverMachineIdentifier, 'server-b',
    'Detail metadata must retain the owning PMS identifier for backdrop/theme/media consumers');
  assert.strictEqual(harness.feature.snapshot().currentDetail.sourceId, 'server-b|4',
    'Detail metadata must retain the originating source identity instead of becoming indistinguishable from primary metadata');
  assert.strictEqual(identityContexts[identityContexts.length - 1].serverMachineIdentifier, 'server-b', 'media preferences must be scoped to the source PMS rather than the primary server');
}());

(function testSharedDetailDisablesManagementAndKeepsMutationsOnItsSource() {
  var removeTarget = null;
  var harness = createHarness({
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', itemLimit: 77 },
    onRemoveContinue: function (target) { removeTarget = target; }
  });
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    owned: false,
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b',
    requestTimeout: 9000
  };
  var detail = { ratingKey: 'shared-partial', type: 'movie', title: 'Shared', viewed: false, viewOffset: 1000 };
  var menu;
  var markChoice;
  var removeChoice;

  harness.feature.openLoaded(detail, { returnView: 'library', fromContinueWatching: true, sourceContext: sourceContext, skipSeriesLoad: true });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  assert.strictEqual(menu.choices.some(function (choice) { return choice.value === 'refresh-metadata'; }), false,
    'shared Detail must not expose PMS management actions');

  markChoice = menu.choices.filter(function (choice) { return choice.value === 'mark-unwatched'; })[0];
  menu.apply(markChoice);
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'watchedChangedSource'; }).slice(-1)[0][3].sourceId, 'server-b|4',
    'watched mutations must publish the originating Plex source');

  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  removeChoice = menu.choices.filter(function (choice) { return choice.value === 'remove-continue'; })[0];
  menu.apply(removeChoice);
  assert.strictEqual(removeTarget.config.apiBaseUrl, 'https://relay-b.example',
    'Continue Watching removal must carry the source PMS transport');
  assert.strictEqual(removeTarget.config.token, 'shared-token-b');
}());



(function testDeferredSingleWatchedMutationRetainsOriginatingSource() {
  var harness = createHarness();
  var sourceA = {
    sourceId: 'server-a|4',
    serverMachineIdentifier: 'server-a',
    apiBaseUrl: 'https://server-a.example',
    token: 'token-a'
  };
  var sourceB = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    apiBaseUrl: 'https://server-b.example',
    token: 'token-b'
  };
  var menu;
  var watchedEvents;

  harness.feature.openLoaded({ ratingKey: 'duplicate-key', type: 'movie', title: 'A', viewed: false, viewOffset: 1000, progress: 10 }, {
    returnView: 'library',
    sourceContext: sourceA,
    skipSeriesLoad: true
  });
  harness.deferWatched('duplicate-key');
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).slice(-1)[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'mark-unwatched'; })[0]);

  harness.feature.openLoaded({ ratingKey: 'duplicate-key', type: 'movie', title: 'B', viewed: false, viewOffset: 1000, progress: 10 }, {
    returnView: 'library',
    sourceContext: sourceB,
    skipSeriesLoad: true
  });
  harness.resolveWatched('duplicate-key');

  watchedEvents = harness.calls.filter(function (entry) { return entry[0] === 'watchedChangedSource'; });
  assert.strictEqual(watchedEvents.length, 1, 'the deferred watched write should reconcile once');
  assert.strictEqual(watchedEvents[0][3].sourceId, 'server-a|4',
    'a deferred single-item watched callback must retain the PMS that owned the write');
}());


(function testSharedDetailEmptyTokenDoesNotInheritPrimaryCredentials() {
  var harness = createHarness({
    currentView: 'library',
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 }
  });
  var item = { ratingKey: 'shared-empty-token', type: 'movie', title: 'Shared Empty', serverMachineIdentifier: 'server-b' };
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    apiBaseUrl: 'https://relay-b.example',
    token: '',
    requestTimeout: 9000
  };
  var load;

  assert.strictEqual(harness.feature.playItem(item, { sourceContext: sourceContext }), true);
  load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata' && entry.ratingKey === item.ratingKey; })[0];
  assert.ok(load, 'external metadata must still be requested when the explicit token is empty');
  assert.strictEqual(load.config.apiBaseUrl, 'https://relay-b.example');
  assert.strictEqual(load.config.token, '', 'Detail must treat an explicit empty source token as authoritative');
}());

(function testSharedDetailRejectsMismatchedOwnerContextBeforeMetadata() {
  var harness = createHarness({
    currentView: 'library',
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500 }
  });
  var item = { ratingKey: 'shared-mismatch', type: 'movie', serverMachineIdentifier: 'server-b' };
  var wrongContext = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://primary.example', token: 'primary-token' };
  var before = harness.requestConfigs.length;

  assert.strictEqual(harness.feature.playItem(item, { sourceContext: wrongContext }), false,
    'Detail must fail closed when the supplied context belongs to another PMS');
  assert.strictEqual(harness.requestConfigs.length, before, 'owner mismatch must not start a primary-routed metadata request');
}());

(function testDirectSharedLibraryPlaybackUsesSourceBeforeMetadataLoad() {
  var harness = createHarness({
    currentView: 'library',
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 }
  });
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    owned: false,
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b',
    requestTimeout: 9000
  };
  var load;

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'shared-direct', type: 'movie', title: 'Shared Direct' }, {
    sourceContext: sourceContext
  }), true, 'direct playback from a shared library must start metadata resolution');
  load = harness.requestConfigs.filter(function (entry) {
    return entry.method === 'loadMetadata' && entry.ratingKey === 'shared-direct';
  })[0];
  assert.ok(load, 'direct shared playback must request metadata');
  assert.strictEqual(load.config.apiBaseUrl, 'https://relay-b.example',
    'direct shared playback must use the source PMS route before metadata is loaded');
  assert.strictEqual(load.config.token, 'shared-token-b',
    'direct shared playback must use the source-specific token before metadata is loaded');
  assert.strictEqual(load.config.itemLimit, 77,
    'direct shared playback must retain non-transport application settings');
}());



(function testAggregatedShowUsesMergedSeriesContext() {
  var mergedCalls = 0;
  var harness = createHarness({
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' },
    loadMergedSeriesContext: function (item, callback) {
      mergedCalls += 1;
      callback(null, {
        seasons: [{ ratingKey: 'merged-s1', index: 1, sourceVariants: [{ serverMachineIdentifier: 'server-a', ratingKey: 'a-s1', sourceId: 'server-a|1' }, { serverMachineIdentifier: 'server-b', ratingKey: 'b-s1', sourceId: 'server-b|9' }] }],
        episodes: [{ ratingKey: 'a-e1', guid: 'plex://episode/1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'server-a' }, { ratingKey: 'b-e2', guid: 'plex://episode/2', type: 'episode', seasonIndex: 1, episodeIndex: 2, serverMachineIdentifier: 'server-b' }]
      });
      return null;
    }
  });
  var item = {
    ratingKey: 'show-a', guid: 'plex://show/merged', type: 'show',
    sourceVariants: [
      { serverMachineIdentifier: '', ratingKey: 'show-a', sourceId: '' },
      { serverMachineIdentifier: 'server-b', ratingKey: 'show-b', sourceId: 'server-b|9' }
    ]
  };
  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true);
  harness.resolveMetadata(null, { ratingKey: 'show-a', guid: 'plex://show/merged', type: 'show' });
  assert.strictEqual(mergedCalls, 1, 'aggregated show must request merged multi-server series context');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes.length, 2, 'merged series context must be rendered in Detail');
})();

(function testAggregatedEpisodeVersionsUseEpisodeVariantsAfterMetadataLoad() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var primaryProfile = { summary: 'Automatic - 1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  primaryProfile.versions = [primaryProfile];
  var secondaryProfile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  secondaryProfile.versions = [secondaryProfile];
  var loadedProfiles = [];
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: primaryProfile,
    loadEpisodeDetail: function (episode, callback) {
      callback(null, {
        ratingKey: episode.ratingKey,
        guid: episode.guid,
        type: 'episode',
        title: episode.title,
        seasonIndex: episode.seasonIndex,
        episodeIndex: episode.episodeIndex
      });
      return null;
    },
    loadMediaProfile: function (_config, ratingKey, callback) {
      loadedProfiles.push(String(ratingKey));
      callback(null, String(ratingKey) === 'b-e9' ? secondaryProfile : primaryProfile);
      return null;
    }
  });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/merged-versions', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'a-e9', guid: 'plex://show/merged-versions', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var episode = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-e9', guid: 'plex://episode/merged-s9e1', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-e9', guid: 'plex://episode/merged-s9e1', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );

  harness.feature.openLoaded({ ratingKey: 'show-a', guid: 'plex://show/merged-versions', type: 'show', title: 'Merged' }, {
    returnView: 'library',
    selectedItem: show,
    context: {
      seasons: [{ ratingKey: 'a-s9', index: 9, seasonNumber: 9 }],
      episodes: [episode]
    }
  });

  assert.ok(harness.feature.snapshot().currentDetail.sourceVariants && harness.feature.snapshot().currentDetail.sourceVariants.length === 2,
    'episode metadata must retain the merged PMS variants from the selected merged episode');
  harness.controllerOptions().openVersionDetails();
  assert.ok(loadedProfiles.indexOf('b-e9') !== -1,
    'episode version aggregation must load the alternate episode copy, not the parent show copy');
  assert.strictEqual(harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMediaProfile' && entry.ratingKey === 'a-e9' && entry.config.apiBaseUrl === 'https://b.example'; }).length, 0,
    'a ratingKey collision on another PMS must not make the parent show masquerade as the current episode');
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.some(function (choice) {
    return String(choice.value).indexOf('server-b') !== -1 && String(choice.label).indexOf('(NUC LUCA)') !== -1;
  }), 'the alternate external PMS version must be visible and labelled with its source server');
}());



[true, false].forEach(function testVersionBrowserResolvesEpisodeGuidWhenSeriesCardIsNotAggregated(merged) {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var guidLoads = [];
  var loadedProfiles = [];
  var primaryEpisode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-e9', guid: 'plex://episode/guid-recovery', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }
  );
  var mergedEpisode = MultiServerMedia.mergeSourceVariants(
    primaryEpisode,
    MultiServerMedia.decorateItem({ ratingKey: 'b-e9', guid: 'plex://episode/guid-recovery', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    settings: { aggregateLibraries: merged, aggregateHomeLibraries: merged },
    displayServerName: function (machine) { return machine === 'server-b' ? 'Rota' : 'MAIN'; },
    resolveGuid: function (guid, callback) {
      guidLoads.push(String(guid));
      callback(null, mergedEpisode);
      return null;
    },
    loadMediaProfile: function (_config, ratingKey, callback) {
      loadedProfiles.push(String(ratingKey));
      callback(null, profile);
      return null;
    }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', guid: 'plex://episode/guid-recovery', watchlistGuid: 'plex://show/guid-recovery', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', serverName: 'MAIN', primarySource: true
  }, {
    returnView: 'library',
    selectedItem: { ratingKey: 'show-a', guid: 'plex://show/guid-recovery', type: 'show', title: 'Merged', serverMachineIdentifier: 'server-a', primarySource: true },
    context: {
      seasons: [{ ratingKey: 'a-s9', type: 'season', index: 9, serverMachineIdentifier: 'server-a', primarySource: true }],
      episodes: [primaryEpisode]
    }
  });

  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  if (!merged) {
    harness.controllerOptions().openVersionDetails();
    assert.deepStrictEqual(guidLoads, [], 'separate libraries must not discover cross-server versions, including when opening the modal');
    assert.strictEqual(harness.mediaControls().choices.versions, false, 'one local version must not expose cycling arrows');
    assert.strictEqual(loadedProfiles.indexOf('b-e9'), -1, 'separate libraries must not fetch external media profiles');
    return;
  }
  assert.strictEqual(harness.mediaControls().choices.versions, true, 'external versions must enable arrows before opening the modal');
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  harness.controllerOptions().openVersionDetails();
  assert.deepStrictEqual(guidLoads, ['plex://episode/guid-recovery'], 'Version must resolve the exact episode GUID when the current Detail has no alternate PMS ownership');
  assert.ok(loadedProfiles.indexOf('b-e9') !== -1, 'GUID recovery must load the external episode profile');
  assert.strictEqual(harness.feature.snapshot().currentDetail.sourceVariants.length, 2, 'GUID recovery must hydrate the active episode with both PMS copies');
  assert.strictEqual(harness.feature.snapshot().currentDetail.sourcePreferenceGuid, 'plex://show/guid-recovery', 'GUID recovery must keep source preference scoped to the parent show');
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.some(function (choice) {
    return String(choice.value).indexOf('server-b') !== -1 && String(choice.label).indexOf('(Rota)') !== -1;
  }), 'GUID recovery must expose the current server alias');
  var before = harness.feature.snapshot();
  var generation = before.generation;
  var context = before.seriesContext;
  var metadataRenders = harness.calls.filter(function (entry) { return entry[0] === 'metadata'; }).length;
  var external = browser[1].choices.filter(function (choice) { return choice.sourceMachineIdentifier === 'server-b'; })[0];
  browser[1].apply(external);
  assert.strictEqual(harness.feature.snapshot().currentDetail.serverMachineIdentifier, 'server-a', 'keep the current source until metadata succeeds');
  harness.resolveMetadata(new Error('offline'));
  assert.strictEqual(harness.feature.snapshot().currentDetail.serverMachineIdentifier, 'server-a', 'failed switch must preserve the usable source');
  harness.controllerOptions().onFocusChanged({ zone: 'version' }, 'cycle-version-right');
  harness.resolveMetadata(null, { ratingKey: 'b-e9', type: 'episode', guid: primaryEpisode.guid, title: 'Other title', image: 'other-poster' });
  var after = harness.feature.snapshot();
  assert.strictEqual(after.currentDetail.serverMachineIdentifier, 'server-b');
  assert.strictEqual(after.currentDetail.ratingKey, 'b-e9');
  assert.strictEqual(after.generation, generation, 'version selection must not reopen the detail page');
  assert.deepStrictEqual(after.seriesContext, context, 'season and episode context must survive source selection');
  assert.strictEqual(after.selectedItem.ratingKey, 'show-a', 'the selected series must survive source selection');
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'metadata'; }).length, metadataRenders, 'version changes must not replace the displayed poster/title');
  harness.controllerOptions().loadMediaProfile('b-e9', function () {});
  assert.strictEqual(harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMediaProfile'; }).pop().config.apiBaseUrl, 'https://b.example', 'profile must load from episode owner even while the series belongs to the other server');
  browser[1].apply(browser[1].choices.filter(function (choice) { return choice.sourceMachineIdentifier === 'server-a'; })[0]);
  harness.feature.leave();
  harness.resolveMetadata(null, primaryEpisode);
  assert.strictEqual(harness.feature.snapshot().currentDetail, null, 'late version responses must not restore a detail after leaving it');
});

(function testCurrentAssPrefetchStartsBeforeSeasonHydrationAndHydrationIsSingleFlight() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var order = [];
  var mergedLoads = 0;
  var mergedCallback = null;
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/ass-priority', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'show-b', guid: 'plex://show/ass-priority', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var primaryEpisode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }
  );
  var mergedEpisode = MultiServerMedia.mergeSourceVariants(
    primaryEpisode,
    MultiServerMedia.decorateItem({ ratingKey: 'b-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    onAssPrefetchCandidate: function () { order.push('ass'); },
    loadMergedSeasonEpisodes: function (_season, callback) {
      mergedLoads += 1;
      order.push('season');
      mergedCallback = callback;
      return { abort: function () {} };
    }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', guid: 'plex://episode/ass-priority', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', serverName: 'MAIN', primarySource: true
  }, {
    returnView: 'library',
    selectedItem: show,
    context: { seasons: [season], episodes: [primaryEpisode] },
    deferMediaProfile: true
  });

  assert.strictEqual(harness.mediaControls().choices.versions, false,
    'a known multi-server season must not advertise cycling before the current episode ownership is confirmed');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'a known multi-server season must reserve Version arrow space before exact episode ownership is hydrated');
  assert.strictEqual(mergedLoads, 0,
    'opening Detail must not start speculative season hydration before the current media profile/ASS candidate is ready');

  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  assert.deepStrictEqual(order.slice(0, 2), ['ass', 'season'],
    'the current episode ASS prefetch candidate must be issued before speculative multi-server season hydration');
  assert.strictEqual(mergedLoads, 1, 'the first post-profile hydration must start exactly one season request');

  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  harness.controllerOptions().openVersionDetails();
  assert.strictEqual(mergedLoads, 1,
    'media-profile repaint and Version interaction must join the in-flight season hydration instead of duplicating it');

  assert.ok(mergedCallback, 'the single in-flight season hydration must remain available for completion');
  mergedCallback(null, [mergedEpisode]);
  assert.ok(harness.feature.snapshot().currentDetail.sourceVariants && harness.feature.snapshot().currentDetail.sourceVariants.length === 2,
    'the shared season hydration must still publish both PMS copies to the active episode');
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'Version arrows must remain stable after exact episode ownership becomes available');
}());

(function testSeasonVariantSingleFlightRetriesAfterTransportFailure() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var loads = 0;
  var pending = [];
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-a', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-b' })
  );
  var episode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-e9', type: 'episode', seasonIndex: 9, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', primary: true }
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    loadMergedSeasonEpisodes: function (_season, callback) {
      loads += 1;
      pending.push(callback);
      return { abort: function () {} };
    }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', type: 'episode', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', primarySource: true
  }, { returnView: 'library', context: { seasons: [season], episodes: [episode] }, deferMediaProfile: true });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  assert.strictEqual(loads, 1, 'repeated profile-ready notifications must share the same pending season hydration');
  pending.shift()(new Error('temporary external PMS failure'), null);
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  assert.strictEqual(loads, 2, 'a failed shared season hydration must be retryable on the next profile-ready opportunity');
}());

(function testMultiserverSeasonDoesNotExposeFalseEpisodeArrowsWhenExternalCopyIsMissing() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var mergedLoads = 0;
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var primaryEpisode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    loadMergedSeasonEpisodes: function (_season, callback) {
      mergedLoads += 1;
      callback(null, [primaryEpisode]);
      return null;
    }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', guid: 'plex://episode/primary-only-s9e1', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', serverName: 'MAIN', primarySource: true
  }, {
    returnView: 'library',
    selectedItem: MultiServerMedia.decorateItem({ ratingKey: 'show-a', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', primary: true }),
    context: { seasons: [season], episodes: [primaryEpisode] },
    deferMediaProfile: true
  });

  assert.strictEqual(harness.mediaControls().choices.versions, false,
    'a multiserver season alone must not make a primary-only episode look cyclable');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'the Version row must reserve arrow space while exact episode ownership is still unknown');
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  assert.strictEqual(mergedLoads, 1, 'episode ownership must still hydrate once after the current profile/ASS priority point');
  assert.strictEqual(harness.mediaControls().choices.versions, false,
    'an episode confirmed to be missing on the external PMS must remain non-cyclable');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'a confirmed primary-only episode may keep invisible reserved arrow space to avoid layout flash');
}());

(function testVersionBrowserLazilyRecoversMergedEpisodeFromCurrentSeason() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var mergedLoads = 0;
  var loadedProfiles = [];
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/lazy-versions', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'show-b', guid: 'plex://show/lazy-versions', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var primaryEpisode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }
  );
  var mergedEpisode = MultiServerMedia.mergeSourceVariants(
    primaryEpisode,
    MultiServerMedia.decorateItem({ ratingKey: 'b-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    loadMergedSeasonEpisodes: function (requestedSeason, callback) {
      mergedLoads += 1;
      assert.strictEqual(requestedSeason.ratingKey, 'a-s9');
      callback(null, [mergedEpisode, MultiServerMedia.mergeSourceVariants(
        MultiServerMedia.decorateItem({ ratingKey: 'a-next', type: 'episode', seasonIndex: 9, episodeIndex: 2 }, { serverMachineIdentifier: 'server-a', primary: true }),
        MultiServerMedia.decorateItem({ ratingKey: 'b-next', type: 'episode', seasonIndex: 9, episodeIndex: 2 }, { serverMachineIdentifier: 'server-b' })
      )]);
      return null;
    },
    loadMediaProfile: function (_config, ratingKey, callback) {
      loadedProfiles.push(String(ratingKey));
      callback(null, profile);
      return null;
    }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', guid: 'plex://episode/lazy-s9e1', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', serverName: 'MAIN', primarySource: true
  }, {
    returnView: 'library',
    selectedItem: show,
    context: { seasons: [season], episodes: [primaryEpisode,
      MultiServerMedia.decorateItem({ ratingKey: 'a-next', type: 'episode', seasonIndex: 9, episodeIndex: 2 }, { serverMachineIdentifier: 'server-a', primary: true })] }
  });

  assert.strictEqual(harness.mediaControls().choices.versions, false,
    'a multiserver season must not expose Version cycling before its batch episode ownership is hydrated');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'a multiserver season must reserve Version arrow space while batch episode ownership is hydrated');
  assert.strictEqual(mergedLoads, 0, 'opening a multiserver season must leave speculative ownership hydration behind the current media profile');
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  assert.strictEqual(mergedLoads, 1, 'the ready current media profile must then trigger one batch hydration for the visible season');
  harness.controllerOptions().openVersionDetails();
  assert.strictEqual(mergedLoads, 1, 'opening Version must reuse the batch season hydration');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[1].sourceVariants.length, 2,
    'season recovery must retain both PMS copies for unopened episodes too');
  harness.feature.snapshot().seriesContext.seasons[0].sourceVariants = [season.sourceVariants[0]];
  harness.feature.snapshot().seriesContext.episodes[1].sourceVariants = [harness.feature.snapshot().seriesContext.episodes[1].sourceVariants[0]];
  harness.controller.setCurrentDetail({ ratingKey: 'a-next', type: 'episode', seasonIndex: 9, episodeIndex: 2, serverMachineIdentifier: 'server-a' });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-next' });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'an episode already confirmed multi-source in this session must stay cyclable across a transient context replacement');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'a confirmed multi-source episode must keep the Version arrow layout reserved');
  assert.strictEqual(mergedLoads, 1, 'moving to another episode must reuse recovered season ownership');
  harness.controller.setCurrentDetail(mergedEpisode);
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-e9' });
  harness.controller.setCurrentDetail({ ratingKey: 'a-unresolved', type: 'episode', seasonIndex: 9, episodeIndex: 3, serverMachineIdentifier: 'server-a' });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: true, mediaProfileRatingKey: 'a-unresolved' });
  assert.strictEqual(harness.mediaControls().choices.versions, false,
    'resetting per-episode version profiles must not expose cycling for an unresolved next episode');
  assert.strictEqual(harness.mediaControls().choices.versionCycleReserved, true,
    'resetting per-episode version profiles must preserve reserved arrow space from session season knowledge');
  assert.ok(loadedProfiles.indexOf('b-e9') !== -1, 'lazy episode recovery must load the alternate PMS media profile');
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.some(function (choice) {
    return String(choice.value).indexOf('server-b') !== -1 && String(choice.label).indexOf('(NUC LUCA)') !== -1;
  }), 'lazy episode recovery must expose the external PMS in the Version browser');
}());

(function testVersionBrowserCanRebuildMergedSeasonFromAggregatedShow() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var contextLoads = 0;
  var seasonLoads = 0;
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/rebuild-s9', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'show-b', guid: 'plex://show/rebuild-s9', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var primarySeason = MultiServerMedia.decorateItem({ ratingKey: 'a-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true });
  var mergedSeason = MultiServerMedia.mergeSourceVariants(
    primarySeason,
    MultiServerMedia.decorateItem({ ratingKey: 'b-s9', type: 'season', index: 9, seasonNumber: 9 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var primaryEpisode = MultiServerMedia.decorateItem({ ratingKey: 'a-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true });
  var mergedEpisode = MultiServerMedia.mergeSourceVariants(
    primaryEpisode,
    MultiServerMedia.decorateItem({ ratingKey: 'b-e9', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1 }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    loadMergedSeriesContext: function (_item, callback) {
      contextLoads += 1;
      callback(null, { seasons: [mergedSeason], episodes: [] });
      return null;
    },
    loadMergedSeasonEpisodes: function (_season, callback) {
      seasonLoads += 1;
      callback(null, [mergedEpisode]);
      return null;
    },
    loadMediaProfile: function (_config, _ratingKey, callback) { callback(null, profile); return null; }
  });

  harness.feature.openLoaded({
    ratingKey: 'a-e9', guid: 'plex://episode/rebuild-s9e1', type: 'episode', title: 'Episode 1', seasonIndex: 9, episodeIndex: 1,
    serverMachineIdentifier: 'server-a', serverName: 'MAIN', primarySource: true
  }, {
    returnView: 'library',
    selectedItem: show,
    context: { seasons: [primarySeason], episodes: [primaryEpisode] }
  });

  harness.controllerOptions().openVersionDetails();
  assert.strictEqual(contextLoads, 1, 'an aggregated show must rebuild its merged season map when the active season lost alternate PMS ownership');
  assert.strictEqual(seasonLoads, 1, 'the rebuilt matching season must then fan out its episodes across PMSes');
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.some(function (choice) { return String(choice.value).indexOf('server-b') !== -1; }),
    'rebuilding the aggregated show must recover the external PMS version for the active episode');
}());

(function testPrimaryOnlyEpisodeDoesNotBorrowParentShowVariants() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var loadedProfiles = [];
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile,
    loadEpisodeDetail: function (episode, callback) {
      callback(null, {
        ratingKey: episode.ratingKey,
        guid: episode.guid,
        type: 'episode',
        title: episode.title,
        seasonIndex: episode.seasonIndex,
        episodeIndex: episode.episodeIndex
      });
      return null;
    },
    loadMediaProfile: function (_config, ratingKey, callback) {
      loadedProfiles.push(String(ratingKey));
      callback(null, profile);
      return null;
    }
  });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/primary-only-episode', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'show-b', guid: 'plex://show/primary-only-episode', type: 'show', title: 'Merged' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' })
  );
  var episode = MultiServerMedia.decorateItem(
    { ratingKey: 'a-only', guid: 'plex://episode/primary-only', type: 'episode', title: 'Episode only on primary', seasonIndex: 8, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', serverName: 'MAIN', primary: true }
  );

  harness.feature.openLoaded({ ratingKey: 'show-a', guid: 'plex://show/primary-only-episode', type: 'show', title: 'Merged' }, {
    returnView: 'library',
    selectedItem: show,
    context: { seasons: [{ ratingKey: 'a-s8', index: 8, seasonNumber: 8 }], episodes: [episode] }
  });
  harness.controllerOptions().openVersionDetails();

  assert.strictEqual(loadedProfiles.indexOf('show-b'), -1,
    'an episode that exists only on the primary PMS must not load the parent show as an alternate media version');
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.every(function (choice) { return String(choice.value).indexOf('server-b') === -1; }),
    'a primary-only episode must not expose phantom external PMS version choices');
}());

(function testExternalVersionLabelShowsSourceServer() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'MAIN', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var profile = { summary: '1080p - MKV - 208MB', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  profile.versions = [profile];
  var detail = MultiServerMedia.decorateItem({ ratingKey: 'b-movie', guid: 'plex://movie/external', type: 'movie', title: 'External' }, { serverMachineIdentifier: 'server-b', serverName: 'NUC LUCA' });
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: profile
  });

  harness.feature.openLoaded(detail, { returnView: 'library', selectedItem: detail, skipSeriesLoad: true, deferMediaProfile: true });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'b-movie' });
  assert.ok(String(harness.mediaControls().values.version).indexOf('(NUC LUCA)') !== -1,
    'the compact Version row must identify an external PMS copy');
  harness.controllerOptions().openVersionDetails();
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser && browser[1].choices.every(function (choice) { return String(choice.label).indexOf('(NUC LUCA)') !== -1; }),
    'all version browser rows from an external PMS must identify that server');
}());

(function testAggregatedDetailHonorsPersistedSourceBeforeMetadataLoad() {
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  MediaSourcePreference.create({ storage: storage }).set('plex://movie/same', 'server-b');
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://primary.example', token: 'primary-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://primary.example', token: 'primary-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://secondary.example', token: 'secondary-token' }; }
        return null;
      }
    }
  });
  var harness = createHarness({ storage: storage, sourceRouter: sourceRouter, config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' } });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-42', guid: 'plex://movie/same', type: 'movie' }, { serverMachineIdentifier: 'server-a', primary: true });
  var secondary = MultiServerMedia.decorateItem({ ratingKey: 'b-77', guid: 'plex://movie/same', type: 'movie' }, { serverMachineIdentifier: 'server-b' });
  var item = MultiServerMedia.mergeSourceVariants(primary, secondary);
  var load;

  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true, 'aggregated item should open');
  load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; })[0];
  assert.ok(load, 'opening aggregated media must start metadata request');
  assert.strictEqual(load.ratingKey, 'b-77', 'persisted source must choose the matching PMS copy before metadata load');
  assert.strictEqual(load.config.apiBaseUrl, 'https://secondary.example', 'preferred source metadata must use preferred PMS transport');
})();


(function testAggregatedMovieVersionBrowserLoadsAlternateSourcesLazilyAndPersistsSelection() {
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Mac M4', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var primaryProfile = { summary: '2160p HEVC', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  primaryProfile.versions = [primaryProfile];
  var secondaryProfile = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  secondaryProfile.versions = [secondaryProfile];
  var harness = createHarness({
    storage: storage,
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: primaryProfile,
    loadMediaProfile: function (_config, ratingKey, callback) {
      callback(null, ratingKey === 'b-77' ? secondaryProfile : primaryProfile);
      return null;
    }
  });
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-42', guid: 'plex://movie/same', type: 'movie', title: 'Same' }, { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-77', guid: 'plex://movie/same', type: 'movie', title: 'Same' }, { serverMachineIdentifier: 'server-b', serverName: 'Mac M4' })
  );
  harness.feature.openLoaded(item, { returnView: 'library', selectedItem: item, skipSeriesLoad: true });
  harness.controllerOptions().openVersionDetails();
  var browser = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop();
  assert.ok(browser, 'aggregated media must use the shared version browser');
  assert.ok(browser[1].choices.some(function (choice) { return String(choice.label).indexOf('(Mac M4)') !== -1; }), 'alternate PMS must be represented lazily in version choices');
  assert.ok(browser[1].choices.filter(function (choice) { return String(choice.value).indexOf('server-a') !== -1; }).every(function (choice) {
    return String(choice.label).indexOf('(LUCA-NUC)') === -1;
  }), 'primary PMS versions must remain uncluttered by a source suffix');
  var secondaryChoice = browser[1].choices.filter(function (choice) { return String(choice.value).indexOf('server-b') !== -1; })[0];
  assert.ok(secondaryChoice, 'secondary PMS choice must be addressable');
  browser[1].apply(secondaryChoice);
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://movie/same'), 'server-b', 'explicit source choice must persist only the PMS identity');
  var lastLoad = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.strictEqual(lastLoad.ratingKey, 'b-77', 'switching source must reload Detail from the selected PMS copy');
  assert.strictEqual(lastLoad.config.apiBaseUrl, 'https://b.example');
}());



(function testAggregatedDetailPrefetchesAlternateVersionsAndEnablesArrows() {
  var secondaryCallback = null;
  var order = [];
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Mac M4', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var primaryProfile = { summary: '2160p HEVC', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  primaryProfile.versions = [primaryProfile];
  var secondaryProfile = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  secondaryProfile.versions = [secondaryProfile];
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: primaryProfile,
    onAssPrefetchCandidate: function () { order.push('ass'); },
    loadMediaProfile: function (_config, ratingKey, callback) {
      if (ratingKey === 'b-77') { order.push('external-profile'); secondaryCallback = callback; return null; }
      callback(null, primaryProfile);
      return null;
    }
  });
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-42', guid: 'plex://movie/lazy', type: 'movie', title: 'Lazy' }, { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-77', guid: 'plex://movie/lazy', type: 'movie', title: 'Lazy' }, { serverMachineIdentifier: 'server-b', serverName: 'Mac M4' })
  );

  harness.feature.openLoaded(item, { returnView: 'library', selectedItem: item, skipSeriesLoad: true });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-42' });

  assert.ok(secondaryCallback, 'Detail must start loading alternate PMS media profiles as soon as the current media profile is ready');
  assert.deepStrictEqual(order.slice(0, 2), ['ass', 'external-profile'],
    'the current episode ASS prefetch candidate must be dispatched before speculative alternate-PMS profile loading');
  assert.strictEqual(harness.mediaControls().choices.versions, true, 'known routeable PMS copies enable arrows before technical profiles arrive');
  secondaryCallback(null, secondaryProfile);
  assert.strictEqual(harness.mediaControls().choices.versions, true, 'an alternate PMS version must make the compact Version row cyclable without opening the browser');
}());

(function testAggregatedVersionArrowCyclesAcrossPms() {
  var secondaryCallback = null;
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Mac M4', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var primaryProfile = { summary: '2160p HEVC', mediaIndex: 0, partIndex: 0, audioTracks: [{ id: 'a-en', label: 'English' }], subtitleTracks: [{ id: 's-en', label: 'English CC' }] };
  primaryProfile.versions = [primaryProfile];
  var secondaryProfile = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [{ id: 'a-ja', label: 'Japanese' }], subtitleTracks: [{ id: 's-it', label: 'Italiano' }] };
  secondaryProfile.versions = [secondaryProfile];
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    preferenceProfile: primaryProfile,
    MediaPreferences: {
      resolve: function (playback) { return { audioTrack: playback.audioTracks[0] || null, subtitleTrack: playback.subtitleTracks[0] || null }; }
    },
    MediaProfile: {
      choiceState: function () { return { audio: false, subtitles: false, versions: false }; },
      trackDisplayLabel: function (track) { return track && track.label || ''; }
    },
    loadMediaProfile: function (_config, ratingKey, callback) {
      if (ratingKey === 'b-77') { secondaryCallback = callback; return null; }
      callback(null, primaryProfile);
      return null;
    }
  });
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-42', guid: 'plex://movie/cycle', type: 'movie', title: 'Cycle' }, { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'b-77', guid: 'plex://movie/cycle', type: 'movie', title: 'Cycle' }, { serverMachineIdentifier: 'server-b', serverName: 'Mac M4' })
  );

  harness.feature.openLoaded(item, { returnView: 'library', selectedItem: item, skipSeriesLoad: true });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'a-42' });
  harness.controllerOptions().onFocusChanged({ zone: 'version' }, 'cycle-version-right');

  var lastLoad = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(lastLoad, 'cycling Version right must be able to select an alternate PMS copy');
  assert.strictEqual(lastLoad.ratingKey, 'b-77', 'the compact Version arrows must traverse the unified server x version list');
  assert.strictEqual(lastLoad.config.apiBaseUrl, 'https://b.example', 'cross-PMS version cycling must route metadata through the selected PMS');
  secondaryCallback(null, secondaryProfile);

  harness.preference.snapshot = function () { return { profile: secondaryProfile, override: null, identity: 'id' }; };
  harness.preference.selectedProfile = function () { return secondaryProfile; };
  harness.preference.versions = function () { return [secondaryProfile]; };
  harness.resolveMetadata(null, { ratingKey: 'b-77', guid: 'plex://movie/cycle', type: 'movie', title: 'Cycle' });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'b-77' });
  assert.ok(String(harness.mediaControls().values.audio).indexOf('Japanese') !== -1, 'cross-PMS version cycling must refresh audio choices from the selected version profile');
  assert.ok(String(harness.mediaControls().values.subtitles).indexOf('Italiano') !== -1, 'cross-PMS version cycling must refresh subtitle choices from the selected version profile');
}());

(function testSeasonBatchProfilesAvoidPerEpisodePrefetch() {
  var requests = [];
  var router = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'a', apiBaseUrl: 'https://a.example', primary: true }; },
      contextForMachine: function (machine) { return { serverMachineIdentifier: machine, apiBaseUrl: 'https://' + machine + '.example', primary: machine === 'a' }; }
    }
  });
  var profileA = { ratingKey: 'e1', mediaIndex: 0, partIndex: 0, container: 'MKV', resolution: '1080p', audioTracks: [], subtitleTracks: [] };
  var profileB = { ratingKey: 'e1', mediaIndex: 0, partIndex: 0, container: 'MP4', resolution: '720p', audioTracks: [], subtitleTracks: [] };
  function episode(number) {
    return MultiServerMedia.mergeSourceVariants(
      MultiServerMedia.decorateItem({ ratingKey: 'e' + number, guid: 'plex://episode/' + number, type: 'episode', episodeIndex: number, mediaProfile: profileA }, { serverMachineIdentifier: 'a', primary: true }),
      MultiServerMedia.decorateItem({ ratingKey: 'e' + number, guid: 'plex://episode/' + number, type: 'episode', episodeIndex: number, mediaProfile: profileB }, { serverMachineIdentifier: 'b' })
    );
  }
  var h = createHarness({
    sourceRouter: router,
    preferenceProfile: profileA,
    loadMediaProfile: function (config, key, done) {
      var request = { config: config, key: key, done: done, aborted: false };
      requests.push(request);
      return { abort: function () { request.aborted = true; } };
    }
  });
  h.feature.openLoaded(episode(1), {
    returnView: 'library',
    context: { seasons: [{ ratingKey: 's1', serverMachineIdentifier: 'a' }, { ratingKey: 's2', serverMachineIdentifier: 'a' }], episodes: [episode(1), episode(2), episode(3)] }
  });
  assert.strictEqual(requests.length, 0, 'opening a season must not issue one media-profile request per episode');
  h.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: 'e1' });
  assert.strictEqual(h.mediaControls().choices.versions, true, 'batch profiles and source ownership must expose version arrows immediately');
  var delivered = null;
  h.controllerOptions().loadMediaProfile('e1', function (error, result) { assert.ifError(error); delivered = result; });
  assert.strictEqual(delivered, profileA, 'foreground profile access must reuse the lightweight batch profile');
  assert.strictEqual(requests.length, 0, 'batch cache reuse must not create a duplicate metadata request');
}());

(function testAggregatedShowExposesSourceChoiceWithoutPlayableProfile() {
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Mac M4', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var harness = createHarness({ storage: storage, sourceRouter: sourceRouter, config: { apiBaseUrl: 'https://a.example', token: 'a-token' } });
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'show-a', guid: 'plex://show/same', type: 'show', title: 'Same Show' }, { serverMachineIdentifier: 'server-a', serverName: 'LUCA-NUC', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'show-b', guid: 'plex://show/same', type: 'show', title: 'Same Show' }, { serverMachineIdentifier: 'server-b', serverName: 'Mac M4' })
  );
  harness.preference.selectedProfile = function () { return null; };
  harness.preference.versions = function () { return []; };
  harness.feature.openLoaded(item, { returnView: 'library', selectedItem: item, skipSeriesLoad: true });
  harness.controllerOptions().openVersionDetails();
  var dialog = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).pop();
  assert.ok(dialog, 'aggregated shows must expose a source choice even without a playable media profile');
  assert.strictEqual(dialog[1].title, 'detail.source');
  assert.ok(dialog[1].choices.some(function (choice) { return choice.label === 'Mac M4'; }));
  var secondary = dialog[1].choices.filter(function (choice) { return choice.value === 'server-b'; })[0];
  dialog[1].apply(secondary);
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://show/same'), 'server-b');
  var lastLoad = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.strictEqual(lastLoad.ratingKey, 'show-b');
  assert.strictEqual(lastLoad.config.apiBaseUrl, 'https://b.example');
}());


(function testSeriesSourcePreferenceAppliesToMergedEpisodeChildren() {
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  MediaSourcePreference.create({ storage: storage }).set('plex://show/same', 'server-b');
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var harness = createHarness({ storage: storage, sourceRouter: sourceRouter, config: { apiBaseUrl: 'https://a.example', token: 'a-token' } });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-e3', guid: 'plex://episode/e3', sourcePreferenceGuid: 'plex://show/same', type: 'episode' }, { serverMachineIdentifier: 'server-a', primary: true });
  var secondary = MultiServerMedia.decorateItem({ ratingKey: 'b-e3', guid: 'plex://episode/e3', sourcePreferenceGuid: 'plex://show/same', type: 'episode' }, { serverMachineIdentifier: 'server-b' });
  var item = MultiServerMedia.mergeSourceVariants(primary, secondary);
  assert.strictEqual(harness.feature.open(item, { returnView: 'detail' }), true);
  var load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; })[0];
  assert.strictEqual(load.ratingKey, 'b-e3', 'episode must inherit the persisted source preference of its parent series');
  assert.strictEqual(load.config.apiBaseUrl, 'https://b.example');
}());


(function testDisabledCanonicalSourceFallsBackToActiveVariantWithoutSavedPreference() {
  var enabledServers = { 'server-a': true, 'server-b': false };
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      },
      serverEnabled: function (machine) { return enabledServers[machine] !== false; }
    }
  });
  var harness = createHarness({
    currentView: 'library',
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    loadMediaProfile: function (_config, ratingKey, callback) {
      callback(null, { summary: '1080p', mediaIndex: 0, partIndex: 0, width: 1920, height: 1080, audioTracks: [], subtitleTracks: [], versions: [] });
      return null;
    }
  });
  var active = MultiServerMedia.decorateItem({ ratingKey: 'a-stale', guid: 'plex://movie/stale-owner', type: 'movie' }, { serverMachineIdentifier: 'server-a', primary: true });
  var disabledCanonical = MultiServerMedia.decorateItem({ ratingKey: 'b-stale', guid: 'plex://movie/stale-owner', type: 'movie' }, { serverMachineIdentifier: 'server-b' });
  var item = MultiServerMedia.mergeSourceVariants(disabledCanonical, active);
  var openLoad;
  var playLoad;

  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true,
    'a stale aggregated card must remain openable when its canonical PMS is disabled but another variant is active');
  openLoad = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(openLoad, 'opening a stale aggregated card must continue into metadata loading');
  assert.strictEqual(openLoad.ratingKey, 'a-stale', 'Detail open must rebase to the active PMS variant');
  assert.strictEqual(openLoad.config.apiBaseUrl, 'https://a.example');

  harness.requestConfigs.length = 0;
  assert.strictEqual(harness.feature.playItem(item, {}), true,
    'direct play must also rebase a stale aggregated card to an active PMS variant');
  playLoad = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(playLoad, 'direct play fallback must continue into metadata loading');
  assert.strictEqual(playLoad.ratingKey, 'a-stale', 'direct play must load metadata from the active PMS variant');
  assert.strictEqual(playLoad.config.apiBaseUrl, 'https://a.example');
}());


(function testOfflinePreferredSourceFallsBackThroughExistingVersionAndLanguageResolversWithoutOverwritingPreference() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  MediaSourcePreference.create({ storage: storage }).set('plex://movie/fallback', 'server-b');
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-c') { return { serverMachineIdentifier: 'server-c', serverName: 'Fallback 4K', apiBaseUrl: 'https://c.example', token: 'c-token' }; }
        return null;
      }
    }
  });
  function profile(width, height, languageCode) {
    var value = {
      summary: height + 'p H264', mediaIndex: 0, partIndex: 0, width: width, height: height,
      videoCodec: 'h264', container: 'mp4', bitrate: width,
      audioTracks: [{ id: 'audio-' + languageCode, languageCode: languageCode }], subtitleTracks: []
    };
    value.versions = [value];
    return value;
  }
  var profiles = { 'a-1': profile(1920, 1080, 'en'), 'c-1': profile(3840, 2160, 'it') };
  var harness = createHarness({
    storage: storage,
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    MediaPreferences: MediaPreferences,
    VersionSelection: VersionSelection,
    settings: { playbackMode: 'auto', videoVersionPriorities: ['resolution', 'directPlay'], audioLanguages: ['it'], subtitleLanguages: ['it'], subtitleMode: 'audio-mismatch', subtitleSuppressedForAudio: ['it'] },
    loadMediaProfile: function (_config, ratingKey, callback) { callback(null, profiles[ratingKey] || null); return null; }
  });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-1', guid: 'plex://movie/fallback', type: 'movie' }, { serverMachineIdentifier: 'server-a', serverName: 'Primary', primary: true });
  var preferredOffline = MultiServerMedia.decorateItem({ ratingKey: 'b-1', guid: 'plex://movie/fallback', type: 'movie' }, { serverMachineIdentifier: 'server-b', serverName: 'Offline Preferred' });
  var bestFallback = MultiServerMedia.decorateItem({ ratingKey: 'c-1', guid: 'plex://movie/fallback', type: 'movie' }, { serverMachineIdentifier: 'server-c', serverName: 'Fallback 4K' });
  var item = MultiServerMedia.mergeSourceVariants(MultiServerMedia.mergeSourceVariants(primary, preferredOffline), bestFallback);

  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true);
  var load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(load, 'fallback resolution must continue into metadata loading');
  assert.strictEqual(load.ratingKey, 'c-1', 'offline preferred PMS must fall back using the existing automatic version priorities, not primary-first order');
  assert.strictEqual(load.config.apiBaseUrl, 'https://c.example');
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://movie/fallback'), 'server-b', 'temporary fallback must not overwrite the persisted PMS preference');
}());

(function testPreferredSourceReturnsAfterServerIsReenabled() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var guid = 'plex://movie/preference-reenable';
  var preference = MediaSourcePreference.create({ storage: storage });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-reenable', guid: guid, type: 'movie' }, { serverMachineIdentifier: 'server-a', primary: true });
  var preferred = MultiServerMedia.decorateItem({ ratingKey: 'b-reenable', guid: guid, type: 'movie' }, { serverMachineIdentifier: 'server-b' });
  var item = MultiServerMedia.mergeSourceVariants(primary, preferred);
  function profile() {
    var value = {
      summary: '1080p H264', mediaIndex: 0, partIndex: 0, width: 1920, height: 1080,
      videoCodec: 'h264', container: 'mp4', bitrate: 5000,
      audioTracks: [], subtitleTracks: []
    };
    value.versions = [value];
    return value;
  }
  function router(serverBEnabled) {
    return PlexSourceRouter.create({
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sources: {
        primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
        serverEnabled: function (machine) { return machine !== 'server-b' || serverBEnabled; },
        contextForMachine: function (machine) {
          if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
          if (machine === 'server-b' && serverBEnabled) { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
          return null;
        }
      }
    });
  }
  function harness(serverBEnabled) {
    return createHarness({
      storage: storage,
      sourceRouter: router(serverBEnabled),
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      MediaPreferences: MediaPreferences,
      VersionSelection: VersionSelection,
      settings: { playbackMode: 'auto', videoVersionPriorities: ['resolution', 'directPlay'], audioLanguages: [], subtitleLanguages: [] },
      loadMediaProfile: function (_config, _ratingKey, callback) { callback(null, profile()); return null; }
    });
  }
  var disabledHarness;
  var enabledHarness;
  var load;
  preference.set(guid, 'server-b');

  disabledHarness = harness(false);
  assert.strictEqual(disabledHarness.feature.open(item, { returnView: 'library' }), true);
  load = disabledHarness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.strictEqual(load.ratingKey, 'a-reenable', 'disabled preferred PMS must temporarily fall back to the active copy');
  assert.strictEqual(preference.get(guid), 'server-b', 'temporary fallback must preserve the saved PMS preference');

  enabledHarness = harness(true);
  assert.strictEqual(enabledHarness.feature.open(item, { returnView: 'library' }), true);
  load = enabledHarness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.strictEqual(load.ratingKey, 'b-reenable', 'reenabling the preferred PMS must make the saved source preference effective again');
  assert.strictEqual(load.config.apiBaseUrl, 'https://b.example');
  assert.strictEqual(preference.get(guid), 'server-b');
}());



(function testOfflinePreferredSourceFallbackHonorsAudioLanguageBeforeVideoQuality() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  MediaSourcePreference.create({ storage: storage }).set('plex://movie/audio-fallback', 'server-b');
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-c') { return { serverMachineIdentifier: 'server-c', apiBaseUrl: 'https://c.example', token: 'c-token' }; }
        return null;
      }
    }
  });
  function profile(width, height, languageCode) {
    var value = {
      summary: height + 'p H264', mediaIndex: 0, partIndex: 0, width: width, height: height,
      videoCodec: 'h264', container: 'mp4', bitrate: width,
      audioTracks: [{ id: 'audio-' + languageCode, languageCode: languageCode }], subtitleTracks: []
    };
    value.versions = [value];
    return value;
  }
  var profiles = { 'a-audio': profile(3840, 2160, 'ja'), 'c-audio': profile(1920, 1080, 'it') };
  var harness = createHarness({
    storage: storage,
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    MediaPreferences: MediaPreferences,
    VersionSelection: VersionSelection,
    settings: { playbackMode: 'auto', videoVersionPriorities: ['resolution', 'directPlay'], audioLanguages: ['it', 'ja'], subtitleLanguages: [], subtitleMode: 'off', subtitleSuppressedForAudio: [] },
    loadMediaProfile: function (_config, ratingKey, callback) { callback(null, profiles[ratingKey] || null); return null; }
  });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-audio', guid: 'plex://movie/audio-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-a', primary: true });
  var preferredOffline = MultiServerMedia.decorateItem({ ratingKey: 'b-audio', guid: 'plex://movie/audio-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-b' });
  var languageMatch = MultiServerMedia.decorateItem({ ratingKey: 'c-audio', guid: 'plex://movie/audio-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-c' });
  var item = MultiServerMedia.mergeSourceVariants(MultiServerMedia.mergeSourceVariants(primary, preferredOffline), languageMatch);

  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true);
  var load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(load, 'fallback resolution must continue into metadata loading');
  assert.strictEqual(load.ratingKey, 'c-audio', 'fallback source selection must honor existing audio-language priorities before video quality');
  assert.strictEqual(load.config.apiBaseUrl, 'https://c.example');
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://movie/audio-fallback'), 'server-b', 'language-aware fallback must not overwrite the persisted PMS preference');
}());



(function testOfflinePreferredSourceFallbackHonorsSubtitleLanguageBeforeVideoQuality() {
  var MediaPreferences = require('../app/media-preferences');
  var VersionSelection = require('../app/version-selection');
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  MediaSourcePreference.create({ storage: storage }).set('plex://movie/subtitle-fallback', 'server-b');
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-c') { return { serverMachineIdentifier: 'server-c', apiBaseUrl: 'https://c.example', token: 'c-token' }; }
        return null;
      }
    }
  });
  function profile(width, height, subtitleLanguage) {
    var value = {
      summary: height + 'p H264', mediaIndex: 0, partIndex: 0, width: width, height: height,
      videoCodec: 'h264', container: 'mp4', bitrate: width,
      audioTracks: [{ id: 'audio-ja', languageCode: 'ja' }],
      subtitleTracks: [{ id: 'sub-' + subtitleLanguage, languageCode: subtitleLanguage, external: true, key: '/sub/' + subtitleLanguage }]
    };
    value.versions = [value];
    return value;
  }
  var profiles = { 'a-sub': profile(3840, 2160, 'en'), 'c-sub': profile(1920, 1080, 'it') };
  var harness = createHarness({
    storage: storage,
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    MediaPreferences: MediaPreferences,
    VersionSelection: VersionSelection,
    settings: { playbackMode: 'auto', videoVersionPriorities: ['resolution', 'directPlay'], audioLanguages: ['ja'], subtitleLanguages: ['it', 'en'], subtitleMode: 'always', subtitleSourcePreference: 'external', subtitleSuppressedForAudio: [] },
    loadMediaProfile: function (_config, ratingKey, callback) { callback(null, profiles[ratingKey] || null); return null; }
  });
  var primary = MultiServerMedia.decorateItem({ ratingKey: 'a-sub', guid: 'plex://movie/subtitle-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-a', primary: true });
  var preferredOffline = MultiServerMedia.decorateItem({ ratingKey: 'b-sub', guid: 'plex://movie/subtitle-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-b' });
  var subtitleMatch = MultiServerMedia.decorateItem({ ratingKey: 'c-sub', guid: 'plex://movie/subtitle-fallback', type: 'movie' }, { serverMachineIdentifier: 'server-c' });
  var item = MultiServerMedia.mergeSourceVariants(MultiServerMedia.mergeSourceVariants(primary, preferredOffline), subtitleMatch);

  assert.strictEqual(harness.feature.open(item, { returnView: 'library' }), true);
  var load = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).pop();
  assert.ok(load, 'fallback resolution must continue into metadata loading');
  assert.strictEqual(load.ratingKey, 'c-sub', 'fallback source selection must honor existing subtitle-language priorities before video quality');
  assert.strictEqual(load.config.apiBaseUrl, 'https://c.example');
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://movie/subtitle-fallback'), 'server-b', 'subtitle-aware fallback must not overwrite the persisted PMS preference');
}());


(function testDeferredSeasonWatchedKeepsOriginalSourceOwnership() {
  var harness = createHarness();
  var sourceA = {
    sourceId: 'server-a|4',
    serverMachineIdentifier: 'server-a',
    serverName: 'Alpha',
    apiBaseUrl: 'https://a.example',
    token: 'a-token'
  };
  var sourceB = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Beta',
    apiBaseUrl: 'https://b.example',
    token: 'b-token'
  };
  var detailA = { ratingKey: 'episode-1', type: 'episode', title: 'Episode A', viewed: false };
  var detailB = { ratingKey: 'episode-b', type: 'episode', title: 'Episode B', viewed: false };
  var context = {
    seasons: [{ ratingKey: 'season-1', title: 'Season 1' }],
    episodes: [{ ratingKey: 'episode-1', title: 'Episode A', viewed: false }]
  };
  var menu;
  var confirm;
  var changes;

  harness.setSeasonEpisodes([{ ratingKey: 'episode-1', title: 'Episode A', viewed: false }]);
  harness.deferWatched('episode-1');
  harness.feature.openLoaded(detailA, { returnView: 'library', sourceContext: sourceA, context: context });
  harness.controllerOptions().openDetailOptions();
  menu = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[0][1];
  menu.apply(menu.choices.filter(function (choice) { return choice.value === 'season-watched'; })[0]);
  confirm = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; })[1][1];
  confirm.apply(confirm.choices[0]);

  harness.feature.leave();
  harness.feature.openLoaded(detailB, { returnView: 'library', sourceContext: sourceB, skipSeriesLoad: true });
  harness.resolveWatched('episode-1');

  changes = harness.calls.filter(function (entry) { return entry[0] === 'watchedChangedSource' && entry[1] === 'episode-1'; });
  assert.strictEqual(changes.length, 1, 'a completed remote watched write should still reconcile the affected item');
  assert.strictEqual(changes[0][3] && changes[0][3].serverMachineIdentifier, 'server-a',
    'a deferred watched callback must retain the PMS that owned the write even if Detail has since opened another source');
}());


(function staleDirectPlayIntentCannotResumeAfterLeavingAndReturningToOriginView() {
  var options = { currentView: 'home' };
  var metadataCallback = null;
  options.loadMetadata = function (_config, _ratingKey, callback) {
    metadataCallback = callback;
    return { abort: function () {} };
  };
  var harness = createHarness(options);

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'stale-home-play', type: 'movie', title: 'Stale Home Play' }), true,
    'direct Play must start its metadata resolution from Home');
  assert.ok(metadataCallback, 'direct Play must have an in-flight metadata request for this ownership test');

  options.currentView = 'search';
  if (typeof harness.feature.cancelPendingPlayIntent === 'function') { harness.feature.cancelPendingPlayIntent(); }
  options.currentView = 'home';
  metadataCallback(null, { ratingKey: 'stale-home-play', type: 'movie', title: 'Stale Home Play' });

  assert.strictEqual(harness.calls.some(function (entry) {
    return entry[0] === 'requestPlayback' && entry[1] === 'stale-home-play';
  }), false, 'a direct Play callback owned by an earlier Home visit must not resume after the user leaves and later returns to Home');
}());


(function newerDirectPlaySupersedesOlderMetadataResolution() {
  var options = { currentView: 'home' };
  var callbacks = {};
  options.loadMetadata = function (_config, ratingKey, callback) {
    callbacks[ratingKey] = callback;
    return { abort: function () {} };
  };
  var harness = createHarness(options);

  assert.strictEqual(harness.feature.playItem({ ratingKey: 'old-play', type: 'movie', title: 'Old' }), true);
  assert.strictEqual(harness.feature.playItem({ ratingKey: 'new-play', type: 'movie', title: 'New' }), true);
  callbacks['old-play'](null, { ratingKey: 'old-play', type: 'movie', title: 'Old' });
  assert.strictEqual(harness.calls.some(function (entry) { return entry[0] === 'requestPlayback' && entry[1] === 'old-play'; }), false,
    'a superseded direct Play metadata callback must not start the older item');
  callbacks['new-play'](null, { ratingKey: 'new-play', type: 'movie', title: 'New' });
  assert.strictEqual(harness.calls.filter(function (entry) { return entry[0] === 'requestPlayback' && entry[1] === 'new-play'; }).length, 1,
    'the newest direct Play intent must still complete exactly once');
}());


(function testLeavingDetailRetiresOpenSourceChoice() {
  var data = {};
  var storage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Secondary', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var harness = createHarness({ storage: storage, sourceRouter: sourceRouter, config: { apiBaseUrl: 'https://a.example', token: 'a-token' } });
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'stale-a', guid: 'plex://movie/stale-choice', type: 'movie', title: 'Stale choice' }, { serverMachineIdentifier: 'server-a', serverName: 'Primary', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'stale-b', guid: 'plex://movie/stale-choice', type: 'movie', title: 'Stale choice' }, { serverMachineIdentifier: 'server-b', serverName: 'Secondary' })
  );
  harness.preference.selectedProfile = function () { return null; };
  harness.preference.versions = function () { return []; };
  harness.feature.openLoaded(item, { returnView: 'home', selectedItem: item, skipSeriesLoad: true });
  harness.controllerOptions().openVersionDetails();
  var dialog = harness.calls.filter(function (entry) { return entry[0] === 'openChoice'; }).pop()[1];
  var secondary = dialog.choices.filter(function (choice) { return choice.value === 'server-b'; })[0];
  var loadsBefore = harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).length;
  harness.feature.leave();
  dialog.apply(secondary);
  assert.strictEqual(MediaSourcePreference.create({ storage: storage }).get('plex://movie/stale-choice'), '', 'a source choice owned by a retired Detail must not persist a PMS preference');
  assert.strictEqual(harness.requestConfigs.filter(function (entry) { return entry.method === 'loadMetadata'; }).length, loadsBefore, 'a source choice owned by a retired Detail must not reopen metadata');
}());


(function testLeavingDetailRetiresOpenVersionBrowser() {
  var first = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var second = { summary: '2160p HEVC', mediaIndex: 1, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var setVersionCalls = [];
  var harness = createHarness({ preferenceProfile: first });
  harness.preference.versions = function () { return [first, second]; };
  harness.preference.selectedProfile = function () { return first; };
  harness.preference.setVersion = function (mediaIndex, partIndex) { setVersionCalls.push([mediaIndex, partIndex]); };
  harness.feature.openLoaded({ ratingKey: 'version-stale', type: 'movie', title: 'Version stale' }, { returnView: 'home' });
  harness.controllerOptions().openVersionDetails();
  var dialog = harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop()[1];
  var secondChoice = dialog.choices.filter(function (choice) { return choice.version && choice.version.mediaIndex === 1; })[0] || dialog.choices[2];
  harness.feature.leave();
  dialog.apply(secondChoice);
  assert.deepStrictEqual(setVersionCalls, [], 'a version browser owned by a retired Detail must not mutate version preference');
}());

(function testEpisodeTraversalRetainsSeasonVariantsAndCompletedMetadata() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', serverName: 'Secondary', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var loads = {};
  function mergedEpisode(number) {
    return MultiServerMedia.mergeSourceVariants(
      MultiServerMedia.decorateItem({ ratingKey: 'a-e' + number, type: 'episode', seasonIndex: 9, episodeIndex: number, title: 'Episode ' + number }, { serverMachineIdentifier: 'server-a', primary: true }),
      MultiServerMedia.decorateItem({ ratingKey: 'b-e' + number, type: 'episode', seasonIndex: 9, episodeIndex: number, title: 'Episode ' + number }, { serverMachineIdentifier: 'server-b' })
    );
  }
  var first = mergedEpisode(1);
  var second = mergedEpisode(2);
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    loadEpisodeDetail: function (episode, callback) {
      loads[episode.ratingKey] = Number(loads[episode.ratingKey] || 0) + 1;
      callback(null, {
        ratingKey: episode.ratingKey,
        type: 'episode',
        seasonIndex: 9,
        episodeIndex: episode.episodeIndex,
        title: episode.title
      });
      return null;
    }
  });

  harness.feature.openLoaded(first, {
    returnView: 'library',
    selectedItem: { ratingKey: 'show-a', type: 'show', serverMachineIdentifier: 'server-a' },
    context: { seasons: [{ ratingKey: 'a-s9', type: 'season', seasonNumber: 9 }], episodes: [first, second] }
  });
  harness.controller.selectEpisode(1);
  harness.controllerOptions().playEpisode(second);
  assert.strictEqual(harness.feature.snapshot().currentDetail.sourceVariants.length, 2,
    'episode metadata must merge with the retained season-level PMS ownership');
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'Version arrows must remain cyclable after raw episode metadata replaces the visible detail');
  harness.controller.selectEpisode(0);
  harness.controllerOptions().playEpisode(first);
  harness.controller.selectEpisode(1);
  harness.controllerOptions().playEpisode(second);
  assert.strictEqual(loads['a-e2'], 1,
    'revisiting an episode in the same Detail session must reuse its completed metadata');
}());

(function testEpisodeDetailCacheIsBoundedLruAndScopedToDetailSession() {
  var episodes = [];
  var loads = {};
  var index;
  for (index = 1; index <= 49; index += 1) {
    episodes.push({ ratingKey: 'lru-e' + index, type: 'episode', seasonIndex: 1, episodeIndex: index, title: 'Episode ' + index });
  }
  var harness = createHarness({
    loadEpisodeDetail: function (episode, callback) {
      loads[episode.ratingKey] = Number(loads[episode.ratingKey] || 0) + 1;
      callback(null, Object.assign({}, episode));
      return null;
    }
  });

  harness.feature.openLoaded(episodes[0], {
    returnView: 'library',
    selectedItem: { ratingKey: 'lru-show', type: 'show' },
    context: { seasons: [{ ratingKey: 'lru-s1', type: 'season', seasonNumber: 1 }], episodes: episodes }
  });
  for (index = 1; index < 48; index += 1) {
    harness.controller.selectEpisode(index);
    harness.controllerOptions().playEpisode(episodes[index]);
  }
  harness.controller.selectEpisode(0);
  harness.controllerOptions().playEpisode(episodes[0]);
  harness.controller.selectEpisode(48);
  harness.controllerOptions().playEpisode(episodes[48]);
  harness.controller.selectEpisode(0);
  harness.controllerOptions().playEpisode(episodes[0]);
  harness.controller.selectEpisode(1);
  harness.controllerOptions().playEpisode(episodes[1]);

  assert.strictEqual(Number(loads['lru-e1'] || 0), 0,
    'touching a recent cached episode must keep it resident when the LRU reaches its limit');
  assert.strictEqual(loads['lru-e2'], 2,
    'adding the forty-ninth completed episode must evict the least recently used metadata entry');

  harness.feature.leave();
  harness.feature.openLoaded(episodes[0], {
    returnView: 'library',
    selectedItem: { ratingKey: 'lru-show', type: 'show' },
    context: { seasons: [{ ratingKey: 'lru-s1', type: 'season', seasonNumber: 1 }], episodes: episodes }
  });
  harness.controller.selectEpisode(1);
  harness.controllerOptions().playEpisode(episodes[1]);
  assert.strictEqual(loads['lru-e2'], 3,
    'closing Detail must release the episode metadata cache instead of leaking it into the next session');
}());

(function testPartialSeasonHydrationDoesNotEraseKnownVariants() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var primary = MultiServerMedia.decorateItem(
    { ratingKey: 'invalidate-a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 },
    { serverMachineIdentifier: 'server-a', primary: true }
  );
  var staleMerged = MultiServerMedia.mergeSourceVariants(primary,
    MultiServerMedia.decorateItem(
      { ratingKey: 'invalidate-b-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 },
      { serverMachineIdentifier: 'server-b' }
    ));
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'invalidate-a-s1', type: 'season', seasonNumber: 1 }, { serverMachineIdentifier: 'server-a', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'invalidate-b-s1', type: 'season', seasonNumber: 1 }, { serverMachineIdentifier: 'server-b' })
  );
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    loadMergedSeasonEpisodes: function (_season, callback) {
      callback(null, [primary]);
      return null;
    }
  });

  harness.feature.openLoaded(staleMerged, {
    returnView: 'library',
    selectedItem: { ratingKey: 'invalidate-show', type: 'show', serverMachineIdentifier: 'server-a' },
    context: { seasons: [season], episodes: [primary] },
    deferMediaProfile: true
  });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'the opened detail initially exposes its known external copy');
  harness.controllerOptions().loadSeason();
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: primary.ratingKey });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'a partial merged-season response must not erase a previously known external copy');
  assert.strictEqual((harness.feature.snapshot().currentDetail.sourceVariants || []).length, 2,
    'a partial response must preserve known source ownership in the visible detail');
}());

(function testLateSeasonHydrationFollowsCurrentEpisodeAndSurvivesTraversal() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var season = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'late-a-s2', type: 'season', seasonNumber: 2 }, { serverMachineIdentifier: 'server-a', primary: true }),
    MultiServerMedia.decorateItem({ ratingKey: 'late-b-s2', type: 'season', seasonNumber: 2 }, { serverMachineIdentifier: 'server-b' })
  );
  function primaryEpisode(number) {
    return MultiServerMedia.decorateItem({ ratingKey: 'late-a-e' + number, type: 'episode', seasonIndex: 2, episodeIndex: number }, { serverMachineIdentifier: 'server-a', primary: true });
  }
  function mergedEpisode(number) {
    return MultiServerMedia.mergeSourceVariants(primaryEpisode(number),
      MultiServerMedia.decorateItem({ ratingKey: 'late-b-e' + number, type: 'episode', seasonIndex: 2, episodeIndex: number }, { serverMachineIdentifier: 'server-b' }));
  }
  var first = primaryEpisode(1);
  var second = primaryEpisode(2);
  var pending = null;
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    loadMergedSeasonEpisodes: function (_season, callback) { pending = callback; return { abort: function () {} }; }
  });

  harness.feature.openLoaded(first, {
    returnView: 'library',
    selectedItem: { ratingKey: 'late-show', type: 'show', serverMachineIdentifier: 'server-a' },
    context: { seasons: [season], episodes: [first, second] },
    deferMediaProfile: true
  });
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: first.ratingKey });
  assert.ok(pending, 'season hydration must be pending before the episode changes');

  harness.controller.selectEpisode(1);
  harness.controller.setCurrentDetail(second);
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: second.ratingKey });
  pending(null, [mergedEpisode(1), mergedEpisode(2)]);
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'a season response arriving after E01 -> E02 must hydrate the currently visible E02');
  assert.strictEqual(harness.feature.snapshot().currentDetail.sourceVariants.length, 2,
    'the current episode must receive both known PMS copies from the late season response');

  harness.controller.selectEpisode(0);
  harness.controller.setCurrentDetail(first);
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: first.ratingKey });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'returning to E01 must reuse session ownership without losing Version arrows');
}());

(function testKnownVersionArrowsDoNotFollowTransientServerAvailability() {
  var available = true;
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var secondary = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' };
  var sourceRouter = PlexSourceRouter.create({ config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token }, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : (machine === 'server-b' ? secondary : null); },
    serverAvailable: function (machine) { return machine !== 'server-b' || available; }
  } });
  var episode = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'availability-a', type: 'episode', seasonIndex: 2, episodeIndex: 1 }, primary),
    MultiServerMedia.decorateItem({ ratingKey: 'availability-b', type: 'episode', seasonIndex: 2, episodeIndex: 1 }, secondary)
  );
  var harness = createHarness({ sourceRouter: sourceRouter, config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token } });
  harness.feature.openLoaded(episode, {
    returnView: 'library',
    selectedItem: { ratingKey: 'availability-show', type: 'show', serverMachineIdentifier: 'server-a' },
    context: { seasons: [{ ratingKey: 'availability-s2', type: 'season', seasonNumber: 2, serverMachineIdentifier: 'server-a' }], episodes: [episode] }
  });
  assert.strictEqual(harness.mediaControls().choices.versions, true, 'known copies initially expose Version arrows');
  available = false;
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: episode.ratingKey });
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'temporary loss of the secondary PMS route must not erase known-copy Version arrows');
  available = true;
  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: episode.ratingKey });
  assert.strictEqual(harness.mediaControls().choices.versions, true, 'restoring reachability must not require rediscovering the copy');
}());

console.log('Detail feature controller checks passed');

(function cachedVersionChoicesFollowLiveAvailabilityAndRejectStaleConfirmation() {
  var enabled = true;
  var saved = {};
  var storage = { getItem: function (key) { return saved[key] || null; }, setItem: function (key, value) { saved[key] = String(value); } };
  var a = { serverMachineIdentifier: 'server-a', serverName: 'Primary', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var b = { serverMachineIdentifier: 'server-b', serverName: 'Secondary', apiBaseUrl: 'https://b.example', token: 'b-token' };
  var sourceRouter = PlexSourceRouter.create({ config: { apiBaseUrl: a.apiBaseUrl, token: a.token }, sources: {
    primaryContext: function () { return a; },
    contextForMachine: function (machine) { return machine === 'server-a' ? a : (machine === 'server-b' ? b : null); },
    serverEnabled: function (machine) { return machine !== 'server-b' || enabled; }
  } });
  var profile = { summary: '1080p H264', mediaIndex: 0, partIndex: 0, audioTracks: [], subtitleTracks: [] };
  var harness = createHarness({ storage: storage, sourceRouter: sourceRouter, preferenceProfile: profile,
    loadMediaProfile: function (_config, _ratingKey, callback) { callback(null, profile); return null; } });
  var guid = 'plex://movie/cached-choice';
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-choice', guid: guid, type: 'movie' }, a),
    MultiServerMedia.decorateItem({ ratingKey: 'b-choice', guid: guid, type: 'movie' }, b));
  var preference = MediaSourcePreference.create({ storage: storage });
  preference.set(guid, 'server-a');
  function browser() {
    harness.controllerOptions().openVersionDetails();
    return harness.calls.filter(function (entry) { return entry[0] === 'openMediaVersions'; }).pop()[1];
  }
  function secondaryChoice(value) {
    return value.choices.filter(function (choice) { return choice.sourceMachineIdentifier === 'server-b'; })[0];
  }
  harness.feature.openLoaded(item, { returnView: 'library', selectedItem: item, skipSeriesLoad: true });
  var originalBrowser = browser();
  var choice = secondaryChoice(originalBrowser);
  assert.ok(choice, 'both live sources must initially appear');
  enabled = false;
  originalBrowser.apply(choice);
  assert.strictEqual(preference.get(guid), 'server-a', 'an unavailable explicit choice must not persist a different source or its fallback');
  assert.strictEqual(harness.requestConfigs.some(function (entry) { return entry.method === 'loadMetadata' && entry.ratingKey === 'b-choice'; }), false);
  assert.strictEqual(secondaryChoice(browser()), undefined, 'cached profile rows must not keep a disabled source selectable');
  enabled = true;
  assert.ok(secondaryChoice(browser()), 'reenabling the source must make its cached profile selectable again');
}());

(function offlineDetailWatchedActionDoesNotIssueRequestWithoutRoute() {
  var available = true;
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var secondary = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' };
  var sourceRouter = PlexSourceRouter.create({ config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token }, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : (machine === 'server-b' ? secondary : null); },
    serverAvailable: function (machine) { return machine !== 'server-b' || available; }
  } });
  var harness = createHarness({ sourceRouter: sourceRouter, config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token } });
  var detail = MultiServerMedia.decorateItem({ ratingKey: 'b-offline-action', type: 'movie', title: 'Remote movie', viewed: false }, secondary);
  var metadataError = null;
  var profileError = null;

  harness.feature.openLoaded(detail, { returnView: 'library', selectedItem: detail, sourceContext: secondary, skipSeriesLoad: true });
  available = false;

  assert.strictEqual(harness.controllerOptions().toggleWatched(), false,
    'watched mutation must be rejected when the owning PMS no longer has a live route');
  assert.strictEqual(harness.requestConfigs.some(function (entry) { return entry.method === 'setWatched' && entry.ratingKey === 'b-offline-action'; }), false,
    'offline Detail must never send a watched mutation with a missing PMS config');
  assert.ok(harness.calls.some(function (entry) { return entry[0] === 'message' && entry[1] === 'status.mediaUnavailable'; }),
    'offline Detail mutation must surface media unavailability instead of throwing in PlexClient');

  harness.controllerOptions().loadMetadata(detail.ratingKey, function (error) { metadataError = error || null; }, detail);
  assert.ok(metadataError instanceof Error,
    'Detail metadata loader must fail locally when the owning PMS no longer has a live route');
  assert.strictEqual(harness.requestConfigs.some(function (entry) { return entry.method === 'loadMetadata' && entry.ratingKey === detail.ratingKey; }), false,
    'offline Detail metadata reload must not enter PlexClient with a missing PMS config');

  harness.controllerOptions().loadMediaProfile(detail.ratingKey, function (error) { profileError = error || null; });
  assert.ok(profileError instanceof Error,
    'Detail media-profile loader must fail locally when the owning PMS no longer has a live route');
  assert.strictEqual(harness.requestConfigs.some(function (entry) { return entry.method === 'loadMediaProfile' && entry.ratingKey === detail.ratingKey && !entry.config; }), false,
    'offline Detail media-profile loading must not enter PlexClient with a missing PMS config');
}());

(function testDetailRendersFirstSeriesContextBeforeMergedCompletion() {
  var primary = { serverMachineIdentifier: 'incremental-a', apiBaseUrl: 'https://incremental-a', token: 'a', primary: true };
  var secondary = { serverMachineIdentifier: 'incremental-b', apiBaseUrl: 'https://incremental-b', token: 'b' };
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'incremental-a' ? primary : (machine === 'incremental-b' ? secondary : null); }
  } });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'incremental-show-a', guid: 'plex://show/incremental-detail', type: 'show' }, primary),
    MultiServerMedia.decorateItem({ ratingKey: 'incremental-show-b', guid: 'plex://show/incremental-detail', type: 'show' }, secondary)
  );
  var finalCallback = null;
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: {},
    loadMergedSeriesContext: function (_item, callback, onProgress) {
      finalCallback = callback;
      onProgress({
        seasons: [{ ratingKey: 'incremental-a-s1', type: 'season', seasonNumber: 1, serverMachineIdentifier: 'incremental-a' }],
        episodes: [{ ratingKey: 'incremental-a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'incremental-a' }],
        multiServer: true
      });
      return { abort: function () {} };
    }
  });
  harness.feature.openLoaded(show, { returnView: 'library', selectedItem: show });
  assert.ok(finalCallback, 'the external PMS request must remain in flight after first paint');
  assert.strictEqual(harness.feature.snapshot().seriesContext.seasons.length, 1,
    'the first PMS response must render season navigation without waiting for the external PMS');
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes.length, 1,
    'the first PMS response must render episodes without waiting for the external PMS');

  finalCallback(null, {
    seasons: [MultiServerMedia.mergeSourceVariants(
      MultiServerMedia.decorateItem({ ratingKey: 'incremental-a-s1', type: 'season', seasonNumber: 1 }, primary),
      MultiServerMedia.decorateItem({ ratingKey: 'incremental-b-s1', type: 'season', seasonNumber: 1 }, secondary))],
    episodes: [MultiServerMedia.mergeSourceVariants(
      MultiServerMedia.decorateItem({ ratingKey: 'incremental-a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 }, primary),
      MultiServerMedia.decorateItem({ ratingKey: 'incremental-b-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 }, secondary))],
    multiServer: true
  });
  assert.strictEqual(harness.feature.snapshot().seriesContext.episodes[0].sourceVariants.length, 2,
    'the late external response must enrich the already visible episode in place');
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'late reconciliation must expose the external Version without reopening Detail');
}());

(function testLateMergedContextPrimesSeasonVariantsAfterProfileReady() {
  var primary = { serverMachineIdentifier: 'prime-late-a', apiBaseUrl: 'https://prime-late-a', token: 'a', primary: true };
  var secondary = { serverMachineIdentifier: 'prime-late-b', apiBaseUrl: 'https://prime-late-b', token: 'b' };
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'prime-late-a' ? primary : (machine === 'prime-late-b' ? secondary : null); }
  } });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'prime-late-show-a', guid: 'plex://show/prime-late', type: 'show' }, primary),
    MultiServerMedia.decorateItem({ ratingKey: 'prime-late-show-b', guid: 'plex://show/prime-late', type: 'show' }, secondary)
  );
  var primarySeason = MultiServerMedia.decorateItem(
    { ratingKey: 'prime-late-a-s9', type: 'season', seasonNumber: 9 }, primary
  );
  var mergedSeason = MultiServerMedia.mergeSourceVariants(
    primarySeason,
    MultiServerMedia.decorateItem({ ratingKey: 'prime-late-b-s9', type: 'season', seasonNumber: 9 }, secondary)
  );
  var primaryEpisode = MultiServerMedia.decorateItem(
    { ratingKey: 'prime-late-a-e1', type: 'episode', seasonIndex: 9, episodeIndex: 1 }, primary
  );
  var mergedEpisode = MultiServerMedia.mergeSourceVariants(
    primaryEpisode,
    MultiServerMedia.decorateItem({ ratingKey: 'prime-late-b-e1', type: 'episode', seasonIndex: 9, episodeIndex: 1 }, secondary)
  );
  var finalCallback = null;
  var seasonCallback = null;
  var seasonLoads = 0;
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: {},
    loadMergedSeriesContext: function (_item, callback, onProgress) {
      if (typeof onProgress === 'function') {
        finalCallback = callback;
        onProgress({ seasons: [primarySeason], episodes: [primaryEpisode], multiServer: true });
      }
      return { abort: function () {} };
    },
    loadMergedSeasonEpisodes: function (_season, callback) {
      seasonLoads += 1;
      seasonCallback = callback;
      return { abort: function () {} };
    }
  });

  harness.feature.openLoaded(primaryEpisode, {
    returnView: 'library',
    selectedItem: show,
    deferMediaProfile: true
  });
  harness.controller.prepareMediaProfile(primaryEpisode, 'prime-late-profile');
  assert.strictEqual(seasonLoads, 0, 'late season hydration must wait for the current media profile');

  harness.controllerOptions().onMediaProfileState({ mediaProfileLoading: false, mediaProfileRatingKey: primaryEpisode.ratingKey });
  assert.strictEqual(seasonLoads, 0, 'a partial primary-only context must not start season hydration');

  finalCallback(null, { seasons: [mergedSeason], episodes: [primaryEpisode], multiServer: true });
  assert.strictEqual(seasonLoads, 1,
    'a merged context arriving after the profile must prime the visible season without episode navigation');

  seasonCallback(null, [mergedEpisode]);
  assert.strictEqual(harness.mediaControls().choices.versions, true,
    'late season priming must expose Version arrows for the current episode');
}());

(function testLateMergedSeriesContextDoesNotRewindTheSelectedSeason() {
  var primary = { serverMachineIdentifier: 'late-season-a', apiBaseUrl: 'https://late-season-a', token: 'a', primary: true };
  var secondary = { serverMachineIdentifier: 'late-season-b', apiBaseUrl: 'https://late-season-b', token: 'b' };
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'late-season-a' ? primary : (machine === 'late-season-b' ? secondary : null); }
  } });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'late-season-show-a', guid: 'plex://show/late-season', type: 'show' }, primary),
    MultiServerMedia.decorateItem({ ratingKey: 'late-season-show-b', guid: 'plex://show/late-season', type: 'show' }, secondary)
  );
  var finalCallback;
  var harness = createHarness({
    sourceRouter: sourceRouter,
    config: {},
    loadMergedSeriesContext: function (_item, callback, onProgress) {
      finalCallback = callback;
      onProgress({
        seasons: [
          { ratingKey: 'late-season-a-s1', type: 'season', seasonNumber: 1, serverMachineIdentifier: 'late-season-a' },
          { ratingKey: 'late-season-a-s9', type: 'season', seasonNumber: 9, serverMachineIdentifier: 'late-season-a' }
        ],
        episodes: [{ ratingKey: 'late-season-a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'late-season-a' }],
        multiServer: true
      });
      return { abort: function () {} };
    }
  });
  harness.feature.openLoaded(show, { returnView: 'library', selectedItem: show });
  harness.feature.setFocus({ zone: 'seasons', seasonIndex: 1, episodeIndex: 0 });

  finalCallback(null, {
    seasons: [
      { ratingKey: 'late-season-a-s1', type: 'season', seasonNumber: 1, serverMachineIdentifier: 'late-season-a' },
      { ratingKey: 'late-season-a-s9', type: 'season', seasonNumber: 9, serverMachineIdentifier: 'late-season-a' }
    ],
    // The late response is the default/first season, not the season the user selected.
    episodes: [{ ratingKey: 'late-season-b-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'late-season-b' }],
    multiServer: true
  });
  assert.strictEqual(harness.feature.snapshot().seasonIndex, 1,
    'a late first-season response must not move Detail away from the selected season');
  assert.deepStrictEqual(harness.feature.snapshot().seriesContext.episodes, [],
    'a late response for another season must not leave stale first-season episode cards in the selected season');
}());

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
    renderSeasons: function () { calls.push(['seasonRender']); },
    renderEpisodes: function () { calls.push(['episodeStripRender']); },
    refreshSelection: function () { calls.push(['episodeSelection']); },
    refreshPlaybackCards: function () { calls.push(['playbackCards']); },
    reconcilePlayback: function () {},
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
    loadEpisode: function (episode, callback) { if (callback) { callback(null, Object.assign({ type: 'episode' }, episode || {})); } return null; },
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
      ProgressiveImages: {}
    },
      data: {
      PlexClient: {
        loadMetadata: function (_config, ratingKey, callback) {
          calls.push(['loadMetadata', ratingKey]);
          metadataCallback = callback;
          return { abort: function () { calls.push(['abortMetadata', ratingKey]); } };
        },
        loadExtras: function (_config, ratingKey, callback) {
          calls.push(['loadExtras', ratingKey]);
          extrasCallback = callback;
          return { abort: function () { calls.push(['abortExtras', ratingKey]); } };
        },
        loadSeriesContext: function (_config, _detail, callback) { callback(null, null); return null; },
        loadSeasonEpisodes: function (_config, seasonKey, _selectedKey, callback) {
          calls.push(['loadSeasonEpisodes', seasonKey]);
          if (deferSeasonEpisodeLoads) {
            pendingSeasonEpisodeLoads.push({ seasonKey: seasonKey, callback: callback });
            return { abort: function () {} };
          }
          callback(null, seasonEpisodes.map(function (episode) { return Object.assign({}, episode); }));
          return null;
        },
        setWatchedAndReset: function (_config, ratingKey, watched, callback) {
          var index;
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
          calls.push(['removeContinuePort', target.item && target.item.ratingKey]);
          callback(null, target);
          return null;
        }
      },
      config: {},
      mediaPreferenceIdentity: function () { return 'server:profile:media'; },
      subtitlePresentationIdentity: function () { return values.subtitlePresentationIdentity || 'server-a'; },
      playbackCapabilities: function () { return { directPlay: true, codecs: [], containers: [] }; },
      settings: function () { return { playbackMode: 'auto', videoVersionPriorities: [] }; },
      activeVideoQuality: function () { return 'original'; },
      waitForActivity: function () {},
      onAssPrefetchCandidate: function (detail, profile, resolved) {
        assPrefetchCandidates.push({ detail: detail, profile: profile, resolved: resolved });
      }
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
      requestPlayback: function (request) { calls.push(['requestPlayback', request.detail && request.detail.ratingKey]); return request; },
      requestStandalonePlayback: function (request) { calls.push(['requestStandalonePlayback', request.detail && request.detail.ratingKey, request.item && request.item.ratingKey]); return request; }
    }
  };
  return {
    calls: calls,
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
  assert.deepStrictEqual(harness.calls.filter(function (entry) { return entry[0] === 'requestStandalonePlayback'; }).pop(), ['requestStandalonePlayback', 'extra-play-1', 'extra-play-1'], 'the selected extra must be handed directly to the standalone Player path without replacing the parent Detail');
  assert.strictEqual(harness.feature.snapshot().currentDetail.ratingKey, 'movie-extra-play', 'starting an extra must preserve the parent Detail as the return surface');
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
  harness.feature.resumeAfterPlayer(0);

  assert.strictEqual(harness.state.zone, 'extended', 'returning from standalone playback must preserve the logical extended focus zone');
  assert.ok(String(harness.document.getElementById('detail-view').className || '').indexOf('is-extended') !== -1,
    'returning from standalone playback must restore the lower Detail viewport instead of showing the primary pane with extended logical focus');
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
    renderSeasons: function () {},
    renderEpisodes: function () {},
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

console.log('Detail feature controller checks passed');

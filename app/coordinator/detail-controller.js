(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var root = values.root || {};
    var navigation = values.DetailNavigation && values.DetailNavigation.create ? values.DetailNavigation.create() : values.navigation;
    var metadataRefresh = values.MetadataRefresh;
    var state = {
      selectedItem: null,
      seriesContext: null,
      currentDetail: null,
      returnView: 'home',
      fromContinueWatching: false,
      zone: 'play',
      actionIndex: 0,
      seasonIndex: 0,
      episodeIndex: 0,
      metadataTimer: null,
      episodeToken: 0,
      seasonPreviewTimer: null,
      seasonPreviewToken: 0,
      seasonTransitionMediaKey: '',
      mediaProfileRequest: null,
      mediaProfileTimer: null,
      mediaProfileToken: 0,
      mediaProfileRatingKey: '',
      mediaProfileLoading: false,
      mediaLoadingLabelTimer: null,
      mediaLoadingLabelVisible: false,
      transitionTimer: null,
      transitionEndTimer: null,
      backLockedUntil: 0,
      refreshPending: false,
      metadataStatusTimer: null,
      metadataStatusTemporary: false,
      playPending: false,
      generation: 0,
      destroyed: false
    };
    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function abort(request) {
      if (request && typeof request.abort === 'function') { request.abort(); }
    }

    function clearTimer(name) {
      if (state[name] !== null && root.clearTimeout) { root.clearTimeout(state[name]); }
      state[name] = null;
    }

    function setTimer(name, callback, delay) {
      clearTimer(name);
      if (!root.setTimeout) { callback(); return null; }
      state[name] = root.setTimeout(function () {
        state[name] = null;
        if (!state.destroyed) { callback(); }
      }, Math.max(0, Number(delay || 0)));
      return state[name];
    }

    function cancelRequests() {
      abort(state.mediaProfileRequest);
      state.mediaProfileRequest = null;
    }

    function cancelTimers() {
      clearTimer('metadataTimer');
      clearTimer('seasonPreviewTimer');
      clearTimer('mediaProfileTimer');
      clearTimer('mediaLoadingLabelTimer');
      clearTimer('transitionTimer');
      clearTimer('transitionEndTimer');
      clearTimer('metadataStatusTimer');
    }

    function resetTransient() {
      cancelRequests();
      cancelTimers();
      state.episodeToken += 1;
      state.seasonPreviewToken += 1;
      state.mediaProfileToken += 1;
      state.seriesContext = null;
      state.currentDetail = null;
      state.fromContinueWatching = false;
      state.zone = 'play';
      state.actionIndex = 0;
      state.seasonIndex = 0;
      state.episodeIndex = 0;
      state.seasonTransitionMediaKey = '';
      state.mediaProfileRatingKey = '';
      state.mediaProfileLoading = false;
      state.mediaLoadingLabelVisible = false;
      state.refreshPending = false;
      state.metadataStatusTemporary = false;
      state.playPending = false;
      call(values.clearPreferences);
    }

    function open(item, options) {
      options = options || {};
      if (state.destroyed || !item) { return snapshot(); }
      state.generation += 1;
      resetTransient();
      state.selectedItem = item;
      state.returnView = options.returnView || 'home';
      state.fromContinueWatching = options.fromContinueWatching === true;
      state.backLockedUntil = Number(options.backLockedUntil || 0);
      call(values.onOpen, item, snapshot());
      return snapshot();
    }

    function setCurrentDetail(detail) {
      if (state.destroyed) { return null; }
      state.currentDetail = detail || null;
      if (detail && !state.selectedItem) { state.selectedItem = detail; }
      return state.currentDetail;
    }

    function setSeriesContext(context) {
      if (state.destroyed) { return null; }
      state.seriesContext = context || null;
      if (state.seriesContext) {
        state.seasonIndex = Math.max(0, Math.min((state.seriesContext.seasons || []).length - 1, state.seasonIndex));
        state.episodeIndex = Math.max(0, Math.min((state.seriesContext.episodes || []).length - 1, state.episodeIndex));
      } else {
        state.seasonIndex = 0;
        state.episodeIndex = 0;
      }
      return state.seriesContext;
    }

    function loadSelected(item, callback) {
      var generation = state.generation;
      var key = String(item && item.ratingKey || '');
      var request;
      if (state.destroyed) { return null; }
      if (!key || typeof values.loadMetadata !== 'function') { call(callback, new Error('metadata unavailable')); return null; }
      request = call(values.loadMetadata, key, function (error, detail) {
        if (state.destroyed || generation !== state.generation || !state.selectedItem || String(state.selectedItem.ratingKey || '') !== key) { return; }
        if (!error && detail) { setCurrentDetail(detail); }
        call(callback, error, detail || null);
      });
      return request;
    }

    function loadEpisode(episode, callback) {
      var token = state.episodeToken + 1;
      var key = String(episode && episode.ratingKey || '');
      if (state.destroyed) { return null; }
      state.episodeToken = token;
      if (!key || typeof values.loadMetadata !== 'function') { call(callback, new Error('episode unavailable')); return null; }
      return call(values.loadMetadata, key, function (error, detail) {
        var selected = state.seriesContext && state.seriesContext.episodes && state.seriesContext.episodes[state.episodeIndex];
        if (state.destroyed || token !== state.episodeToken || (selected && String(selected.ratingKey || '') !== key)) { return; }
        if (!error && detail) { setCurrentDetail(detail); }
        call(callback, error, detail || null);
      });
    }

    function scheduleEpisodePreview(callback, delay) {
      setTimer('metadataTimer', function () {
        var episode = state.seriesContext && state.seriesContext.episodes && state.seriesContext.episodes[state.episodeIndex];
        if (episode) { call(callback, episode, state.episodeIndex); }
      }, delay === undefined ? 180 : delay);
    }

    function scheduleSeasonPreview(loader, callback, delay) {
      var token = state.seasonPreviewToken + 1;
      var index = state.seasonIndex;
      state.seasonPreviewToken = token;
      setTimer('seasonPreviewTimer', function () {
        var season = state.seriesContext && state.seriesContext.seasons && state.seriesContext.seasons[index];
        if (!season) { return; }
        call(loader, season, function (error, episodes) {
          if (state.destroyed || token !== state.seasonPreviewToken || index !== state.seasonIndex) { return; }
          call(callback, error, episodes || [], season, index);
        });
      }, delay === undefined ? 200 : delay);
    }

    function navigate(direction, context) {
      var result;
      if (!navigation || !navigation.set || !navigation.navigate) { return { state: focusSnapshot(), effect: '' }; }
      navigation.set({ zone: state.zone, actionIndex: state.actionIndex, seasonIndex: state.seasonIndex, episodeIndex: state.episodeIndex });
      result = navigation.navigate(direction, context || {});
      state.zone = result.state.zone;
      state.actionIndex = result.state.actionIndex;
      state.seasonIndex = result.state.seasonIndex;
      state.episodeIndex = result.state.episodeIndex;
      call(values.onFocusChanged, focusSnapshot(), result.effect);
      return result;
    }

    function focusSnapshot() {
      return { zone: state.zone, actionIndex: state.actionIndex, seasonIndex: state.seasonIndex, episodeIndex: state.episodeIndex };
    }

    function setFocus(next) {
      next = next || {};
      if (state.destroyed) { return focusSnapshot(); }
      if (next.zone !== undefined) { state.zone = String(next.zone); }
      if (next.actionIndex !== undefined) { state.actionIndex = Math.max(0, Number(next.actionIndex) || 0); }
      if (next.seasonIndex !== undefined) { state.seasonIndex = Math.max(0, Number(next.seasonIndex) || 0); }
      if (next.episodeIndex !== undefined) { state.episodeIndex = Math.max(0, Number(next.episodeIndex) || 0); }
      return focusSnapshot();
    }

    function prepareMediaProfile(detail, identity) {
      var key = String(detail && detail.ratingKey || '');
      if (state.destroyed) { return ''; }
      clearTimer('mediaProfileTimer');
      clearTimer('mediaLoadingLabelTimer');
      abort(state.mediaProfileRequest);
      state.mediaProfileRequest = null;
      state.mediaProfileToken += 1;
      state.mediaProfileRatingKey = key;
      state.mediaProfileLoading = !!key;
      state.mediaLoadingLabelVisible = false;
      call(values.preparePreferences, identity || '', detail || null);
      if (key) {
        setTimer('mediaLoadingLabelTimer', function () {
          if (!state.mediaProfileLoading || state.mediaProfileRatingKey !== key) { return; }
          state.mediaLoadingLabelVisible = true;
          call(values.onMediaProfileState, snapshot());
        }, 500);
      }
      call(values.onMediaProfileState, snapshot());
      return key;
    }

    function loadMediaProfile(detail, callback) {
      var key = String(detail && detail.ratingKey || '');
      var token;
      if (state.destroyed || !key || typeof values.loadMediaProfile !== 'function') { return null; }
      abort(state.mediaProfileRequest);
      state.mediaProfileRequest = null;
      state.mediaProfileToken += 1;
      token = state.mediaProfileToken;
      state.mediaProfileRatingKey = key;
      state.mediaProfileLoading = true;
      state.mediaProfileRequest = call(values.loadMediaProfile, key, function (error, profile) {
        if (state.destroyed || token !== state.mediaProfileToken || !state.currentDetail || String(state.currentDetail.ratingKey || '') !== key) { return; }
        state.mediaProfileRequest = null;
        state.mediaProfileLoading = false;
        state.mediaLoadingLabelVisible = false;
        clearTimer('mediaLoadingLabelTimer');
        call(values.setMediaProfile, error ? null : profile);
        call(values.onMediaProfileState, snapshot());
        call(callback, error, profile || null);
      });
      return state.mediaProfileRequest;
    }

    function queueMediaProfile(detail, identity, callback) {
      var key = prepareMediaProfile(detail, identity);
      if (!key) { return null; }
      return setTimer('mediaProfileTimer', function () {
        if (!state.currentDetail || String(state.currentDetail.ratingKey || '') !== key) { return; }
        loadMediaProfile(detail, callback);
      }, 120);
    }


    function assign(target, patch) {
      var key;
      if (state.destroyed || !target || !patch) { return target; }
      for (key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) { target[key] = patch[key]; }
      }
      return target;
    }

    function patchCurrentDetail(patch) {
      return assign(state.currentDetail, patch);
    }

    function patchSelectedItem(patch) {
      return assign(state.selectedItem, patch);
    }

    function patchEpisode(index, patch) {
      var episodes = state.seriesContext && state.seriesContext.episodes;
      if (state.destroyed) { return null; }
      index = Math.max(0, Number(index) || 0);
      if (!episodes || !episodes[index]) { return null; }
      return assign(episodes[index], patch);
    }

    function setSelectedItem(item) {
      if (state.destroyed) { return null; }
      state.selectedItem = item || null;
      return state.selectedItem;
    }

    function setEpisodes(episodes, episodeIndex) {
      var index;
      if (state.destroyed || !state.seriesContext) { return snapshot(); }
      state.seriesContext.episodes = episodes || [];
      selectEpisode(episodeIndex);
      for (index = 0; index < state.seriesContext.episodes.length; index += 1) {
        state.seriesContext.episodes[index].selected = index === state.episodeIndex;
      }
      return snapshot();
    }

    function selectSeason(index) {
      var seasons = state.seriesContext && state.seriesContext.seasons || [];
      var position;
      var requested = Math.max(0, Number(index) || 0);
      if (state.destroyed) { return state.seasonIndex; }
      state.seasonIndex = seasons.length ? Math.min(seasons.length - 1, requested) : requested;
      for (position = 0; position < seasons.length; position += 1) { seasons[position].selected = position === state.seasonIndex; }
      return state.seasonIndex;
    }

    function selectEpisode(index) {
      var episodes = state.seriesContext && state.seriesContext.episodes || [];
      var position;
      var requested = Math.max(0, Number(index) || 0);
      if (state.destroyed) { return state.episodeIndex; }
      state.episodeIndex = episodes.length ? Math.min(episodes.length - 1, requested) : requested;
      for (position = 0; position < episodes.length; position += 1) { episodes[position].selected = position === state.episodeIndex; }
      return state.episodeIndex;
    }

    function setReturnView(value) {
      if (state.destroyed) { return state.returnView; }
      state.returnView = String(value || 'home');
      return state.returnView;
    }

    function setFromContinueWatching(value) {
      if (state.destroyed) { return state.fromContinueWatching; }
      state.fromContinueWatching = value === true;
      return state.fromContinueWatching;
    }

    function setPlayPending(value) {
      if (state.destroyed) { return state.playPending; }
      state.playPending = value === true;
      return state.playPending;
    }

    function setBackLockedUntil(value) {
      if (state.destroyed) { return state.backLockedUntil; }
      state.backLockedUntil = Math.max(0, Number(value) || 0);
      return state.backLockedUntil;
    }

    function cancelEpisodePreview() {
      if (state.destroyed) { return state.episodeToken; }
      state.episodeToken += 1;
      clearTimer('metadataTimer');
      state.seasonTransitionMediaKey = '';
      return state.episodeToken;
    }

    function setSeasonTransitionMediaKey(value) {
      if (state.destroyed) { return state.seasonTransitionMediaKey; }
      state.seasonTransitionMediaKey = String(value || '');
      return state.seasonTransitionMediaKey;
    }

    function setMetadataStatusTemporary(value) {
      if (state.destroyed) { return state.metadataStatusTemporary; }
      state.metadataStatusTemporary = value === true;
      return state.metadataStatusTemporary;
    }

    function canRequestPlayback() {
      var detail = state.currentDetail;
      if (!detail || !detail.ratingKey || state.mediaProfileLoading) { return false; }
      if (detail.type === 'show' || detail.type === 'season') { return false; }
      return true;
    }

    function requestPlayback(options) {
      var preferences;
      var request;
      options = options || {};
      if (state.destroyed) { return false; }
      if (!canRequestPlayback()) { state.playPending = true; return false; }
      state.playPending = false;
      preferences = call(values.playbackPreferences, options.versionAffinity) || {};
      request = {
        item: state.selectedItem,
        detail: state.currentDetail,
        seriesContext: state.seriesContext,
        seasonIndex: state.seasonIndex,
        episodeIndex: state.episodeIndex,
        resume: options.resume === true,
        preferences: preferences,
        mediaProfile: call(values.selectedMediaProfile) || null,
        resolvedTracks: call(values.resolvedTracks) || null
      };
      call(values.requestPlayback, request);
      return request;
    }

    function refresh(keys, reload, callback) {
      if (state.destroyed || state.refreshPending || !metadataRefresh || typeof metadataRefresh.run !== 'function') { return false; }
      state.refreshPending = true;
      call(values.onRefreshPending, true);
      metadataRefresh.run({
        keys: keys || [],
        refresh: function (key, next) { call(values.refreshMetadata, key, next); },
        wait: function (activityId, next) { call(values.waitForActivity, activityId, next); },
        reload: function (key, next) { call(reload, key, next); }
      }, function (error) {
        if (state.destroyed) { return; }
        state.refreshPending = false;
        call(values.onRefreshPending, false);
        call(callback, error || null);
      });
      return true;
    }

    function beginTransition(delay, callback) {
      setTimer('transitionTimer', callback, delay);
      return state.transitionTimer;
    }

    function beginTransitionEnd(delay, callback) {
      setTimer('transitionEndTimer', callback, delay);
      return state.transitionEndTimer;
    }

    function cancelTransitions() {
      clearTimer('transitionTimer');
      clearTimer('transitionEndTimer');
    }

    function clearMetadataStatusTimer() { clearTimer('metadataStatusTimer'); }

    function scheduleMetadataStatus(callback, delay) {
      return setTimer('metadataStatusTimer', callback, delay);
    }

    function close() {
      if (state.destroyed) { return snapshot(); }
      state.generation += 1;
      resetTransient();
      state.selectedItem = null;
      call(values.onClose, state.returnView, snapshot());
      return snapshot();
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (state.destroyed) { return { handled: false }; }
      if (call(values.mediaInfoOpen)) {
        return call(values.handleMediaInfoKey, event, direction) || { handled: true };
      }
      if (call(values.summaryOpen)) {
        if (code === 27 || code === 461 || code === 13) { call(values.closeSummary); }
        else if (direction === 'up') { call(values.scrollSummary, -1); }
        else if (direction === 'down') { call(values.scrollSummary, 1); }
        return { handled: true };
      }
      if (code === 415) {
        if (state.zone === 'episodes' && state.seriesContext) {
          call(values.playEpisode, state.seriesContext.episodes[state.episodeIndex]);
        } else { requestPlayback({ resume: false }); }
        return { handled: true };
      }
      if (code === 27 || code === 461) {
        if ((call(values.now) || new Date().getTime()) >= state.backLockedUntil) { call(values.closeDetail); }
        return { handled: true };
      }
      if (direction) { call(values.navigate, direction); return { handled: true }; }
      if (code !== 13) { return { handled: false }; }
      if (state.zone === 'nav') { call(values.activateNavigation); }
      else if (state.zone === 'seasons') { call(values.loadSeason); }
      else if (state.zone === 'episodes' && state.seriesContext) { call(values.playEpisode, state.seriesContext.episodes[state.episodeIndex]); }
      else if (state.zone === 'version') { call(values.openVersionDetails); }
      else if (state.zone === 'audio' || state.zone === 'subtitles') { call(values.openChoice, state.zone); }
      else if (state.zone === 'summary') { call(values.openSummary); }
      else if (state.actionIndex === 1) { call(values.toggleWatched); }
      else if (state.actionIndex === 2) { call(values.toggleWatchlist); }
      else if (state.actionIndex === 3) { call(values.openDetailOptions); }
      else { requestPlayback({ resume: false }); }
      return { handled: true };
    }

    function snapshot() {
      return {
        selectedItem: state.selectedItem,
        seriesContext: state.seriesContext,
        currentDetail: state.currentDetail,
        returnView: state.returnView,
        fromContinueWatching: state.fromContinueWatching,
        zone: state.zone,
        actionIndex: state.actionIndex,
        seasonIndex: state.seasonIndex,
        episodeIndex: state.episodeIndex,
        mediaProfileRatingKey: state.mediaProfileRatingKey,
        mediaProfileLoading: state.mediaProfileLoading,
        mediaLoadingLabelVisible: state.mediaLoadingLabelVisible,
        seasonTransitionMediaKey: state.seasonTransitionMediaKey,
        backLockedUntil: state.backLockedUntil,
        refreshPending: state.refreshPending,
        metadataStatusTemporary: state.metadataStatusTemporary,
        playPending: state.playPending,
        canPlay: canRequestPlayback(),
        generation: state.generation,
        destroyed: state.destroyed
      };
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      state.generation += 1;
      resetTransient();
      state.selectedItem = null;
    }

    return {
      beginTransition: beginTransition,
      beginTransitionEnd: beginTransitionEnd,
      cancelEpisodePreview: cancelEpisodePreview,
      cancelTransitions: cancelTransitions,
      clearMetadataStatusTimer: clearMetadataStatusTimer,
      canRequestPlayback: canRequestPlayback,
      close: close,
      destroy: destroy,
      focus: focusSnapshot,
      handleKey: handleKey,
      loadEpisode: loadEpisode,
      loadMediaProfile: loadMediaProfile,
      loadSelected: loadSelected,
      navigate: navigate,
      open: open,
      patchCurrentDetail: patchCurrentDetail,
      patchEpisode: patchEpisode,
      patchSelectedItem: patchSelectedItem,
      prepareMediaProfile: prepareMediaProfile,
      queueMediaProfile: queueMediaProfile,
      refresh: refresh,
      requestPlayback: requestPlayback,
      scheduleEpisodePreview: scheduleEpisodePreview,
      scheduleMetadataStatus: scheduleMetadataStatus,
      scheduleSeasonPreview: scheduleSeasonPreview,
      selectEpisode: selectEpisode,
      selectSeason: selectSeason,
      setBackLockedUntil: setBackLockedUntil,
      setCurrentDetail: setCurrentDetail,
      setEpisodes: setEpisodes,
      setFromContinueWatching: setFromContinueWatching,
      setFocus: setFocus,
      setMetadataStatusTemporary: setMetadataStatusTemporary,
      setPlayPending: setPlayPending,
      setReturnView: setReturnView,
      setSelectedItem: setSelectedItem,
      setSeasonTransitionMediaKey: setSeasonTransitionMediaKey,
      setSeriesContext: setSeriesContext,
      snapshot: snapshot
    };
  }

  return { create: create };
}));

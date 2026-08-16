(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var data = values.data || {};
    var shell = values.shell || {};
    var watchlist = values.watchlist || {};
    var dialogs = values.dialogs || {};
    var statePort = values.state || {};
    var transitions = values.transitions || {};
    var root = platform.root || {};
    var document = platform.document || {};
    var PlexClient = data.PlexClient || {};
    var config = data.config || {};
    var destroyed = false;
    var entered = false;
    var featureGeneration = 0;
    var lastPresentationKey = '';
    var pendingProgress = null;
    var seasonBulkPending = false;
    var ownedRequests = [];
    var featureTimers = [];
    var clickTargets = [];
    var preferences = modules.DetailPreferenceState.create({
      MediaPreferences: modules.MediaPreferences,
      MediaProfile: modules.MediaProfile,
      storage: platform.storage
    });
    var presentationView;
    var episodeView;
    var controller;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }

    function node(id) { return document && document.getElementById ? document.getElementById(id) : null; }
    function t(key, parameters) { return call(shell.t, key, parameters) || key; }
    function setText(id, text) {
      if (typeof shell.setText === 'function') { shell.setText(id, text); }
      else if (node(id)) { node(id).textContent = String(text || ''); }
    }
    function currentView() { return String(call(statePort.currentView) || ''); }
    function settings() { return call(data.settings) || {}; }
    function activeVideoQuality() { return call(data.activeVideoQuality) || 'original'; }
    function animationDuration(milliseconds) {
      var duration = call(statePort.animationDuration, milliseconds);
      return isFinite(Number(duration)) ? Number(duration) : Number(milliseconds || 0);
    }
    function animationsEnabled() { return call(statePort.animationsEnabled) !== false; }
    function active() { return !destroyed; }
    function currentToken() { return featureGeneration; }
    function tokenIsCurrent(token) { return active() && token === featureGeneration; }

    function controllerSnapshot() {
      var source = controller && controller.snapshot ? controller.snapshot() : {};
      var result = {};
      var key;
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      result.featureDestroyed = destroyed;
      return result;
    }

    function copyRecord(source) {
      var result;
      var key;
      if (!source || typeof source !== 'object') { return source || null; }
      result = {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function copyRecords(source) {
      return (source || []).map(function (item) { return copyRecord(item); });
    }

    function copySeriesContext(source) {
      var result;
      if (!source) { return null; }
      result = copyRecord(source);
      result.seasons = copyRecords(source.seasons);
      result.episodes = copyRecords(source.episodes);
      return result;
    }

    /** @returns {PloffDetailFeatureSnapshot} */
    function boundarySnapshot() {
      var source = controllerSnapshot();
      var result = copyRecord(source);
      result.selectedItem = copyRecord(source.selectedItem);
      result.currentDetail = copyRecord(source.currentDetail);
      result.seriesContext = copySeriesContext(source.seriesContext);
      return result;
    }

    function snapshot() { return boundarySnapshot(); }

    function currentDetail() { return copyRecord(controllerSnapshot().currentDetail); }

    function trackRequest(request) {
      if (request && typeof request.abort === 'function') { ownedRequests.push(request); }
      return request;
    }

    function abortRequests() {
      var request;
      while (ownedRequests.length) {
        request = ownedRequests.pop();
        if (request && typeof request.abort === 'function') { request.abort(); }
      }
    }

    function schedule(callback, delay) {
      var id;
      if (!root.setTimeout) { callback(); return null; }
      id = root.setTimeout(function () {
        var index = featureTimers.indexOf(id);
        if (index !== -1) { featureTimers.splice(index, 1); }
        if (active()) { callback(); }
      }, Math.max(0, Number(delay || 0)));
      featureTimers.push(id);
      return id;
    }

    function clearFeatureTimers() {
      while (featureTimers.length) {
        if (root.clearTimeout) { root.clearTimeout(featureTimers.pop()); }
        else { featureTimers.pop(); }
      }
    }

    function setDetailViewMode(enabled) {
      if (!document.body) { return; }
      document.body.className = String(document.body.className || '').replace(/\s*is-detail-view/g, '');
      if (enabled) { document.body.className += ' is-detail-view'; }
    }

    function translateStatic() {
      var optionsButton = node('detail-options');
      setText('detail-play', t('detail.play'));
      if (optionsButton && optionsButton.setAttribute) { optionsButton.setAttribute('aria-label', t('detail.mediaOptions')); }
      setText('detail-version-label', t('detail.version'));
    }

    function detailPresentationKey(item) {
      if (!item) { return ''; }
      return [item.type || '', item.ratingKey || item.title || ''].join(':');
    }

    function artworkUrl(item) {
      return call(shell.artworkUrl, item) || (item && (item.art || item.image) || '');
    }

    function clearDetailPresentation(clearPoster) {
      if (controller.cancelEpisodePreview) { controller.cancelEpisodePreview(); }
      call(shell.cancelImages, 'detail');
      if (clearPoster) { call(shell.loadRenderedPoster, node('detail-poster'), '', 0, 'detail', 360, 540); }
      presentationView.clear();
      setText('detail-audio-value', '');
      setText('detail-subtitles-value', '');
      setText('detail-version-value', '');
      if (node('season-tabs')) { node('season-tabs').innerHTML = ''; }
      if (node('episode-strip')) { node('episode-strip').innerHTML = ''; }
      episodeView.reset();
    }

    function prepareTransition(item) {
      var nextKey = detailPresentationKey(item);
      var nextArtwork = artworkUrl(item);
      var activeBackdrop = String(call(shell.activeBackdropSource) || '');
      if (lastPresentationKey && nextKey !== lastPresentationKey) {
        clearDetailPresentation(true);
      }
      if (activeBackdrop && activeBackdrop !== nextArtwork) { call(shell.clearBackdrop); }
      lastPresentationKey = nextKey;
      return nextKey;
    }

    function mediaPreferenceIdentity(detail) { return String(call(data.mediaPreferenceIdentity, detail) || ''); }
    function detailMediaVersions() { return preferences.versions ? preferences.versions() : []; }

    function selectedMediaProfile() {
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var capabilities = call(data.playbackCapabilities) || {};
      if (preferenceState.override && preferenceState.override.mediaIndex !== null && preferenceState.override.mediaIndex !== undefined) {
        return preferences.selectedProfile ? preferences.selectedProfile() : null;
      }
      if (modules.VersionSelection && modules.VersionSelection.selectAutomatic) {
        return modules.VersionSelection.selectAutomatic(detailMediaVersions(), {
          directPlay: capabilities.directPlay,
          codecs: capabilities.codecs || [],
          containers: capabilities.containers || [],
          uhd: capabilities.uhd,
          hdr10: capabilities.hdr10,
          dolbyVision: capabilities.dolbyVision,
          hdrKnown: capabilities.hdrKnown
        }, settings().playbackMode, settings().videoVersionPriorities) || (preferences.selectedProfile ? preferences.selectedProfile() : null);
      }
      return preferences.selectedProfile ? preferences.selectedProfile() : null;
    }

    function resolvedTracksForProfile(profile) {
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      if (!modules.MediaPreferences || !modules.MediaPreferences.resolve || !profile) { return null; }
      return modules.MediaPreferences.resolve({ options: {}, audioTracks: profile.audioTracks, subtitleTracks: profile.subtitleTracks }, preferenceState.override, settings());
    }

    function resolvedTracks() { return resolvedTracksForProfile(selectedMediaProfile()); }

    function resolvePlaybackTracks(playback) {
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      if (!modules.MediaPreferences || !modules.MediaPreferences.resolve || !playback) { return null; }
      return modules.MediaPreferences.resolve(playback, preferenceState.override, settings());
    }

    function playbackPreferences(versionAffinity) {
      var capabilities = call(data.playbackCapabilities) || {};
      var result = preferences.playbackPreferences ? preferences.playbackPreferences(settings(), activeVideoQuality()) : {};
      result.playbackCapabilities = {
        directPlay: capabilities.directPlay,
        codecs: (capabilities.codecs || []).slice(),
        containers: (capabilities.containers || []).slice(),
        uhd: capabilities.uhd,
        hdr10: capabilities.hdr10,
        dolbyVision: capabilities.dolbyVision,
        hdrKnown: capabilities.hdrKnown
      };
      if (versionAffinity) { result.versionAffinity = versionAffinity; }
      return result;
    }

    function mediaVersionLabel(profile, automatic) {
      return modules.MediaChoiceModel.versionLabel(profile, {
        automatic: automatic,
        automaticLabel: t('player.versionAuto'),
        unavailable: t('player.unavailable')
      });
    }

    function automaticTrackLabel(label) { return t('player.automatic') + (label ? ' - ' + label : ''); }

    function renderMediaControls() {
      var resolved = resolvedTracks();
      var profile = selectedMediaProfile();
      var versions = detailMediaVersions();
      var choices = modules.MediaProfile && modules.MediaProfile.choiceState ? modules.MediaProfile.choiceState(profile, versions) : { audio: false, subtitles: false, versions: false };
      var unavailableLabel;
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var current = controllerSnapshot();
      var display = { audio: '', subtitles: '', version: '' };
      choices.versionOpenable = !!profile;
      if (!profile || !resolved) {
        unavailableLabel = current.mediaProfileLoading ? (current.mediaLoadingLabelVisible ? t('detail.loadingTracks') : '') : t('player.unavailable');
        display.audio = unavailableLabel;
        display.subtitles = unavailableLabel;
        display.version = unavailableLabel;
      } else {
        display.version = mediaVersionLabel(profile, !preferenceState.override || preferenceState.override.mediaIndex === null);
        display.audio = modules.MediaProfile.trackDisplayLabel(resolved.audioTrack, t('detail.external'));
        display.audio = preferenceState.override && preferenceState.override.audioTrack ? display.audio : automaticTrackLabel(display.audio);
        display.subtitles = preferenceState.override && preferenceState.override.subtitlesOff ? t('subtitle.off') :
          (preferenceState.override && preferenceState.override.subtitleTrack
            ? (modules.MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'))
            : automaticTrackLabel(modules.MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off')));
      }
      presentationView.renderMediaControls({
        labels: { version: t('detail.version'), audio: t('detail.audio'), subtitles: t('detail.subtitles') },
        choices: choices,
        values: display
      });
    }

    function prepareMediaProfile(detail) {
      controller.prepareMediaProfile(detail, mediaPreferenceIdentity(detail));
      renderMediaControls();
    }

    function queueMediaProfile(detail) {
      return controller.queueMediaProfile(detail, mediaPreferenceIdentity(detail), function () { completePendingPlay(); });
    }

    function ensureMediaProfile(detail) {
      var ratingKey = String(detail && detail.ratingKey || '');
      var current = controllerSnapshot();
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      if (!ratingKey) { return false; }
      if (String(current.mediaProfileRatingKey || '') === ratingKey && (preferenceState.profile || current.mediaProfileLoading)) {
        renderMediaControls();
        return true;
      }
      queueMediaProfile(detail);
      return true;
    }

    function saveMediaOverride() {
      if (!modules.MediaPreferences || !currentDetail()) { return null; }
      if (preferences.save) { preferences.save(); }
      renderMediaControls();
      return preferences.snapshot ? preferences.snapshot() : null;
    }

    function setTrackPreference(kind, track, off) {
      if (!preferences.setTrack) { return null; }
      preferences.setTrack(kind, track || null, off === true);
      renderMediaControls();
      return preferences.snapshot ? preferences.snapshot() : null;
    }

    function setPlaybackVersion(mediaIndex, partIndex) {
      var result = preferences.setVersion ? preferences.setVersion(mediaIndex, partIndex) : null;
      renderMediaControls();
      return result;
    }

    function cycleTrack(kind, direction) {
      if (!selectedMediaProfile() || !preferences.cycleTrack) { return false; }
      preferences.cycleTrack(kind, direction);
      renderMediaControls();
      return true;
    }

    function cycleVersion(direction) {
      if (detailMediaVersions().length < 2 || !preferences.cycleVersion) { return false; }
      preferences.cycleVersion(direction);
      renderMediaControls();
      return true;
    }

    function openChoice(kind) {
      var profile = selectedMediaProfile();
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var override = preferenceState.override;
      var resolved = resolvedTracks();
      var choices = [];
      var selected = '';
      var automaticLabel;
      var selectedTrack;
      if (!profile) { return false; }
      if (kind === 'audio') {
        automaticLabel = automaticTrackLabel(modules.MediaProfile.trackDisplayLabel(resolved && resolved.audioTrack, t('detail.external')));
        choices = modules.MediaChoiceModel.trackChoices(profile.audioTracks, {
          automatic: { value: '', label: automaticLabel, languageCode: resolved && resolved.audioTrack && (resolved.audioTrack.languageTag || resolved.audioTrack.languageCode || resolved.audioTrack.language) },
          useIndexFallback: true,
          label: function (track) { return modules.MediaProfile.trackDisplayLabel(track, t('detail.external')); }
        });
        selectedTrack = override && override.audioTrack ? modules.MediaPreferences.findTrack(profile.audioTracks, override.audioTrack, false) : null;
        selected = selectedTrack ? modules.MediaChoiceModel.trackValue(selectedTrack, profile.audioTracks.indexOf(selectedTrack), true) : '';
      } else if (kind === 'subtitles') {
        automaticLabel = automaticTrackLabel(modules.MediaProfile.trackDisplayLabel(resolved && resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'));
        choices = modules.MediaChoiceModel.trackChoices(profile.subtitleTracks, {
          automatic: { value: 'automatic', label: automaticLabel, languageCode: resolved && resolved.subtitleTrack && (resolved.subtitleTrack.languageTag || resolved.subtitleTrack.languageCode || resolved.subtitleTrack.language) },
          off: { value: 'off', label: t('subtitle.off') },
          useIndexFallback: true,
          label: function (track) { return modules.MediaProfile.trackDisplayLabel(track, t('detail.external')); }
        });
        selectedTrack = override && override.subtitleTrack ? modules.MediaPreferences.findTrack(profile.subtitleTracks, override.subtitleTrack, false) : null;
        selected = override && override.subtitlesOff ? 'off' : (selectedTrack ? modules.MediaChoiceModel.trackValue(selectedTrack, profile.subtitleTracks.indexOf(selectedTrack), true) : 'automatic');
      } else { return false; }
      call(dialogs.openChoice,
        kind === 'audio' ? t('detail.audio') : t('detail.subtitles'),
        choices,
        selected,
        function (choice) { setTrackPreference(kind, choice.track || null, choice.value === 'off'); },
        updateFocus
      );
      return true;
    }

    function detailChoiceState() {
      return preferences.choiceState ? preferences.choiceState() : { audio: false, subtitles: false, versions: false };
    }

    function detailChoiceZones() {
      var choices = detailChoiceState();
      var zones = [];
      if (selectedMediaProfile()) { zones.push('version'); }
      if (choices.audio) { zones.push('audio'); }
      if (choices.subtitles) { zones.push('subtitles'); }
      return zones;
    }

    function detailDisplaySubtitle(detail) {
      var subtitle = detail && detail.subtitle || '';
      if (!detail || detail.type !== 'episode') { return subtitle; }
      return subtitle.replace(/(^| - )E0*([0-9]+)( - )/, function (_match, prefix, episodeNumber, separator) {
        return prefix + t('player.episode') + ' ' + Number(episodeNumber) + separator;
      });
    }

    function cloudRatingKeyForDetail(detail) {
      var guid = detail && (detail.cloudGuid || detail.watchlistGuid || detail.guid) || '';
      if (detail && detail.cloudRatingKey) { return String(detail.cloudRatingKey); }
      if (/^plex:\/\//.test(guid)) { return guid.split('/').pop(); }
      return '';
    }

    function watchlistLocalKeyForDetail(detail) {
      if (!detail) { return ''; }
      return String((detail.type === 'episode' || detail.type === 'season') ? (detail.showRatingKey || detail.ratingKey || '') : (detail.ratingKey || ''));
    }

    function syncWatchlist() {
      var detail = currentDetail();
      var cached;
      if (!detail || !detail.ratingKey) { return false; }
      cached = call(watchlist.findLocal, watchlistLocalKeyForDetail(detail));
      controller.patchCurrentDetail({ inWatchlist: !!cached });
      if (cached) { controller.patchCurrentDetail({ cloudRatingKey: cached.cloudRatingKey, cloudGuid: cached.cloudGuid }); }
      return !!cached;
    }

    function renderWatchlist() {
      var button = node('detail-watchlist');
      var state = call(watchlist.snapshot) || {};
      var detail = currentDetail();
      if (!button) { return; }
      button.disabled = call(watchlist.available) !== true || !state.provider || state.loading || state.mutationPending || !cloudRatingKeyForDetail(detail);
      setText('detail-watchlist', detail && detail.inWatchlist ? t('detail.removeWatchlist') : t('detail.addWatchlist'));
    }

    function currentRequestMatches(generation, ratingKey) {
      var current = controllerSnapshot();
      return currentView() === 'detail' && current.generation === generation && current.currentDetail &&
        String(current.currentDetail.ratingKey || '') === String(ratingKey || '');
    }

    function toggleWatchlist() {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      var cloudKey = cloudRatingKeyForDetail(detail);
      var enabled;
      var source;
      var local;
      var requestGeneration = current.generation;
      var requestRatingKey = detail && detail.ratingKey;
      var state = call(watchlist.snapshot) || {};
      if (!detail || !cloudKey || call(watchlist.available) !== true || !state.provider || state.mutationPending) { return false; }
      enabled = !detail.inWatchlist;
      source = current.selectedItem && String(current.selectedItem.ratingKey || '') === String(detail.ratingKey || '') ? current.selectedItem : detail;
      controller.patchCurrentDetail({ inWatchlist: enabled });
      renderWatchlist();
      local = { ratingKey: '', type: '', title: '', meta: '', metaKey: '', image: '', art: '', cloudGuid: '' };
      Object.keys(source).forEach(function (key) { local[key] = source[key]; });
      local.ratingKey = watchlistLocalKeyForDetail(detail);
      local.type = detail.type === 'episode' || detail.type === 'season' ? 'show' : detail.type;
      local.title = detail.title;
      local.meta = local.type === 'show' ? 'TV Shows' : (local.meta || 'Movie');
      local.metaKey = local.type === 'show' ? 'media.show' : 'media.movie';
      local.image = detail.image || local.image;
      local.art = detail.art || local.art;
      local.cloudGuid = detail.watchlistGuid || detail.guid || detail.cloudGuid || '';
      trackRequest(call(watchlist.toggle, cloudKey, enabled, local, function (error) {
        if (!currentRequestMatches(requestGeneration, requestRatingKey)) { return; }
        if (error) {
          controller.patchCurrentDetail({ inWatchlist: !enabled });
          renderWatchlist();
          call(shell.showMessage, t('status.updateError'));
          return;
        }
        controller.patchSelectedItem({ inWatchlist: enabled, cloudRatingKey: cloudKey });
        controller.patchCurrentDetail({ inWatchlist: enabled, cloudRatingKey: cloudKey });
        renderWatchlist();
      }));
      return true;
    }

    function renderDetail(detail, deferMediaProfile) {
      var poster = node('detail-poster');
      var selected = controllerSnapshot().selectedItem;
      var identityPatch = {};
      var token = currentToken();
      var state;
      if (!active() || !detail) { return false; }
      controller.setCurrentDetail(detail);
      if (selected) {
        if (!detail.themeLookupKey && selected.themeLookupKey) { identityPatch.themeLookupKey = selected.themeLookupKey; }
        if (!detail.themeKey && selected.themeKey) { identityPatch.themeKey = selected.themeKey; }
        if (!detail.themeUrl && selected.themeUrl) { identityPatch.themeUrl = selected.themeUrl; }
      }
      if (selected && String(selected.ratingKey || '') === String(detail.ratingKey || '')) {
        if (!detail.guid && selected.guid) { identityPatch.guid = selected.guid; }
        if (selected.cloudRatingKey) { identityPatch.cloudRatingKey = selected.cloudRatingKey; }
        if (selected.cloudGuid) { identityPatch.cloudGuid = selected.cloudGuid; }
      }
      if (Object.keys(identityPatch).length) {
        controller.patchCurrentDetail(identityPatch);
        detail = currentDetail();
      }
      presentationView.renderMetadata(detail, detailDisplaySubtitle(detail));
      call(shell.loadRenderedPoster, poster, detail.image || '', 0, 'detail', 360, 540);
      setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      call(shell.scheduleBackdrop, detail);
      if (detail.ratingKey) { call(shell.scheduleTheme, detail); }
      if (detail.ratingKey) {
        if (deferMediaProfile) { prepareMediaProfile(detail); }
        else { queueMediaProfile(detail); }
      }
      syncWatchlist();
      renderWatchlist();
      state = call(watchlist.snapshot) || {};
      if (call(watchlist.available) === true && state.loadedIdentity !== call(watchlist.identity) && !state.loading) {
        trackRequest(call(watchlist.load, false, function () {
          if (!tokenIsCurrent(token) || currentView() !== 'detail' || !currentDetail() || String(currentDetail().ratingKey || '') !== String(detail.ratingKey || '')) { return; }
          syncWatchlist();
          renderWatchlist();
        }));
      }
      return true;
    }

    function toggleWatched() {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      var watched;
      var requestGeneration = current.generation;
      var requestRatingKey = detail && detail.ratingKey;
      if (!detail || !requestRatingKey || typeof PlexClient.setWatchedAndReset !== 'function') { return false; }
      watched = !detail.viewed;
      trackRequest(PlexClient.setWatchedAndReset(config, requestRatingKey, watched, function (error) {
        var requestStillVisible = currentRequestMatches(requestGeneration, requestRatingKey);
        if (error) {
          if (requestStillVisible) { call(shell.showMessage, t('status.updateError')); }
          return;
        }
        call(transitions.onWatchedChanged, requestRatingKey, watched);
        if (!requestStillVisible) { return; }
        controller.patchCurrentDetail({ viewed: watched, viewOffset: 0, progress: 0 });
        if (controllerSnapshot().selectedItem && String(controllerSnapshot().selectedItem.ratingKey || '') === String(requestRatingKey)) {
          controller.patchSelectedItem({ viewed: watched, viewOffset: 0, progress: 0 });
        }
        setText('detail-watched', watched ? t('detail.markUnwatched') : t('detail.markWatched'));
        if (controllerSnapshot().seriesContext && controllerSnapshot().seriesContext.episodes[controllerSnapshot().episodeIndex]) {
          controller.patchEpisode(controllerSnapshot().episodeIndex, { viewed: watched, viewOffset: 0, progress: 0 });
          renderEpisodeStrip();
          updateFocus();
        }
      }));
      return true;
    }

    function metadataRefreshKeys(detail) {
      if (!detail) { return []; }
      if (detail.type === 'episode') { return [detail.ratingKey, detail.seasonRatingKey, detail.showRatingKey]; }
      if (detail.type === 'season') { return [detail.ratingKey, detail.showRatingKey]; }
      return [detail.ratingKey];
    }

    function ratingKeyIndex(items, ratingKey, fallback) {
      var index;
      for (index = 0; index < (items || []).length; index += 1) {
        if (String(items[index].ratingKey || '') === String(ratingKey || '')) { return index; }
      }
      return Math.max(0, Math.min((items || []).length - 1, Number(fallback || 0)));
    }

    function currentRefreshTargetIsVisible(refreshContext) {
      return currentView() === 'detail' && currentDetail() && String(currentDetail().ratingKey || '') === refreshContext.targetKey;
    }

    function applyReloadedSeriesContext(context, refreshContext) {
      if (!context || !currentRefreshTargetIsVisible(refreshContext)) { return; }
      controller.setSeriesContext(context);
      controller.setFocus({
        seasonIndex: ratingKeyIndex(context.seasons, refreshContext.seasonKey, controllerSnapshot().seasonIndex),
        episodeIndex: ratingKeyIndex(context.episodes, refreshContext.episodeKey, controllerSnapshot().episodeIndex)
      });
      episodeView.setContext(context, {
        seasonKey: context.seasons[controllerSnapshot().seasonIndex] && context.seasons[controllerSnapshot().seasonIndex].ratingKey,
        episodeKey: context.episodes[controllerSnapshot().episodeIndex] && context.episodes[controllerSnapshot().episodeIndex].ratingKey
      });
      updateFocus();
    }

    function reloadCurrentMetadataLevel(key, refreshContext, callback) {
      var token = currentToken();
      if (String(key) === refreshContext.targetKey) {
        trackRequest(PlexClient.loadMetadata(config, refreshContext.targetKey, function (error, detail) {
          if (!tokenIsCurrent(token)) { return; }
          if (error) { callback(error); return; }
          refreshContext.detail = detail;
          if (currentRefreshTargetIsVisible(refreshContext)) { renderDetail(detail); }
          if (detail.type !== 'show' && detail.type !== 'season') { callback(null); return; }
          trackRequest(PlexClient.loadSeriesContext(config, detail, function (contextError, context) {
            if (!tokenIsCurrent(token)) { return; }
            if (!contextError) { applyReloadedSeriesContext(context, refreshContext); }
            callback(contextError || null);
          }));
        }));
        return;
      }
      trackRequest(PlexClient.loadSeriesContext(config, refreshContext.detail, function (error, context) {
        if (!tokenIsCurrent(token)) { return; }
        if (!error) { applyReloadedSeriesContext(context, refreshContext); }
        callback(error || null);
      }));
    }

    function hideMetadataStatus() {
      if (controller.clearMetadataStatusTimer) { controller.clearMetadataStatusTimer(); }
      if (controller.setMetadataStatusTemporary) { controller.setMetadataStatusTemporary(false); }
      if (node('detail-metadata-status')) { node('detail-metadata-status').className = 'detail-metadata-status is-hidden'; }
    }

    function showMetadataStatus(text, temporary) {
      if (controller.clearMetadataStatusTimer) { controller.clearMetadataStatusTimer(); }
      if (controller.setMetadataStatusTemporary) { controller.setMetadataStatusTemporary(temporary === true); }
      setText('detail-metadata-status', text);
      if (node('detail-metadata-status')) { node('detail-metadata-status').className = 'detail-metadata-status'; }
      if (temporary && controller.scheduleMetadataStatus) { controller.scheduleMetadataStatus(hideMetadataStatus, 2200); }
    }

    function refreshCurrentMetadata() {
      var current = controllerSnapshot();
      var currentSeason = current.seriesContext && current.seriesContext.seasons[current.seasonIndex];
      var currentEpisode = current.seriesContext && current.seriesContext.episodes[current.episodeIndex];
      var refreshContext;
      if (!current.currentDetail || !current.currentDetail.ratingKey || current.refreshPending) { return false; }
      refreshContext = {
        targetKey: String(current.currentDetail.ratingKey),
        detail: current.currentDetail,
        seasonKey: currentSeason ? currentSeason.ratingKey : current.currentDetail.seasonRatingKey,
        episodeKey: currentEpisode ? currentEpisode.ratingKey : current.currentDetail.ratingKey
      };
      showMetadataStatus(t('status.refreshing'));
      controller.refresh(metadataRefreshKeys(current.currentDetail), function (key, callback) {
        reloadCurrentMetadataLevel(key, refreshContext, callback);
      }, function (error) {
        if (currentView() === 'detail' && currentDetail() && String(currentDetail().ratingKey) === refreshContext.targetKey) {
          showMetadataStatus(error ? t('status.updateError') : t('status.refreshComplete'), true);
        }
        if (currentView() === 'detail') { updateFocus(); }
      });
      return true;
    }

    function selectedIndex(items) {
      var index;
      for (index = 0; index < (items || []).length; index += 1) { if (items[index].selected) { return index; } }
      return 0;
    }

    function animateSeasonContent(elementId) {
      var target = node(elementId);
      var token = currentToken();
      if (!target) { return; }
      target.className = String(target.className || '').replace(/\s*is-season-updating/g, '');
      target.offsetWidth;
      target.className += ' is-season-updating';
      schedule(function () {
        if (tokenIsCurrent(token)) { target.className = String(target.className || '').replace(/\s*is-season-updating/g, ''); }
      }, animationDuration(220));
    }

    function animateEntry() {
      var view = node('detail-view');
      var token = currentToken();
      if (!view) { return; }
      view.className = String(view.className || '').replace(/\s*is-entering/g, '');
      view.offsetWidth;
      view.className += ' is-entering';
      schedule(function () {
        if (tokenIsCurrent(token)) { view.className = String(view.className || '').replace(/\s*is-entering/g, ''); }
      }, animationDuration(220));
    }

    function revealSurface() {
      var view = node('detail-view');
      var awaitingMetadata = view && String(view.className || '').indexOf('is-awaiting-metadata') !== -1;
      setDetailViewMode(true);
      call(transitions.hideBrowsingSurfaces);
      if (view) { view.className = 'detail-view' + (awaitingMetadata ? ' is-awaiting-metadata' : ''); }
      updateFocus();
    }

    function finishTransition() {
      revealSurface();
      if (!animationsEnabled()) {
        if (document.body) { document.body.className = String(document.body.className || '').replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing/g, ''); }
        return;
      }
      if (document.body) {
        document.body.className = String(document.body.className || '').replace(/\s*is-detail-transitioning/g, '') + ' is-detail-transition-revealing';
      }
      controller.beginTransitionEnd(animationDuration(200), function () {
        if (document.body) { document.body.className = String(document.body.className || '').replace(/\s*is-detail-transition-revealing/g, ''); }
      });
    }

    function completeTransition() {
      var view = node('detail-view');
      if (view) { view.className = String(view.className || '').replace(/\s*is-awaiting-metadata/g, ''); }
    }

    function transitionToSurface() {
      controller.cancelTransitions();
      if (document.body) {
        document.body.className = String(document.body.className || '').replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '');
      }
      if (!animationsEnabled()) { finishTransition(); return; }
      if (document.body) { document.body.className += ' is-detail-transitioning'; }
      controller.beginTransition(animationDuration(200), function () {
        if (currentView() === 'detail') { finishTransition(); }
      });
    }

    function placeholderFor(item) {
      var mediaTitle = call(shell.mediaTitle, item) || item && item.title || '';
      var mediaMeta = call(shell.mediaMeta, item) || item && item.meta || '';
      var mediaDetail = call(shell.mediaDetail, item) || item && item.detail || '';
      return {
        themeLookupKey: item && item.themeLookupKey,
        themeKey: item && item.themeKey,
        themeUrl: item && item.themeUrl,
        type: item && item.type,
        title: mediaTitle,
        subtitle: mediaMeta + (mediaDetail ? ' - ' + mediaDetail : ''),
        facts: '',
        summary: '',
        image: item && item.image,
        art: item && (item.art || item.image)
      };
    }

    function beginOpen(item, returnView, visible, openOptions) {
      entered = true;
      featureGeneration += 1;
      abortRequests();
      clearFeatureTimers();
      pendingProgress = null;
      prepareTransition(item);
      controller.open(item, { returnView: returnView, fromContinueWatching: openOptions && openOptions.fromContinueWatching === true });
      call(transitions.enterDetail, returnView, item);
      if (visible === false) {
        setDetailViewMode(false);
        if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
      } else {
        if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden is-awaiting-metadata'; }
        transitionToSurface();
      }
      return currentToken();
    }

    function completePendingPlay() {
      if (!controllerSnapshot().playPending || currentView() !== 'detail') { return false; }
      controller.requestPlayback({ resume: false });
      return true;
    }

    function renderSeriesContext(context, detail, callback) {
      var seasonIndex = selectedIndex(context.seasons);
      var episodeIndex = selectedIndex(context.episodes);
      controller.setSeriesContext(context);
      controller.setFocus({ seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      episodeView.setContext(context);
      updateFocus();
      if (detail.type !== 'episode' && context.episodes.length) {
        loadEpisodeDetail(context.episodes[controllerSnapshot().episodeIndex], callback);
      } else {
        queueMediaProfile(detail);
        if (callback) { callback(detail); }
      }
    }

    function loadSelectedDetail(item) {
      var token = currentToken();
      controller.loadSelected(item, function (error, detail) {
        if (!tokenIsCurrent(token) || currentView() !== 'detail' || !controllerSnapshot().selectedItem || String(controllerSnapshot().selectedItem.ratingKey || '') !== String(item.ratingKey || '')) { return; }
        if (error || !detail) {
          call(shell.showViewState, 'error', 'detail', function () {
            call(shell.hideViewState);
            loadSelectedDetail(item);
          }, close);
          completeTransition();
          return;
        }
        renderDetail(detail, true);
        call(shell.hideViewState);
        animateEntry();
        completeTransition();
        trackRequest(PlexClient.loadSeriesContext(config, detail, function (seriesError, context) {
          if (!tokenIsCurrent(token) || currentView() !== 'detail' || !currentDetail() || String(currentDetail().ratingKey) !== String(detail.ratingKey)) { return; }
          if (!seriesError && context) { renderSeriesContext(context, detail, completePendingPlay); }
          else { queueMediaProfile(detail); completePendingPlay(); }
        }));
      });
    }

    function open(item, openOptions) {
      var optionsValue = openOptions || {};
      var sourceView = optionsValue.returnView || currentView();
      var returnView = sourceView === 'search' ? 'search' : (sourceView === 'library' ? 'library' : (sourceView === 'watchlist' ? 'watchlist' : 'home'));
      if (!active() || !item || !item.ratingKey) { return false; }
      beginOpen(item, returnView, optionsValue.visible !== false, optionsValue);
      renderDetail(placeholderFor(item));
      if (node('detail-play')) {
        node('detail-play').className = 'detail-action is-focused';
        if (node('detail-play').focus) { node('detail-play').focus(); }
      }
      call(shell.hideViewState);
      loadSelectedDetail(item);
      return true;
    }

    function openLoaded(detail, openOptions) {
      var optionsValue = openOptions || {};
      var sourceView = optionsValue.returnView || currentView();
      var returnView = sourceView === 'search' ? 'search' : (sourceView === 'library' ? 'library' : (sourceView === 'watchlist' ? 'watchlist' : 'home'));
      var selectedItem = optionsValue.selectedItem || detail;
      var token;
      if (!active() || !detail || !detail.ratingKey) { return false; }
      token = beginOpen(selectedItem, returnView, optionsValue.visible !== false, optionsValue);
      controller.setCurrentDetail(detail);
      controller.setSelectedItem(selectedItem);
      renderDetail(detail, optionsValue.deferMediaProfile === true);
      if (optionsValue.context) {
        renderSeriesContext(optionsValue.context, detail, optionsValue.playImmediately ? function () { controller.requestPlayback({ resume: false }); } : null);
      } else if (optionsValue.skipSeriesLoad) {
        if (optionsValue.playImmediately) { controller.requestPlayback({ resume: false }); }
      } else {
        trackRequest(PlexClient.loadSeriesContext(config, detail, function (error, context) {
          if (!tokenIsCurrent(token) || !currentDetail() || String(currentDetail().ratingKey || '') !== String(detail.ratingKey || '')) { return; }
          if (detail.type === 'show' && (error || !context)) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
          if (!error && context) {
            if (detail.type === 'show' && !context.episodes.length) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
            renderSeriesContext(context, detail, optionsValue.playImmediately ? function () { controller.requestPlayback({ resume: false }); } : null);
            return;
          }
          if (optionsValue.playImmediately) { controller.requestPlayback({ resume: false }); }
        }));
      }
      updateFocus();
      return true;
    }

    function browsingView(view) { return view === 'home' || view === 'search' || view === 'library' || view === 'watchlist'; }

    function playItem(item, playOptions) {
      var sourceView = currentView();
      var token = currentToken();
      var optionsValue = playOptions || {};
      if (!active() || !item || !item.ratingKey || !browsingView(sourceView)) { return false; }
      if (item.type === 'season') {
        trackRequest(PlexClient.loadSeasonEpisodes(config, item.ratingKey, '', function (error, episodes) {
          var index;
          if (!tokenIsCurrent(token) || currentView() !== sourceView) { return; }
          if (error || !episodes.length) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
          index = selectedIndex(episodes);
          trackRequest(PlexClient.loadMetadata(config, episodes[index].ratingKey, function (metadataError, detail) {
            if (!tokenIsCurrent(token) || currentView() !== sourceView) { return; }
            if (metadataError || !detail) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
            openLoaded(detail, { returnView: sourceView, selectedItem: item, playImmediately: true, fromContinueWatching: optionsValue.fromContinueWatching === true });
          }));
        }, item.year));
        return true;
      }
      trackRequest(PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
        if (!tokenIsCurrent(token) || currentView() !== sourceView) { return; }
        if (error || !detail) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
        openLoaded(detail, { returnView: sourceView, selectedItem: item, playImmediately: true, fromContinueWatching: optionsValue.fromContinueWatching === true });
      }));
      return true;
    }

    function loadEpisodeDetail(episode, callback, animateSeason) {
      var ratingKey = String(episode && episode.ratingKey || '');
      return controller.loadEpisode(episode, function (error, detail) {
        if (error || !detail || currentView() !== 'detail') { return; }
        if (animateSeason) { controller.setSeasonTransitionMediaKey(ratingKey); }
        renderDetail(detail);
        if (animateSeason) { animateSeasonContent('detail-copy'); }
        if (callback) { callback(detail); }
      });
    }

    function playSelectedEpisode(episode) {
      return loadEpisodeDetail(episode, function () {
        renderEpisodeStrip();
        controller.requestPlayback({ resume: false });
      });
    }

    function renderSeasonTabs() { episodeView.setSeasonIndex(controllerSnapshot().seasonIndex, true); }
    function renderEpisodeStrip() { episodeView.setEpisodeIndex(controllerSnapshot().episodeIndex, true); }
    function renderEpisodeContext() { renderSeasonTabs(); renderEpisodeStrip(); return true; }
    function updateEpisodeCardsPlaybackState() { episodeView.refreshPlaybackCards(); }

    function scheduleEpisodeDetail() {
      controller.scheduleEpisodePreview(function (episode) { loadEpisodeDetail(episode, null, true); }, 180);
    }

    function scheduleSeasonPreview() {
      var token = currentToken();
      controller.scheduleSeasonPreview(function (season, callback) {
        return trackRequest(PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', callback, season.year));
      }, function (error, episodes, _season, seasonIndex) {
        if (!tokenIsCurrent(token) || error || currentView() !== 'detail' || controllerSnapshot().zone !== 'seasons' || seasonIndex !== controllerSnapshot().seasonIndex) { return; }
        controller.selectSeason(seasonIndex);
        controller.setEpisodes(episodes, selectedIndex(episodes));
        episodeView.setEpisodes(episodes, episodes[controllerSnapshot().episodeIndex] && episodes[controllerSnapshot().episodeIndex].ratingKey);
        renderSeasonTabs();
        renderEpisodeStrip();
        animateSeasonContent('episode-strip');
        updateFocus();
        if (episodes.length) { loadEpisodeDetail(episodes[controllerSnapshot().episodeIndex], null, true); }
      }, 200);
    }

    function loadSelectedSeason() {
      var current = controllerSnapshot();
      var season = current.seriesContext && current.seriesContext.seasons[current.seasonIndex];
      var token = currentToken();
      if (!season) { return false; }
      trackRequest(PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        if (!tokenIsCurrent(token) || error || currentView() !== 'detail') { return; }
        controller.selectSeason(controllerSnapshot().seasonIndex);
        controller.setEpisodes(episodes, selectedIndex(episodes));
        episodeView.setEpisodes(episodes, episodes[controllerSnapshot().episodeIndex] && episodes[controllerSnapshot().episodeIndex].ratingKey);
        controller.setFocus({ zone: 'episodes', episodeIndex: controllerSnapshot().episodeIndex });
        renderSeasonTabs();
        renderEpisodeStrip();
        updateFocus();
        if (episodes.length) {
          animateSeasonContent('episode-strip');
          loadEpisodeDetail(episodes[controllerSnapshot().episodeIndex], null, true);
        }
      }, season.year));
      return true;
    }

    function navigate(direction) {
      var current = controllerSnapshot();
      var presentation = presentationView.snapshot();
      return controller.navigate(direction, {
        hasSeries: !!current.seriesContext,
        actionCount: 4,
        seasonCount: current.seriesContext ? current.seriesContext.seasons.length : 0,
        episodeCount: current.seriesContext ? current.seriesContext.episodes.length : 0,
        choiceZones: detailChoiceZones(),
        summaryOverflowing: presentation.summaryOverflowing
      });
    }

    function onFocusChanged(focus, effect) {
      if (effect === 'nav-left' || effect === 'nav-right') { call(shell.moveNavigation, effect); }
      else if (effect === 'season-preview') { renderSeasonTabs(); scheduleSeasonPreview(); }
      else if (effect === 'episode-preview') {
        episodeView.setEpisodeIndex(focus.episodeIndex, false);
        episodeView.refreshSelection();
        scheduleEpisodeDetail();
      } else if (effect && effect.indexOf('cycle-') === 0) {
        if (focus.zone === 'version') { cycleVersion(effect.indexOf('-left') !== -1 ? -1 : 1); }
        else { cycleTrack(focus.zone, effect.indexOf('-left') !== -1 ? -1 : 1); }
      }
      updateFocus();
    }

    function updateFocus() {
      var current = controllerSnapshot();
      var target = null;
      call(shell.clearFocus);
      if (current.zone === 'nav') { target = call(shell.navigationTarget, call(shell.navigationIndex)); }
      else if (current.zone === 'seasons' && document.querySelector) { target = document.querySelector('[data-season-position="' + current.seasonIndex + '"]'); }
      else if (current.zone === 'episodes' && document.querySelector) { target = document.querySelector('[data-episode-position="' + current.episodeIndex + '"]'); }
      else if (current.zone === 'audio') { target = node('detail-audio'); }
      else if (current.zone === 'subtitles') { target = node('detail-subtitles'); }
      else if (current.zone === 'version') { target = node('detail-version'); }
      else if (current.zone === 'summary') { target = node('detail-summary-button'); }
      else { target = node(['detail-play', 'detail-watched', 'detail-watchlist', 'detail-options'][Number(current.actionIndex || 0)]); }
      if (target) {
        if (String(target.className || '').indexOf('is-focused') === -1) { target.className = String(target.className || '') + ' is-focused'; }
        if (call(statePort.pointerSelectionActive) !== true && target.focus) { target.focus(); }
      }
      episodeView.startTitlePan(target);
      return target;
    }

    function pointerFocus(zone, index) {
      if (!active()) { return false; }
      if (zone === 'season') { controller.setFocus({ zone: 'seasons', seasonIndex: Number(index || 0) }); }
      else if (zone === 'episode') { controller.setFocus({ zone: 'episodes', episodeIndex: Number(index || 0) }); }
      else if (zone === 'play') { controller.setFocus({ zone: 'play', actionIndex: Number(index || 0) }); }
      else { controller.setFocus({ zone: zone }); }
      updateFocus();
      return true;
    }


    function focusNavigation() { controller.setFocus({ zone: 'nav' }); return updateFocus(); }
    function updateSummaryOverflow() { return presentationView.updateSummaryOverflow(); }
    function summaryOpen() { return !!presentationView.snapshot().summaryDialogOpen; }
    function scrollSummary(direction) { return presentationView.scrollSummary(direction); }

    function mediaInfoModel(profile) {
      if (!profile || !modules.MediaInfo || typeof modules.MediaInfo.create !== 'function') { return null; }
      return modules.MediaInfo.create(profile, resolvedTracksForProfile(profile) || {}, t);
    }

    function openVersionDetails() {
      var versions = detailMediaVersions();
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var override = preferenceState.override;
      var automatic = selectedMediaProfile();
      var choices = [];
      var selectedValue;
      var index;
      var version;
      var value;
      if (!versions.length || !automatic || !dialogs.openMediaVersions) { return false; }
      selectedValue = override && override.mediaIndex !== null ? String(override.mediaIndex) + ':' + String(override.partIndex || 0) : 'auto';
      if (versions.length === 1) {
        choices.push({
          value: selectedValue,
          label: mediaVersionLabel(automatic, selectedValue === 'auto'),
          model: mediaInfoModel(automatic)
        });
      } else {
        choices.push({ value: 'auto', label: mediaVersionLabel(automatic, true), model: mediaInfoModel(automatic) });
        for (index = 0; index < versions.length; index += 1) {
          version = versions[index];
          value = modules.MediaChoiceModel.versionValue(version);
          choices.push({ value: value, label: mediaVersionLabel(version, false), model: mediaInfoModel(version) });
        }
      }
      return call(dialogs.openMediaVersions, {
        choices: choices,
        selectedValue: selectedValue,
        apply: function (choice) {
          var selected = choice && choice.value === 'auto' ? null : modules.MediaChoiceModel.findVersion(versions, choice && choice.value);
          setPlaybackVersion(selected ? selected.mediaIndex : null, selected ? selected.partIndex : null);
        }
      }, 'detail') !== false;
    }

    function currentSeason() {
      var current = controllerSnapshot();
      return current.seriesContext && current.seriesContext.seasons[current.seasonIndex] || null;
    }

    function syncSeasonPlaybackState(episodes) {
      var current = controllerSnapshot();
      var currentEpisode = current.seriesContext && current.seriesContext.episodes[current.episodeIndex];
      var selectedKey = currentEpisode && currentEpisode.ratingKey || current.currentDetail && current.currentDetail.ratingKey || '';
      var index;
      var fresh;
      if (!current.seriesContext || !episodes || !episodes.length) { return false; }
      index = ratingKeyIndex(episodes, selectedKey, current.episodeIndex);
      controller.setEpisodes(episodes, index);
      fresh = episodes[index] || null;
      episodeView.setEpisodes(episodes, fresh && fresh.ratingKey);
      if (fresh && currentDetail() && String(currentDetail().ratingKey || '') === String(fresh.ratingKey || '')) {
        controller.patchCurrentDetail({ viewed: !!fresh.viewed, viewOffset: Number(fresh.viewOffset || 0), progress: Number(fresh.progress || 0) });
        setText('detail-watched', fresh.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      }
      if (fresh && controllerSnapshot().selectedItem && String(controllerSnapshot().selectedItem.ratingKey || '') === String(fresh.ratingKey || '')) {
        controller.patchSelectedItem({ viewed: !!fresh.viewed, viewOffset: Number(fresh.viewOffset || 0), progress: Number(fresh.progress || 0) });
      }
      renderSeasonTabs();
      renderEpisodeStrip();
      updateEpisodeCardsPlaybackState();
      updateFocus();
      return true;
    }

    function finishSeasonBulk(season, watched, total, failures) {
      var token = currentToken();
      trackRequest(PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        seasonBulkPending = false;
        if (node('detail-options')) { node('detail-options').disabled = false; }
        if (tokenIsCurrent(token) && currentView() === 'detail' && !error) { syncSeasonPlaybackState(episodes || []); }
        if (!tokenIsCurrent(token) || currentView() !== 'detail') { return; }
        if (error) { call(shell.showMessage, t('status.updateError')); return; }
        if (failures > 0) { call(shell.showMessage, t('detail.seasonBulkPartial', { count: failures })); }
        else { call(shell.showMessage, t(watched ? 'detail.seasonWatchedComplete' : 'detail.seasonUnwatchedComplete', { count: total })); }
      }, season.year));
    }

    function applySeasonWatched(watched) {
      var season = currentSeason();
      var token = currentToken();
      if (!season || seasonBulkPending || typeof PlexClient.loadSeasonEpisodes !== 'function' || typeof PlexClient.setWatchedAndReset !== 'function') { return false; }
      seasonBulkPending = true;
      if (node('detail-options')) { node('detail-options').disabled = true; }
      trackRequest(PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        var index = 0;
        var failures = 0;
        var source = episodes || [];
        function next() {
          var episode;
          if (!tokenIsCurrent(token)) { seasonBulkPending = false; return; }
          if (index >= source.length) { finishSeasonBulk(season, watched, source.length, failures); return; }
          episode = source[index];
          index += 1;
          if (!episode || !episode.ratingKey) { failures += 1; next(); return; }
          trackRequest(PlexClient.setWatchedAndReset(config, episode.ratingKey, watched, function (watchedError) {
            if (watchedError) { failures += 1; }
            else { call(transitions.onWatchedChanged, episode.ratingKey, watched); }
            next();
          }));
        }
        if (error || !source.length) {
          seasonBulkPending = false;
          if (node('detail-options')) { node('detail-options').disabled = false; }
          if (tokenIsCurrent(token) && currentView() === 'detail') { call(shell.showMessage, error ? t('status.updateError') : t('status.mediaUnavailable')); }
          return;
        }
        next();
      }, season.year));
      return true;
    }

    function confirmSeasonWatched(watched) {
      var current = controllerSnapshot();
      var season = currentSeason();
      var count = current.seriesContext && current.seriesContext.episodes ? current.seriesContext.episodes.length : 0;
      var key = watched ? 'detail.markSeasonWatched' : 'detail.markSeasonUnwatched';
      if (!season) { return false; }
      return call(dialogs.openChoice,
        t(watched ? 'detail.markSeasonWatchedConfirm' : 'detail.markSeasonUnwatchedConfirm', { count: count }),
        [{ value: watched ? 'watched' : 'unwatched', label: t(key) }],
        '',
        function () { applySeasonWatched(watched); },
        updateFocus
      ) !== false;
    }

    function removeContinueWatching() {
      var detailState = controllerSnapshot();
      var detail = currentDetail() || detailState.selectedItem;
      var token = currentToken();
      var target;
      if (!detailState.fromContinueWatching || !detail || !detail.ratingKey || !data.mediaContext || typeof data.mediaContext.removeFromContinueWatching !== 'function') { return false; }
      target = { item: detail, view: 'detail', inContinueWatching: true };
      return call(data.mediaContext.removeFromContinueWatching, target, function (error) {
        if (!error && tokenIsCurrent(token) && controller.setFromContinueWatching) { controller.setFromContinueWatching(false); }
      }) !== false;
    }

    function openDetailOptions() {
      var detailState = controllerSnapshot();
      var season = currentSeason();
      var choices = [];
      if (season) {
        choices.push({ value: 'season-watched', label: t('detail.markSeasonWatched') });
        choices.push({ value: 'season-unwatched', label: t('detail.markSeasonUnwatched') });
      }
      if (detailState.fromContinueWatching) { choices.push({ value: 'remove-continue', label: t('mediaActions.removeContinue') }); }
      choices.push({ value: 'refresh-metadata', label: t('detail.refreshMetadata') });
      return call(dialogs.openChoice, t('detail.mediaOptions'), choices, '', function (choice) {
        if (!choice) { return; }
        if (choice.value === 'season-watched') { confirmSeasonWatched(true); }
        else if (choice.value === 'season-unwatched') { confirmSeasonWatched(false); }
        else if (choice.value === 'remove-continue') { removeContinueWatching(); }
        else if (choice.value === 'refresh-metadata') { refreshCurrentMetadata(); }
      }, updateFocus) !== false;
    }

    function applyLocalPlaybackProgress(ratingKey, seconds) {
      var offset = Math.max(0, Math.round(Number(seconds || 0) * 1000));
      var episode;
      var index;
      if (!ratingKey || !offset) { return false; }
      pendingProgress = { ratingKey: String(ratingKey), viewOffset: offset, expiresAt: new Date().getTime() + 6000 };
      if (currentDetail() && String(currentDetail().ratingKey || '') === pendingProgress.ratingKey) {
        controller.patchCurrentDetail({
          viewOffset: offset,
          progress: currentDetail().duration ? Math.min(1, offset / Number(currentDetail().duration)) : currentDetail().progress
        });
      }
      for (index = 0; controllerSnapshot().seriesContext && index < controllerSnapshot().seriesContext.episodes.length; index += 1) {
        episode = controllerSnapshot().seriesContext.episodes[index];
        if (String(episode.ratingKey || '') === pendingProgress.ratingKey) {
          controller.patchEpisode(index, {
            viewOffset: offset,
            progress: episode.duration ? Math.min(1, offset / Number(episode.duration)) : episode.progress
          });
        }
      }
      updateEpisodeCardsPlaybackState();
      return true;
    }

    function reconcileEpisodePlaybackState(freshEpisodes) {
      var episode;
      var fresh;
      var index;
      var freshByKey = {};
      for (index = 0; index < (freshEpisodes || []).length; index += 1) {
        freshByKey[String(freshEpisodes[index].ratingKey || '')] = freshEpisodes[index];
      }
      for (index = 0; controllerSnapshot().seriesContext && index < controllerSnapshot().seriesContext.episodes.length; index += 1) {
        episode = controllerSnapshot().seriesContext.episodes[index];
        fresh = freshByKey[String(episode.ratingKey || '')];
        if (!fresh) { continue; }
        if (pendingProgress && pendingProgress.expiresAt > new Date().getTime() && String(fresh.ratingKey || '') === pendingProgress.ratingKey) {
          if (Number(fresh.viewOffset || 0) + 2000 < pendingProgress.viewOffset) {
            fresh.viewOffset = pendingProgress.viewOffset;
            fresh.progress = fresh.duration ? Math.min(1, fresh.viewOffset / Number(fresh.duration)) : fresh.progress;
          } else { pendingProgress = null; }
        }
        if (currentDetail() && String(currentDetail().ratingKey || '') === String(episode.ratingKey || '')) {
          controller.patchCurrentDetail({ viewed: fresh.viewed, viewOffset: fresh.viewOffset, duration: fresh.duration, progress: fresh.progress });
          setText('detail-watched', fresh.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
        }
      }
      episodeView.reconcilePlayback(freshEpisodes);
    }

    function episodeListMatchesCurrent(freshEpisodes) {
      var current = controllerSnapshot();
      var currentEpisodes = current.seriesContext && current.seriesContext.episodes || [];
      var index;
      if (currentEpisodes.length !== (freshEpisodes || []).length) { return false; }
      for (index = 0; index < currentEpisodes.length; index += 1) {
        if (String(currentEpisodes[index].ratingKey || '') !== String(freshEpisodes[index] && freshEpisodes[index].ratingKey || '')) { return false; }
      }
      return true;
    }

    function hydratePlaybackSeason(freshEpisodes, ratingKey) {
      var selectedKey = String(ratingKey || currentDetail() && currentDetail().ratingKey || '');
      var episodeIndex;
      if (episodeListMatchesCurrent(freshEpisodes)) { return false; }
      episodeIndex = ratingKeyIndex(freshEpisodes, selectedKey, controllerSnapshot().episodeIndex);
      controller.setEpisodes(freshEpisodes, episodeIndex);
      episodeView.setEpisodes(freshEpisodes, selectedKey);
      renderEpisodeStrip();
      return true;
    }

    function refreshPlaybackState(ratingKey, _expectedSeconds, retried) {
      var current = controllerSnapshot();
      var season;
      var seasonKey;
      var token = currentToken();
      if (currentView() !== 'detail' || !current.seriesContext || !current.seriesContext.seasons.length) { return false; }
      season = current.seriesContext.seasons[current.seasonIndex];
      seasonKey = season && String(season.ratingKey || '');
      if (!seasonKey) { return false; }
      trackRequest(PlexClient.loadSeasonEpisodes(config, seasonKey, ratingKey || '', function (error, episodes) {
        var latest = controllerSnapshot();
        var activeSeason = latest.seriesContext && latest.seriesContext.seasons[latest.seasonIndex];
        if (!tokenIsCurrent(token) || error || currentView() !== 'detail' || !activeSeason || String(activeSeason.ratingKey || '') !== seasonKey) { return; }
        hydratePlaybackSeason(episodes, ratingKey);
        reconcileEpisodePlaybackState(episodes);
        updateEpisodeCardsPlaybackState();
        if (!retried && pendingProgress && String(pendingProgress.ratingKey) === String(ratingKey || '') && pendingProgress.expiresAt > new Date().getTime()) {
          schedule(function () { refreshPlaybackState(ratingKey, _expectedSeconds, true); }, 650);
        }
      }));
      return true;
    }

    function queueSnapshot() {
      var current = boundarySnapshot();
      return {
        currentDetail: current.currentDetail || null,
        seriesContext: current.seriesContext || null,
        seasonIndex: Number(current.seasonIndex || 0),
        episodeIndex: Number(current.episodeIndex || 0)
      };
    }


    function setPlaybackContext(detail, item, context, seasonIndex, episodeIndex) {
      if (!active()) { return controllerSnapshot(); }
      if (detail || item || context) { entered = true; }
      controller.setCurrentDetail(detail || null);
      controller.setSelectedItem(item || detail || null);
      if (context) { controller.setSeriesContext(context); }
      if (seasonIndex !== undefined && controller.selectSeason) { controller.selectSeason(Number(seasonIndex || 0)); }
      if (episodeIndex !== undefined && controller.selectEpisode) { controller.selectEpisode(Number(episodeIndex || 0)); }
      if (context) {
        episodeView.setContext(context);
        episodeView.setSeasonIndex(Number(seasonIndex || 0), true);
        episodeView.setEpisodeIndex(Number(episodeIndex || 0), true);
      }
      return controllerSnapshot();
    }

    function setPlaylistContext(context, index) { return setPlaybackContext(currentDetail(), controllerSnapshot().selectedItem, context, 0, Number(index || 0)); }
    function setPlayPending(pending) { return controller.setPlayPending(pending); }
    function setFocus(focus) { return controller.setFocus(focus); }
    function preferenceSnapshot() { return preferences.snapshot ? preferences.snapshot() : {}; }

    function hideSurface() {
      setDetailViewMode(false);
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
    }

    function showSurface(optionsValue) {
      optionsValue = optionsValue || {};
      if (!currentDetail()) { return false; }
      setDetailViewMode(true);
      if (optionsValue.backLockedUntil !== undefined) { controller.setBackLockedUntil(Number(optionsValue.backLockedUntil || 0)); }
      if (node('detail-view')) { node('detail-view').className = 'detail-view'; }
      if (optionsValue.ensureMediaProfile === true) { ensureMediaProfile(currentDetail()); }
      if (optionsValue.renderEpisodeContext === true) { renderEpisodeContext(); }
      updateFocus();
      if (optionsValue.restoreTheme !== false) { call(shell.scheduleTheme, currentDetail()); }
      return true;
    }

    function resumeAfterPlayer(backLockedUntil) {
      return showSurface({
        backLockedUntil: Number(backLockedUntil || 0),
        ensureMediaProfile: true,
        renderEpisodeContext: true,
        restoreTheme: true
      });
    }

    function onWatchlistChanged() {
      if (currentView() !== 'detail' || !currentDetail()) { return false; }
      syncWatchlist();
      renderWatchlist();
      return true;
    }

    function recoverAfterNetwork() {
      var selected = controllerSnapshot().selectedItem;
      if (currentView() !== 'detail' || !selected) { return false; }
      loadSelectedDetail(selected);
      return true;
    }

    function handleKey(event, direction) {
      var result;
      if (!active() || !controller.handleKey) { return false; }
      result = controller.handleKey(event, direction);
      return result === true || !!(result && result.handled === true);
    }

    function cleanupPresentation() {
      if (document.body) {
        document.body.className = String(document.body.className || '').replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '');
        document.body.className = document.body.className.replace(/\s*is-movie-detail/g, '');
      }
      call(shell.hideViewState);
      hideMetadataStatus();
      setDetailViewMode(false);
      controller.close();
      episodeView.reset();
      call(shell.cancelImages, 'detail');
      if (node('detail-play')) { node('detail-play').className = 'detail-action'; }
      if (node('detail-refresh-metadata')) { node('detail-refresh-metadata').disabled = false; }
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
    }

    function leave() {
      if (destroyed || !entered) { return controllerSnapshot(); }
      entered = false;
      featureGeneration += 1;
      abortRequests();
      clearFeatureTimers();
      pendingProgress = null;
      lastPresentationKey = '';
      if (controller.cancelTransitions) { controller.cancelTransitions(); }
      cleanupPresentation();
      return controllerSnapshot();
    }

    function finishClose(returnView) {
      leave();
      call(transitions.restoreOrigin, returnView);
    }

    function close() {
      var returnView = controllerSnapshot().returnView || 'home';
      if (!active() || !entered) { return false; }
      if (!animationsEnabled() || !document.body || String(document.body.className || '').indexOf('is-detail-transitioning') !== -1) {
        finishClose(returnView);
        return true;
      }
      controller.cancelTransitions();
      document.body.className = String(document.body.className || '').replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '') + ' is-detail-closing';
      controller.beginTransition(animationDuration(200), function () {
        finishClose(returnView);
        if (!document.body) { return; }
        document.body.className += ' is-detail-returning';
        controller.beginTransitionEnd(animationDuration(200), function () {
          if (document.body) { document.body.className = String(document.body.className || '').replace(/\s*is-detail-returning/g, ''); }
        });
      });
      return true;
    }

    function bindClick(id, handler) {
      var target = node(id);
      if (!target) { return; }
      target.onclick = handler;
      clickTargets.push(target);
    }

    function destroy() {
      var target;
      if (destroyed) { return; }
      leave();
      destroyed = true;
      featureGeneration += 1;
      while (clickTargets.length) { target = clickTargets.pop(); target.onclick = null; }
      if (controller && controller.destroy) { controller.destroy(); }
    }

    presentationView = modules.DetailPresentationView.create({
      root: root,
      document: document,
      setText: setText,
      t: t,
      getZone: function () { return controllerSnapshot().zone; },
      onInvalidZone: function (name) {
        if (name === 'summary') { controller.setFocus({ zone: 'play' }); }
        else { controller.setFocus({ zone: controllerSnapshot().seriesContext ? 'episodes' : 'play' }); }
        updateFocus();
      },
      onDialogClose: function () { if (currentView() === 'detail') { updateFocus(); } }
    });

    episodeView = modules.DetailEpisodeView.create({
      root: root,
      document: document,
      element: shell.element,
      ProgressiveImages: modules.ProgressiveImages,
      posterLoader: call(shell.posterLoader),
      onSeasonActivate: function (index) {
        controller.setFocus({ seasonIndex: episodeView.setSeasonIndex(index, false) });
        loadSelectedSeason();
      },
      onEpisodeActivate: function (index) {
        controller.setFocus({ episodeIndex: episodeView.setEpisodeIndex(index, false) });
        if (controllerSnapshot().seriesContext) { playSelectedEpisode(controllerSnapshot().seriesContext.episodes[controllerSnapshot().episodeIndex]); }
      }
    });

    controller = modules.DetailController.create({
      root: root,
      DetailNavigation: modules.DetailNavigation,
      MetadataRefresh: modules.MetadataRefresh,
      clearPreferences: function () { preferences.clear(); },
      loadMetadata: function (ratingKey, callback) { return trackRequest(call(PlexClient.loadMetadata, config, ratingKey, callback)); },
      preparePreferences: function (identity) { return preferences.prepare(identity); },
      loadMediaProfile: function (ratingKey, callback) { return trackRequest(call(PlexClient.loadMediaProfile, config, ratingKey, callback)); },
      setMediaProfile: function (profile) { return preferences.setProfile(profile); },
      onMediaProfileState: function (current) {
        if (currentView() !== 'detail') { return; }
        renderMediaControls();
        if (!current.mediaProfileLoading && String(current.mediaProfileRatingKey) === String(controllerSnapshot().seasonTransitionMediaKey || '')) {
          controller.setSeasonTransitionMediaKey('');
          animateSeasonContent('detail-playback-controls');
        }
        updateFocus();
      },
      playbackPreferences: playbackPreferences,
      selectedMediaProfile: selectedMediaProfile,
      resolvedTracks: resolvedTracks,
      requestPlayback: function (request) { return call(transitions.requestPlayback, request); },
      refreshMetadata: function (key, callback) { return trackRequest(call(PlexClient.refreshMetadata, config, key, callback)); },
      waitForActivity: data.waitForActivity,
      onRefreshPending: function (pending) { if (node('detail-options')) { node('detail-options').disabled = pending === true; } },
      onFocusChanged: onFocusChanged,
      mediaInfoOpen: dialogs.mediaInfoOpen,
      handleMediaInfoKey: dialogs.handleMediaInfoKey,
      summaryOpen: summaryOpen,
      closeSummary: presentationView.closeSummary,
      scrollSummary: presentationView.scrollSummary,
      playEpisode: playSelectedEpisode,
      openPlayer: function () { return controller.requestPlayback({ resume: false }); },
      closeDetail: close,
      navigate: navigate,
      activateNavigation: shell.activateNavigation,
      loadSeason: loadSelectedSeason,
      openChoice: openChoice,
      openVersionDetails: openVersionDetails,
      openSummary: presentationView.openSummary,
      toggleWatched: toggleWatched,
      toggleWatchlist: toggleWatchlist,
      refreshCurrentMetadata: refreshCurrentMetadata,
      openDetailOptions: openDetailOptions,
      now: function () { return new Date().getTime(); }
    });

    bindClick('detail-play', function () { controller.requestPlayback({ resume: false }); });
    bindClick('detail-watched', toggleWatched);
    bindClick('detail-watchlist', toggleWatchlist);
    bindClick('detail-options', openDetailOptions);
    bindClick('detail-audio', function () { openChoice('audio'); });
    bindClick('detail-subtitles', function () { openChoice('subtitles'); });
    bindClick('detail-version', openVersionDetails);
    bindClick('detail-summary-button', presentationView.openSummary);
    bindClick('detail-summary-dialog-close', presentationView.closeSummary);

    return {
      open: open,
      openLoaded: openLoaded,
      playItem: playItem,
      leave: leave,
      handleKey: handleKey,
      pointerFocus: pointerFocus,
      focusNavigation: focusNavigation,
      updateFocus: updateFocus,
      updateSummaryOverflow: updateSummaryOverflow,
      translateStatic: translateStatic,
      summaryOpen: summaryOpen,
      scrollSummary: scrollSummary,
      showMetadataStatus: showMetadataStatus,
      hideMetadataStatus: hideMetadataStatus,
      onWatchlistChanged: onWatchlistChanged,
      recoverAfterNetwork: recoverAfterNetwork,
      snapshot: snapshot,
      queueSnapshot: queueSnapshot,
      playbackPreferences: playbackPreferences,
      selectedMediaProfile: selectedMediaProfile,
      resolvedTracks: resolvedTracks,
      resolvePlaybackTracks: resolvePlaybackTracks,
      preferenceSnapshot: preferenceSnapshot,
      setTrackPreference: setTrackPreference,
      setPlaybackVersion: setPlaybackVersion,
      saveMediaOverride: saveMediaOverride,
      queueMediaProfile: queueMediaProfile,
      applyLocalPlaybackProgress: applyLocalPlaybackProgress,
      refreshPlaybackState: refreshPlaybackState,
      setPlaybackContext: setPlaybackContext,
      setPlaylistContext: setPlaylistContext,
      setPlayPending: setPlayPending,
      setFocus: setFocus,
      hideSurface: hideSurface,
      showSurface: showSurface,
      resumeAfterPlayer: resumeAfterPlayer,
      renderEpisodeContext: renderEpisodeContext,
      destroy: destroy
    };
  }

  return { create: create };
}));

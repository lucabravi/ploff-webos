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
    var storage = platform.storage;
    var data = values.data || {};
    var shell = values.shell || {};
    var watchlist = values.watchlist || {};
    var dialogs = values.dialogs || {};
    var statePort = values.state || {};
    var transitions = values.transitions || {};
    var root = platform.root || {};
    var document = platform.document || {};
    var PlexClient = data.PlexClient || {};
    var sourceRouter = data.sourceRouter;
    var sourceResolver = data.sourceResolver;
    var sourcePreferences = modules.MediaSourcePreference && modules.MediaSourcePreference.create ? modules.MediaSourcePreference.create({ storage: storage }) : null;
    var pendingSourceVersionSelection = null;
    var aggregatedVersionItemKey = '';
    var aggregatedVersionRows = {};
    var aggregatedVersionRequested = {};
    var aggregatedVersionPending = 0;
    var aggregatedVersionWaiters = [];
    var aggregatedVersionGeneration = 0;
    var episodeVariantsRequestedKey = '';
    var seasonVariantsRequestedKey = '';
    var seasonVariantHydrationKey = '';
    var seasonVariantHydrationPending = false;
    var seasonVariantHydrationRequest = null;
    var seasonVariantHydrationWaiters = [];
    var aggregatedSeasonHints = {};
    var aggregatedEpisodeVariants = {};
    var sourceVersionSelection = 0;
    var seasonProfiles = {};
    var seasonEpisodeDetails = {};
    var seasonEpisodeDetailOrder = [];
    var seasonEpisodeDetailLimit = 48;
    var activeSourceContext = null;
    var destroyed = false;
    var entered = false;
    var featureGeneration = 0;
    var directPlayGeneration = 0;
    var lastPresentationKey = '';
    var seasonBulkPending = false;
    var ownedRequests = [];
    var seasonPreviewRequest = null;
    var episodePreviewRequest = null;
    var seasonActivationToken = 0;
    var featureTimers = [];
    var clickTargets = [];
    var preferences = modules.DetailPreferenceState.create({
      MediaPreferences: modules.MediaPreferences,
      MediaProfile: modules.MediaProfile,
      VersionSelection: modules.VersionSelection,
      storage: storage
    });
    var presentationView;
    var episodeView;
    var extendedView;
    var controller;
    var extendedRootDetail = null;
    var extendedRootKey = '';
    var extendedMetadataKey = '';
    var extendedExtrasKey = '';
    var renderedFocusTarget = null;
    var renderedFocusScope = '';

    if (!sourceRouter || typeof sourceRouter.routeFor !== 'function') {
      throw new Error('DetailFeatureController requires sourceRouter');
    }
    if (!sourceResolver || typeof sourceResolver.resolve !== 'function' || typeof sourceResolver.available !== 'function') {
      throw new Error('DetailFeatureController requires sourceResolver');
    }

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
      if (typeof callback === 'function') {
        return arguments.length > 7
          ? callback(arg1, arg2, arg3, arg4, arg5, arg6, arg7)
          : callback(arg1, arg2, arg3, arg4, arg5, arg6);
      }
      return undefined;
    }

    function node(id) { return document && document.getElementById ? document.getElementById(id) : null; }
    function hasFocusedClass(target) { return !!target && (' ' + String(target.className || '') + ' ').indexOf(' is-focused ') !== -1; }
    function focusTargetConnected(target) {
      var rootNode = document && document.documentElement;
      return !!target && (!rootNode || typeof rootNode.contains !== 'function' || rootNode.contains(target));
    }
    function removeFocusedClass(target) {
      if (!target) { return; }
      target.className = String(target.className || '').replace(/(?:^|\s)is-focused(?=\s|$)/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    function releaseRenderedFocus(nextScope) {
      if (renderedFocusScope === nextScope && hasFocusedClass(renderedFocusTarget) && focusTargetConnected(renderedFocusTarget)) {
        removeFocusedClass(renderedFocusTarget);
        return true;
      }
      call(shell.clearFocus);
      return false;
    }
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
    function openOwnedChoice(title, choices, selectedValue, apply, returnFocus) {
      var token = currentToken();
      return call(dialogs.openChoice, title, choices, selectedValue, function (choice) {
        if (!tokenIsCurrent(token)) { return; }
        call(apply, choice);
      }, function () {
        if (!tokenIsCurrent(token)) { return; }
        call(returnFocus);
      });
    }
    function openOwnedMediaVersions(options, origin) {
      var token = currentToken();
      var next = copyRecord(options) || {};
      var apply = next.apply;
      next.apply = function (choice) {
        if (!tokenIsCurrent(token)) { return; }
        call(apply, choice);
      };
      return call(dialogs.openMediaVersions, next, origin);
    }

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

    function copySourceVariants(source) {
      return (source || []).map(function (item) { return copyRecord(item); });
    }

    function sourceOwnedRecord(source) {
      return sourceRouter.decorateItem(source, activeSourceContext || null);
    }

    function sourceOwnedRecords(source) {
      return (source || []).map(function (item) { return sourceOwnedRecord(item); });
    }

    function sourceOwnedSeriesContext(source) {
      var result = copyRecord(source);
      if (!result) { return null; }
      result.seasons = sourceOwnedRecords(source.seasons);
      result.episodes = sourceOwnedRecords(source.episodes);
      return result;
    }

    function recordContainsRatingKey(item, ratingKey, machineIdentifier) {
      var variants = item && item.sourceVariants || [];
      var machine = String(machineIdentifier || '');
      var index;
      if (!item || !ratingKey) { return false; }
      if (String(item.ratingKey || '') === String(ratingKey) &&
          (!machine || String(item.serverMachineIdentifier || '') === machine)) { return true; }
      for (index = 0; index < variants.length; index += 1) {
        if (String(variants[index] && variants[index].ratingKey || '') === String(ratingKey) &&
            (!machine || String(variants[index] && variants[index].serverMachineIdentifier || '') === machine)) { return true; }
      }
      return false;
    }

    function seriesRecordForDetail(detail) {
      var current = controllerSnapshot();
      var context = current.seriesContext;
      var groups = context ? [context.episodes || [], context.seasons || []] : [];
      var machine = String(detail && detail.serverMachineIdentifier || '');
      var groupIndex;
      var itemIndex;
      for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        for (itemIndex = 0; itemIndex < groups[groupIndex].length; itemIndex += 1) {
          if (recordContainsRatingKey(groups[groupIndex][itemIndex], detail && detail.ratingKey, machine)) { return groups[groupIndex][itemIndex]; }
        }
      }
      return null;
    }


    function sourcePreferenceIdentity(item) {
      return String(item && (item.sourcePreferenceGuid || item.guid) || '');
    }

    function persistSourcePreference(item, machineIdentifier) {
      var guid = sourcePreferenceIdentity(item);
      if (!guid || !sourcePreferences || !sourcePreferences.set) { return ''; }
      return sourcePreferences.set(guid, machineIdentifier);
    }

    function preferredSourceMachine(item) {
      var guid = sourcePreferenceIdentity(item);
      return guid && sourcePreferences && sourcePreferences.get ? String(sourcePreferences.get(guid) || '') : '';
    }

    function fallbackSourceFromProfiles(item, candidates, callback) {
      var pending = candidates.length;
      var versions = [];
      var fallback = candidates[0] && candidates[0].item || null;
      var done = false;
      var index;
      var preferenceSettings = settings();
      if (!pending || typeof PlexClient.loadMediaProfile !== 'function' || item && item.type === 'show') { callback(null, fallback); return; }

      function trackLanguageRank(track, priorities) {
        var source = priorities || [];
        var preference;
        var match;
        var priorityIndex;
        if (!source.length) { return 0; }
        if (!track || !modules.MediaPreferences || typeof modules.MediaPreferences.findTrack !== 'function') { return source.length + 1; }
        for (priorityIndex = 0; priorityIndex < source.length; priorityIndex += 1) {
          preference = { language: source[priorityIndex], external: track.external === true || track.external === '1' || !!track.key };
          match = modules.MediaPreferences.findTrack([track], preference, false);
          if (match) { return priorityIndex; }
        }
        return source.length + 1;
      }

      function subtitleRequired(resolved) {
        var mode = String(preferenceSettings.subtitleMode || 'audio-mismatch');
        var audio = resolved && resolved.audioTrack;
        var preferred = preferenceSettings.subtitleLanguages && preferenceSettings.subtitleLanguages[0];
        var suppressed = preferenceSettings.subtitleSuppressedForAudio || [];
        var suppressedIndex;
        if (mode === 'off') { return false; }
        for (suppressedIndex = 0; audio && suppressedIndex < suppressed.length; suppressedIndex += 1) {
          if (trackLanguageRank(audio, [suppressed[suppressedIndex]]) === 0) { return false; }
        }
        if (mode === 'always' || mode === 'forced') { return true; }
        if (mode === 'audio-mismatch') {
          if (!preferred) { return !!(resolved && resolved.subtitleTrack); }
          return !audio || trackLanguageRank(audio, [preferred]) !== 0;
        }
        return false;
      }

      function preferenceFilteredVersions(sourceVersions) {
        var bestAudioRank = Infinity;
        var bestSubtitleRank = Infinity;
        var resolvedByVersion = [];
        var audioFiltered;
        var subtitleFiltered;
        if (!modules.MediaPreferences || typeof modules.MediaPreferences.resolve !== 'function') { return sourceVersions; }
        sourceVersions.forEach(function (version) {
          var resolved = modules.MediaPreferences.resolve({
            options: {},
            audioTracks: version.audioTracks || [],
            subtitleTracks: version.subtitleTracks || []
          }, null, preferenceSettings);
          var audioRank = trackLanguageRank(resolved && resolved.audioTrack, preferenceSettings.audioLanguages || []);
          var subtitleRank = subtitleRequired(resolved)
            ? trackLanguageRank(resolved && resolved.subtitleTrack, preferenceSettings.subtitleLanguages || [])
            : 0;
          resolvedByVersion.push({ version: version, audioRank: audioRank, subtitleRank: subtitleRank });
          if (audioRank < bestAudioRank) { bestAudioRank = audioRank; }
        });
        audioFiltered = resolvedByVersion.filter(function (entry) { return entry.audioRank === bestAudioRank; });
        audioFiltered.forEach(function (entry) {
          if (entry.subtitleRank < bestSubtitleRank) { bestSubtitleRank = entry.subtitleRank; }
        });
        subtitleFiltered = audioFiltered.filter(function (entry) { return entry.subtitleRank === bestSubtitleRank; });
        return subtitleFiltered.map(function (entry) { return entry.version; });
      }

      function finish() {
        var selected;
        var selectedItem;
        var candidatesByPreference;
        if (done || pending > 0) { return; }
        done = true;
        candidatesByPreference = preferenceFilteredVersions(versions);
        if (candidatesByPreference.length && modules.VersionSelection && typeof modules.VersionSelection.selectAutomatic === 'function') {
          selected = modules.VersionSelection.selectAutomatic(candidatesByPreference, playbackCapabilities(), preferenceSettings.playbackMode, preferenceSettings.videoVersionPriorities);
        }
        selectedItem = selected && selected._ploffSourceItem || fallback;
        callback(null, selectedItem || fallback);
      }

      for (index = 0; index < candidates.length; index += 1) {
        (function (resolved) {
          var sourceItem = resolved.item;
          var route = resolved.route;
          var request;
          request = PlexClient.loadMediaProfile(route.config, sourceItem.ratingKey, function (error, profile) {
            var sourceVersions;
            var versionIndex;
            var version;
            if (!error && profile) {
              sourceVersions = profile.versions && profile.versions.length ? profile.versions : [profile];
              for (versionIndex = 0; versionIndex < sourceVersions.length; versionIndex += 1) {
                version = copyRecord(sourceVersions[versionIndex]);
                version._ploffSourceItem = sourceItem;
                versions.push(version);
              }
            }
            pending -= 1;
            finish();
          });
          trackRequest(request);
        }(candidates[index]));
      }
      finish();
    }

    function openWithSourceFallback(item, openOptions, returnView) {
      var optionsValue = openOptions || {};
      var candidates = sourceResolver.available(item, { candidateContext: optionsValue.sourceContext || null });
      var provisional = candidates[0] && candidates[0].item || null;
      var provisionalOptions;
      var token;
      if (!provisional) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      provisionalOptions = copyRecord(optionsValue);
      provisionalOptions.sourceContext = candidates[0].route.context;
      token = beginOpen(provisional, returnView, provisionalOptions.visible !== false, provisionalOptions);
      if (token === null) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      renderDetail(placeholderFor(provisional));
      call(shell.hideViewState);
      fallbackSourceFromProfiles(item, candidates, function (_error, selected) {
        var nextOptions;
        if (!tokenIsCurrent(token) || !selected) { return; }
        nextOptions = copyRecord(optionsValue);
        nextOptions.returnView = returnView;
        nextOptions.sourceFallbackResolved = true;
        nextOptions.sourceContext = null;
        open(selected, nextOptions);
      });
      return true;
    }

    function requestOwnerItem(item) {
      var state = controllerSnapshot();
      return item || state.selectedItem || state.currentDetail || null;
    }

    function sourceRoute(item, candidateContext) {
      return sourceRouter.routeFor(item || null, candidateContext || null);
    }

    function applySourceContext(item, candidateContext) {
      var explicit = !!candidateContext;
      var owner = String(item && item.serverMachineIdentifier || '');
      var route = sourceRoute(item, candidateContext);
      if (!route) { return false; }
      activeSourceContext = owner || explicit ? copyRecord(route.context) : null;
      return true;
    }

    function requestRoute(item, candidateOverride) {
      var ownerItem = requestOwnerItem(item);
      var owner = String(ownerItem && ownerItem.serverMachineIdentifier || '');
      var activeOwner = String(activeSourceContext && activeSourceContext.serverMachineIdentifier || '');
      var candidate = candidateOverride !== undefined
        ? candidateOverride
        : (owner && activeOwner && owner !== activeOwner ? null : activeSourceContext);
      return sourceRoute(ownerItem, candidate);
    }

    function requestConfig(item) {
      var route = requestRoute(item);
      return route ? copyRecord(route.config) : null;
    }

    function routeIdentity(route) {
      return String(route && route.context && route.context.serverMachineIdentifier || '') + '|' +
        String(route && route.config && route.config.apiBaseUrl || '') + '|' +
        String(route && route.config && route.config.token || '');
    }

    function retainRecoveredPrimaryRoute(previousRoute, recoveredRoute) {
      var previous = previousRoute && previousRoute.context;
      var recovered = recoveredRoute && recoveredRoute.context;
      if (!activeSourceContext || !previous || !recovered) { return; }
      if (String(activeSourceContext.serverMachineIdentifier || '') !== String(previous.serverMachineIdentifier || '')) { return; }
      activeSourceContext = copyRecord(recovered);
    }

    function sourceRequest(item, execute, callback) {
      var cancelled = false;
      var completed = false;
      var activeRequest = null;
      var attemptGeneration = 0;
      var ownerItem = requestOwnerItem(item);

      function finish(error, result) {
        if (cancelled || completed) { return; }
        completed = true;
        call(callback, error || null, result);
      }

      function attempt(route, retried) {
        var generation;
        var settled = false;
        var request;
        if (cancelled || completed) { return; }
        if (!route || !route.config) { finish(new Error('Plex source unavailable')); return; }
        generation = attemptGeneration + 1;
        attemptGeneration = generation;
        request = execute(copyRecord(route.config), function (error, result) {
          var recoveredRoute;
          settled = true;
          if (cancelled || completed || generation !== attemptGeneration) { return; }
          activeRequest = null;
          if (error && error.transportFailure === true && route.context && route.context.primary === true &&
              !retried && typeof data.recoverPrimary === 'function') {
            data.recoverPrimary(error, function (recoveryError, recoveredContext) {
              if (cancelled || completed || generation !== attemptGeneration) { return; }
              if (recoveryError || !recoveredContext) { finish(recoveryError || error, result); return; }
              recoveredRoute = sourceRoute(ownerItem, recoveredContext);
              if (!recoveredRoute || routeIdentity(recoveredRoute) === routeIdentity(route)) { finish(error, result); return; }
              retainRecoveredPrimaryRoute(route, recoveredRoute);
              attempt(recoveredRoute, true);
            });
            return;
          }
          finish(error, result);
        });
        if (!settled && generation === attemptGeneration) { activeRequest = request || null; }
      }

      attempt(requestRoute(ownerItem), false);
      if (completed || !activeRequest || typeof activeRequest.abort !== 'function') { return null; }
      return {
        abort: function () {
          if (cancelled || completed) { return; }
          cancelled = true;
          attemptGeneration += 1;
          if (activeRequest && activeRequest.abort) { activeRequest.abort(); }
          activeRequest = null;
        }
      };
    }

    function sourceContext() { return copyRecord(activeSourceContext); }

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
      result.sourceId = String(activeSourceContext && activeSourceContext.sourceId || '');
      return result;
    }

    function snapshot() { return boundarySnapshot(); }

    function currentDetail() { return copyRecord(controllerSnapshot().currentDetail); }

    function trackRequest(request) {
      if (request && typeof request.abort === 'function') { ownedRequests.push(request); }
      return request;
    }

    function untrackRequest(request) {
      var index = ownedRequests.indexOf(request);
      if (index !== -1) { ownedRequests.splice(index, 1); }
      return request;
    }

    function abortTrackedRequest(request) {
      if (!request) { return; }
      untrackRequest(request);
      if (typeof request.abort === 'function') { request.abort(); }
    }

    function abortRequests() {
      var request;
      seasonPreviewRequest = null;
      episodePreviewRequest = null;
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

    function setExtendedSurface(enabled) {
      var view = node('detail-view');
      if (!view) { return; }
      view.className = String(view.className || '').replace(/\s*is-extended/g, '');
      if (enabled) { view.className += ' is-extended'; }
    }

    function detailRootKey(detail) {
      if (!detail) { return ''; }
      if (detail.type === 'episode' || detail.type === 'season') {
        return String(detail.showRatingKey || detail.grandparentRatingKey || '');
      }
      return String(detail.ratingKey || '');
    }

    function activeExtendedRootKey() {
      var detail = controllerSnapshot().currentDetail;
      return detailRootKey(detail) || extendedRootKey || String(detail && detail.ratingKey || '');
    }

    function resetExtendedDetail() {
      extendedRootDetail = null;
      extendedRootKey = '';
      extendedMetadataKey = '';
      extendedExtrasKey = '';
      setExtendedSurface(false);
      if (extendedView && extendedView.reset) { extendedView.reset(); }
    }

    function rememberExtendedRoot(detail) {
      var key = detailRootKey(detail);
      if (!key || String(detail && detail.ratingKey || '') !== key) { return false; }
      extendedRootKey = key;
      extendedRootDetail = detail;
      if (extendedView && extendedView.setDetail) { extendedView.setDetail(detail); }
      return true;
    }

    function loadExtendedRootDetail(key, token) {
      if (!key || (extendedRootDetail && extendedRootKey === key) || extendedMetadataKey === key || typeof PlexClient.loadMetadata !== 'function') { return; }
      extendedMetadataKey = key;
      trackRequest(sourceRequest(null, function (configValue, done) {
        return PlexClient.loadMetadata(configValue, key, done);
      }, function (error, detail) {
        extendedMetadataKey = '';
        if (!tokenIsCurrent(token) || activeExtendedRootKey() !== key || error || !detail) { return; }
        detail = sourceOwnedRecord(detail);
        extendedRootKey = key;
        extendedRootDetail = detail;
        extendedView.setDetail(detail);
        if (controllerSnapshot().zone === 'extended') { updateFocus(); }
      }));
    }

    function loadExtendedExtras(key, token) {
      if (!key || extendedExtrasKey === key || typeof PlexClient.loadExtras !== 'function') { return; }
      extendedExtrasKey = key;
      extendedView.setExtrasLoading(true);
      trackRequest(sourceRequest(null, function (configValue, done) {
        return PlexClient.loadExtras(configValue, key, done);
      }, function (error, items) {
        if (!tokenIsCurrent(token) || activeExtendedRootKey() !== key) { return; }
        if (error) {
          extendedExtrasKey = '';
          extendedView.setExtrasLoading(false);
          return;
        }
        extendedView.setExtras(sourceOwnedRecords(items || []));
        if (controllerSnapshot().zone === 'extended') { updateFocus(); }
      }));
    }

    function enterExtendedDetail() {
      var key = activeExtendedRootKey();
      var token = currentToken();
      setExtendedSurface(true);
      extendedView.enter();
      if (extendedRootDetail && extendedRootKey === key) { extendedView.setDetail(extendedRootDetail); }
      else { loadExtendedRootDetail(key, token); }
      loadExtendedExtras(key, token);
      return true;
    }

    function leaveExtendedDetail() {
      setExtendedSurface(false);
      extendedView.leave();
      return true;
    }

    function activateExtended() {
      var item = extendedView && extendedView.selectedExtra ? extendedView.selectedExtra() : null;
      if (!item || !item.ratingKey) { return false; }
      call(transitions.requestStandalonePlayback, {
        item: item,
        detail: item,
        sourceContext: sourceContext(),
        seriesContext: null,
        seasonIndex: 0,
        episodeIndex: 0,
        resume: false
      });
      return true;
    }

    function translateStatic() {
      var optionsButton = node('detail-options');
      var backButton = node('detail-back');
      setText('detail-play', t('detail.play'));
      if (backButton && backButton.setAttribute) { backButton.setAttribute('aria-label', t('common.back')); }
      if (optionsButton && optionsButton.setAttribute) { optionsButton.setAttribute('aria-label', t('detail.mediaOptions')); }
      setText('detail-version-label', t('detail.version'));
      setText('detail-more-indicator-label', t('detail.moreDetails'));
    }

    function detailPresentationKey(item) {
      if (!item) { return ''; }
      return [item.serverMachineIdentifier || '', item.type || '', item.ratingKey || item.title || ''].join(':');
    }

    function artworkUrl(item) {
      return call(shell.artworkUrl, item) || (item && (item.art || item.image) || '');
    }

    function clearDetailPresentation(clearPoster) {
      if (controller.cancelEpisodePreview) { controller.cancelEpisodePreview(); }
      call(shell.cancelImages, 'detail');
      if (clearPoster) { call(shell.loadRenderedPoster, node('detail-poster'), '', 0, 'detail', 360, 540, sourceContext()); }
      presentationView.clear();
      setText('detail-audio-value', '');
      setText('detail-subtitles-value', '');
      setText('detail-version-value', '');
      episodeView.reset();
      resetExtendedDetail();
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

    function mediaPreferenceIdentity(detail) { return String(call(data.mediaPreferenceIdentity, detail, sourceContext()) || ''); }
    function detailMediaVersions() { return preferences.versions ? preferences.versions() : []; }
    function playbackCapabilities() {
      var capabilities = call(data.playbackCapabilities) || {};
      return {
        directPlay: capabilities.directPlay,
        codecs: (capabilities.codecs || []).slice(),
        containers: (capabilities.containers || []).slice(),
        uhd: capabilities.uhd,
        hdr10: capabilities.hdr10,
        dolbyVision: capabilities.dolbyVision,
        hdrKnown: capabilities.hdrKnown
      };
    }
    function selectedMediaProfile() {
      return preferences.selectedProfile ? preferences.selectedProfile({
        automatic: true,
        capabilities: playbackCapabilities(),
        mode: settings().playbackMode,
        priorities: settings().videoVersionPriorities
      }) : null;
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
    function addPlaybackCapabilities(result) {
      result.playbackCapabilities = playbackCapabilities();
      return result;
    }
    function playbackPreferences(versionAffinity) {
      return addPlaybackCapabilities(preferences.playbackPreferences ? preferences.playbackPreferences(settings(), activeVideoQuality(), versionAffinity) : {});
    }
    function playbackPreferencesFor(detail, versionAffinity) {
      return addPlaybackCapabilities(preferences.playbackPreferencesFor
        ? preferences.playbackPreferencesFor(detail, settings(), activeVideoQuality(), versionAffinity)
        : playbackPreferences(versionAffinity));
    }

    function mediaVersionLabel(profile, automatic) {
      return modules.MediaChoiceModel.versionLabel(profile, {
        automatic: automatic,
        automaticLabel: t('player.versionAuto'),
        unavailable: t('player.unavailable')
      });
    }

    function externalSourceSuffix(item) {
      var machine = String(item && item.serverMachineIdentifier || '');
      var variants = item && item.sourceVariants || [];
      var route;
      var label;
      var index;
      if (!machine) { return ''; }
      if (item && item.primarySource === true) { return ''; }
      for (index = 0; index < variants.length; index += 1) {
        if (String(variants[index] && variants[index].serverMachineIdentifier || '') === machine && variants[index].primarySource === true) { return ''; }
      }
      route = sourceRoute(item, null);
      if (route && route.context && route.context.primary === true) { return ''; }
      label = sourceVariantLabel(item);
      return label ? ' (' + label + ')' : '';
    }

    function mediaVersionSourceLabel(profile, automatic, item) {
      return mediaVersionLabel(profile, automatic) + externalSourceSuffix(item);
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
      var subtitleLabel;
      var source;
      var versionSource;
      var versionAutomatic;
      var audioSource;
      var subtitleSource;
      var sourceItem = aggregatedSourceItem();
      var confirmedVersionCycling = choices.versions === true || knownSourceVariantCount(sourceItem) > 1 || aggregatedVersionChoiceCount(sourceItem) > 1;
      choices.versions = confirmedVersionCycling;
      choices.versionCycleReserved = confirmedVersionCycling || currentSeasonExpectsAggregatedVersions();
      choices.versionOpenable = !!profile;
      if (!profile || !resolved) {
        unavailableLabel = current.mediaProfileLoading ? (current.mediaLoadingLabelVisible ? t('detail.loadingTracks') : '') : t('player.unavailable');
        display.audio = unavailableLabel;
        display.subtitles = unavailableLabel;
        display.version = unavailableLabel;
      } else {
        versionSource = preferences.preferenceSource ? preferences.preferenceSource('versionSignature', currentDetail()) : 'global';
        audioSource = preferences.preferenceSource ? preferences.preferenceSource('audioTrack', currentDetail()) : 'global';
        subtitleSource = preferences.preferenceSource ? preferences.preferenceSource(preferenceState.override && preferenceState.override.subtitlesOff ? 'subtitlesOff' : 'subtitleTrack', currentDetail()) : 'global';
        subtitleLabel = resolved.subtitleTrack ? modules.MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external'), t('common.unknown')) : t('subtitle.off');
        versionAutomatic = !preferenceState.override || !preferenceState.override.versionSignature;
        if (!versionAutomatic && modules.VersionSelection && modules.VersionSelection.matchesAffinity) {
          versionAutomatic = !modules.VersionSelection.matchesAffinity(profile, preferenceState.override.versionSignature);
        }
        display.version = mediaVersionSourceLabel(profile, versionAutomatic, currentDetail());
        display.audio = modules.MediaProfile.trackDisplayLabel(resolved.audioTrack, t('detail.external'), t('common.unknown'));
        display.audio = preferenceState.override && preferenceState.override.audioTrack ? display.audio : automaticTrackLabel(display.audio);
        display.subtitles = preferenceState.override && (preferenceState.override.subtitlesOff || preferenceState.override.subtitleTrack) ? subtitleLabel : automaticTrackLabel(subtitleLabel);
        source = { version: versionSource, audio: audioSource, subtitles: subtitleSource };
      }
      presentationView.renderMediaControls({
        labels: { version: t('detail.version'), audio: t('detail.audio'), subtitles: t('detail.subtitles') },
        choices: choices,
        values: display,
        sources: source || { version: 'global', audio: 'global', subtitles: 'global' },
        detail: currentDetail()
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
      var aggregated = aggregatedSourceItem();
      if (aggregated && aggregatedVersionChoiceCount(aggregated) > 1) { return cycleAggregatedVersion(aggregated, direction); }
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
        automaticLabel = automaticTrackLabel(modules.MediaProfile.trackDisplayLabel(resolved && resolved.audioTrack, t('detail.external'), t('common.unknown')));
        choices = modules.MediaChoiceModel.trackChoices(profile.audioTracks, {
          automatic: { value: '', label: automaticLabel, languageCode: resolved && resolved.audioTrack && (resolved.audioTrack.languageTag || resolved.audioTrack.languageCode || resolved.audioTrack.language) },
          useIndexFallback: true,
          label: function (track) { return modules.MediaProfile.trackDisplayLabel(track, t('detail.external'), t('common.unknown')); }
        });
        selectedTrack = override && override.audioTrack ? modules.MediaPreferences.findTrack(profile.audioTracks, override.audioTrack, false) : null;
        selected = selectedTrack ? modules.MediaChoiceModel.trackValue(selectedTrack, profile.audioTracks.indexOf(selectedTrack), true) : '';
      } else if (kind === 'subtitles') {
        automaticLabel = automaticTrackLabel(modules.MediaProfile.trackDisplayLabel(resolved && resolved.subtitleTrack, t('detail.external'), t('common.unknown')) || t('subtitle.off'));
        choices = modules.MediaChoiceModel.trackChoices(profile.subtitleTracks, {
          automatic: { value: 'automatic', label: automaticLabel, languageCode: resolved && resolved.subtitleTrack && (resolved.subtitleTrack.languageTag || resolved.subtitleTrack.languageCode || resolved.subtitleTrack.language) },
          off: { value: 'off', label: t('subtitle.off') },
          useIndexFallback: true,
          label: function (track) { return modules.MediaProfile.trackDisplayLabel(track, t('detail.external'), t('common.unknown')); }
        });
        selectedTrack = override && override.subtitleTrack ? modules.MediaPreferences.findTrack(profile.subtitleTracks, override.subtitleTrack, false) : null;
        selected = override && override.subtitlesOff ? 'off' : (selectedTrack ? modules.MediaChoiceModel.trackValue(selectedTrack, profile.subtitleTracks.indexOf(selectedTrack), true) : 'automatic');
      } else { return false; }
      openOwnedChoice(
        kind === 'audio' ? t('detail.audio') : t('detail.subtitles'),
        choices,
        selected,
        function (choice) { setTrackPreference(kind, choice.track || null, choice.value === 'off'); },
        updateFocus
      );
      return true;
    }

    function detailChoiceZones() {
      var choices = preferences.choiceState ? preferences.choiceState() : { audio: false, subtitles: false, versions: false };
      var zones = [];
      if (selectedMediaProfile()) { zones.push('version'); }
      if (choices.audio) { zones.push('audio'); }
      if (choices.subtitles) { zones.push('subtitles'); }
      return zones;
    }

    function detailDisplaySubtitle(detail) {
      var subtitle = detail && detail.subtitle || '';
      var episodeMarker;
      if (!detail) { return subtitle; }
      if (detail.subtitleKey) { subtitle = t(detail.subtitleKey, detail.subtitleParameters || {}); }
      if (detail.type !== 'episode') { return subtitle; }
      if (detail.seasonTitleKey) {
        episodeMarker = subtitle.indexOf(' - E');
        if (episodeMarker !== -1) {
          subtitle = t(detail.seasonTitleKey, detail.seasonTitleParameters || {}) + subtitle.substring(episodeMarker);
        }
      }
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
      cached = call(watchlist.findLocal, watchlistLocalKeyForDetail(detail), detail.serverMachineIdentifier || '');
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
      var identitySource;
      var identityPatch = {};
      var token = currentToken();
      var state;
      if (!active() || !detail) { return false; }
      detail = retainEpisodeVariants(sourceOwnedRecord(detail));
      var cachedProfile = seasonProfiles[profileCacheKey(detail)];
      if (cachedProfile && cachedProfile.profile) { detail.mediaProfile = cachedProfile.profile; }
      controller.setCurrentDetail(detail);
      rememberExtendedRoot(detail);
      if (selected) {
        if (!detail.themeLookupKey && selected.themeLookupKey) { identityPatch.themeLookupKey = selected.themeLookupKey; }
        if (!detail.themeKey && selected.themeKey) { identityPatch.themeKey = selected.themeKey; }
        if (!detail.themeUrl && selected.themeUrl) { identityPatch.themeUrl = selected.themeUrl; }
      }
      identitySource = selected && recordContainsRatingKey(selected, detail.ratingKey, detail.serverMachineIdentifier) ? selected : seriesRecordForDetail(detail);
      if (identitySource) {
        if (!detail.guid && identitySource.guid) { identityPatch.guid = identitySource.guid; }
        if (identitySource.cloudRatingKey) { identityPatch.cloudRatingKey = identitySource.cloudRatingKey; }
        if (identitySource.cloudGuid) { identityPatch.cloudGuid = identitySource.cloudGuid; }
        if (identitySource.sourcePreferenceGuid) { identityPatch.sourcePreferenceGuid = identitySource.sourcePreferenceGuid; }
        if (identitySource.sourceVariants && identitySource.sourceVariants.length) { identityPatch.sourceVariants = identitySource.sourceVariants.map(copyRecord); }
      }
      if (Object.keys(identityPatch).length) {
        controller.patchCurrentDetail(identityPatch);
        detail = currentDetail();
      }
      if (detail.type === 'episode') {
        detail = rememberEpisodeDetail(detail, detail);
        controller.setCurrentDetail(detail);
      }
      presentationView.renderMetadata(detail, detailDisplaySubtitle(detail));
      call(shell.loadRenderedPoster, poster, detail.image || '', 0, 'detail', 360, 540, sourceContext());
      setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      call(shell.scheduleBackdrop, detail);
      if (detail.ratingKey) { call(shell.scheduleTheme, detail, sourceContext()); }
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

    function setWatchedState(watched) {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      var requestGeneration = current.generation;
      var requestRatingKey = detail && detail.ratingKey;
      var requestSourceContext = sourceContext();
      watched = watched === true;
      if (!detail || !requestRatingKey || typeof PlexClient.setWatchedAndReset !== 'function') { return false; }
      if (!requestConfig(detail)) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      trackRequest(sourceRequest(detail, function (requestConfigValue, done) {
        return PlexClient.setWatchedAndReset(requestConfigValue, requestRatingKey, watched, done);
      }, function (error, outcome) {
        var requestStillVisible = currentRequestMatches(requestGeneration, requestRatingKey);
        var watchedApplied = !error || !!(outcome && outcome.watchedApplied === true);
        var patch = error ? { viewed: watched } : { viewed: watched, viewOffset: 0, progress: 0 };
        if (watchedApplied) { call(transitions.onWatchedChanged, requestRatingKey, watched, requestSourceContext); }
        if (error) {
          if (requestStillVisible && watchedApplied) {
            controller.patchCurrentDetail(patch);
            if (controllerSnapshot().selectedItem && String(controllerSnapshot().selectedItem.ratingKey || '') === String(requestRatingKey)) {
              controller.patchSelectedItem(patch);
            }
            setText('detail-watched', watched ? t('detail.markUnwatched') : t('detail.markWatched'));
            if (controllerSnapshot().seriesContext && controllerSnapshot().seriesContext.episodes[controllerSnapshot().episodeIndex]) {
              controller.patchEpisode(controllerSnapshot().episodeIndex, patch);
              renderEpisodeStrip();
              updateFocus();
            }
          }
          if (requestStillVisible) { call(shell.showMessage, t('status.updateError')); }
          return;
        }
        if (!requestStillVisible) { return; }
        controller.patchCurrentDetail(patch);
        if (controllerSnapshot().selectedItem && String(controllerSnapshot().selectedItem.ratingKey || '') === String(requestRatingKey)) {
          controller.patchSelectedItem(patch);
        }
        setText('detail-watched', watched ? t('detail.markUnwatched') : t('detail.markWatched'));
        if (controllerSnapshot().seriesContext && controllerSnapshot().seriesContext.episodes[controllerSnapshot().episodeIndex]) {
          controller.patchEpisode(controllerSnapshot().episodeIndex, patch);
          renderEpisodeStrip();
          updateFocus();
        }
      }));
      return true;
    }

    function toggleWatched() {
      var detail = controllerSnapshot().currentDetail;
      if (!detail) { return false; }
      return setWatchedState(!detail.viewed);
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
      context = sourceOwnedSeriesContext(context);
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
        trackRequest(sourceRequest(null, function (configValue, done) {
          return PlexClient.loadMetadata(configValue, refreshContext.targetKey, done);
        }, function (error, detail) {
          if (!tokenIsCurrent(token)) { return; }
          if (error) { callback(error); return; }
          refreshContext.detail = detail;
          if (currentRefreshTargetIsVisible(refreshContext)) { renderDetail(detail); }
          if (detail.type !== 'show' && detail.type !== 'season') { callback(null); return; }
          loadSeriesContext(detail, function (contextError, context) {
            if (!tokenIsCurrent(token)) { return; }
            if (!contextError) { applyReloadedSeriesContext(context, refreshContext); }
            callback(contextError || null);
          });
        }));
        return;
      }
      loadSeriesContext(refreshContext.detail, function (error, context) {
        if (!tokenIsCurrent(token)) { return; }
        if (!error) { applyReloadedSeriesContext(context, refreshContext); }
        callback(error || null);
      });
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

    function episodeListSeasonNumber(episodes) {
      var first = episodes && episodes.length ? episodes[0] : null;
      var seasonNumber;
      var index;
      if (!first) { return null; }
      seasonNumber = mediaSeasonNumber(first);
      for (index = 1; index < episodes.length; index += 1) {
        if (mediaSeasonNumber(episodes[index]) !== seasonNumber) { return null; }
      }
      return seasonNumber;
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
      if (episodeView && episodeView.refreshSeasonOverflow) { episodeView.refreshSeasonOverflow(); }
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

    function resetSeasonBulkState() {
      seasonBulkPending = false;
      if (node('detail-options')) { node('detail-options').disabled = false; }
    }

    function beginOpen(item, returnView, visible, openOptions) {
      if (!applySourceContext(item, openOptions && openOptions.sourceContext)) { return null; }
      entered = true;
      featureGeneration += 1;
      abortRequests();
      clearSeasonProfiles();
      clearSeasonEpisodeDetails();
      seasonVariantsRequestedKey = '';
      resetSeasonVariantHydration();
      aggregatedSeasonHints = {};
      resetAggregatedVersionProfiles();
      clearFeatureTimers();
      resetSeasonBulkState();
      resetExtendedDetail();
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


    function aggregatedSeriesItem() {
      if (!mergedVersionsEnabled()) { return null; }
      var current = controllerSnapshot();
      var item = current.selectedItem || current.currentDetail || null;
      return item && item.sourceVariants && item.sourceVariants.length > 1 ? item : null;
    }

    function loadSeriesContext(detail, callback, onProgress) {
      var item = aggregatedSeriesItem();
      var selected = controllerSnapshot().selectedItem;
      var token = currentToken();
      if (item && typeof data.loadMergedSeriesContext === 'function') {
        return trackRequest(data.loadMergedSeriesContext(item, callback, onProgress));
      }
      if (mergedVersionsEnabled() && selected && selected.type === 'show' && selected.guid &&
          typeof data.resolveGuid === 'function' && typeof data.loadMergedSeriesContext === 'function') {
        return trackRequest(data.resolveGuid(selected.guid, function (error, merged) {
          if (!tokenIsCurrent(token)) { return; }
          if (!error && merged && merged.type === 'show' && merged.sourceVariants && merged.sourceVariants.length > 1) {
            controller.patchSelectedItem({ sourceVariants: merged.sourceVariants.map(copyRecord) });
            trackRequest(data.loadMergedSeriesContext(controllerSnapshot().selectedItem, callback, onProgress));
          } else {
            trackRequest(sourceRequest(detail, function (configValue, done) {
              return PlexClient.loadSeriesContext(configValue, detail, done);
            }, callback));
          }
        }));
      }
      return trackRequest(sourceRequest(detail, function (configValue, done) {
        return PlexClient.loadSeriesContext(configValue, detail, done);
      }, callback));
    }

    function loadSeasonEpisodes(season, selectedKey, callback) {
      if (mergedVersionsEnabled() && season && season.sourceVariants && season.sourceVariants.length > 1 && typeof data.loadMergedSeasonEpisodes === 'function') {
        return trackRequest(data.loadMergedSeasonEpisodes(season, callback));
      }
      return trackRequest(sourceRequest(season, function (configValue, done) {
        return PlexClient.loadSeasonEpisodes(configValue, season && season.ratingKey, selectedKey || '', done, season && season.year);
      }, callback));
    }

    function renderSeriesContext(context, detail, callback) {
      context = sourceOwnedSeriesContext(context);
      context.episodes = retainEpisodeVariantRecords(context.episodes);
      var seasonIndex = selectedIndex(context.seasons);
      var episodeIndex = selectedIndex(context.episodes);
      (context.seasons || []).forEach(function (season) {
        if (season && season.sourceVariants && season.sourceVariants.length > 1) {
          aggregatedSeasonHints[String(mediaSeasonNumber(season))] = true;
        }
      });
      (context.episodes || []).forEach(function (episode) {
        if (episode && episode.sourceVariants && episode.sourceVariants.length > 1) { rememberEpisodeVariants(episode); }
      });
      controller.setSeriesContext(context);
      controller.setFocus({ seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      seedSeasonProfiles(context.episodes);
      episodeView.setContext(context);
      renderMediaControls();
      updateFocus();
      if (detail.type !== 'episode' && context.episodes.length) {
        loadEpisodeDetail(context.episodes[controllerSnapshot().episodeIndex], callback);
      } else {
        queueMediaProfile(detail);
        if (callback) { callback(detail); }
      }
    }

    function reconcileSeriesContext(context) {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      var currentSeason = current.seriesContext && current.seriesContext.seasons[current.seasonIndex];
      var currentEpisodes = current.seriesContext && current.seriesContext.episodes || [];
      var currentSeasonNumber = currentSeason ? mediaSeasonNumber(currentSeason) : null;
      var currentEpisodesSeasonNumber = episodeListSeasonNumber(currentEpisodes);
      var incomingEpisodesSeasonNumber = episodeListSeasonNumber(context && context.episodes || []);
      var seasonNumber = currentSeason ? currentSeasonNumber : mediaSeasonNumber(detail);
      var seasonIndex = 0;
      var episodeIndex = 0;
      var match;
      var index;
      context = sourceOwnedSeriesContext(context);
      // A late multi-PMS response is allowed to contain the first season,
      // because the fan-out starts before the user chooses another season.
      // Never let that response replace the episode list currently selected
      // in Detail.  Keep the already loaded list, or clear it while the
      // selected season request is still pending, so stale cards cannot be
      // presented as episodes of the new season.
      if (currentSeason && (incomingEpisodesSeasonNumber === null || currentSeasonNumber !== incomingEpisodesSeasonNumber)) {
        context.episodes = currentEpisodesSeasonNumber === currentSeasonNumber ? copyRecords(currentEpisodes) : [];
      }
      context.episodes = retainEpisodeVariantRecords(context.episodes);
      for (index = 0; index < (context.seasons || []).length; index += 1) {
        if (context.seasons[index] && context.seasons[index].sourceVariants && context.seasons[index].sourceVariants.length > 1) {
          aggregatedSeasonHints[String(mediaSeasonNumber(context.seasons[index]))] = true;
        }
        if (mediaSeasonNumber(context.seasons[index]) === seasonNumber) { seasonIndex = index; }
      }
      (context.episodes || []).forEach(function (episode) {
        if (episode && episode.sourceVariants && episode.sourceVariants.length > 1) { rememberEpisodeVariants(episode); }
      });
      if (currentSeason && currentSeasonNumber === incomingEpisodesSeasonNumber && currentEpisodes.length) {
        episodeIndex = Math.min(Math.max(0, Number(current.episodeIndex || 0)), Math.max(0, (context.episodes || []).length - 1));
      } else if (currentSeason && currentEpisodesSeasonNumber === currentSeasonNumber && currentEpisodes.length) {
        episodeIndex = Math.min(Math.max(0, Number(current.episodeIndex || 0)), Math.max(0, (context.episodes || []).length - 1));
      } else {
        match = detail && detail.type === 'episode' ? matchingEpisodeRecord(context.episodes || [], detail) : null;
        if (match) { episodeIndex = (context.episodes || []).indexOf(match); }
      }
      controller.setSeriesContext(context);
      controller.setFocus({ seasonIndex: seasonIndex, episodeIndex: Math.max(0, episodeIndex) });
      seedSeasonProfiles(context.episodes);
      episodeView.setContext(context, {
        seasonKey: context.seasons[seasonIndex] && context.seasons[seasonIndex].ratingKey,
        episodeKey: context.episodes[episodeIndex] && context.episodes[episodeIndex].ratingKey
      });
      renderMediaControls();
      updateFocus();
      if (mediaProfileReadyForCurrentDetail()) { primeVisibleSeasonVariants(); }
      return context;
    }

    function loadSelectedDetail(item) {
      var token = currentToken();
      var seriesPublished = false;

      function publishSeriesContext(detail, context, callback) {
        var selected = controllerSnapshot().selectedItem;
        if (!tokenIsCurrent(token) || currentView() !== 'detail' || !selected || String(selected.ratingKey || '') !== String(item.ratingKey || '') || !context) { return false; }
        if (!seriesPublished) {
          seriesPublished = true;
          renderSeriesContext(context, detail, callback);
        } else {
          reconcileSeriesContext(context);
        }
        return true;
      }

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
        loadSeriesContext(detail, function (seriesError, context) {
          var selected = controllerSnapshot().selectedItem;
          if (!tokenIsCurrent(token) || currentView() !== 'detail' || !selected || String(selected.ratingKey || '') !== String(item.ratingKey || '')) { return; }
          if (!seriesError && context) { publishSeriesContext(detail, context, completePendingPlay); }
          else { queueMediaProfile(detail); completePendingPlay(); }
        }, function (context) {
          publishSeriesContext(detail, context, completePendingPlay);
        });
      });
    }

    function open(item, openOptions) {
      var optionsValue = openOptions || {};
      var sourceView = optionsValue.returnView || currentView();
      var returnView = sourceView === 'search' ? 'search' : (sourceView === 'library' ? 'library' : (sourceView === 'watchlist' ? 'watchlist' : 'home'));
      var resolved;
      if (!active() || !item || !item.ratingKey) { return false; }
      resolved = sourceResolver.resolve(item, { preferredMachine: preferredSourceMachine(item), candidateContext: optionsValue.sourceContext || null });
      if (!resolved) { call(shell.showMessage, t('status.mediaUnavailable')); return false; }
      if (optionsValue.sourceFallbackResolved !== true && resolved.fallback) {
        return openWithSourceFallback(item, optionsValue, returnView);
      }
      item = resolved.item;
      if (beginOpen(item, returnView, optionsValue.visible !== false, optionsValue) === null) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
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
      var seriesPublished = false;

      function publishSeriesContext(context) {
        var selected = controllerSnapshot().selectedItem;
        if (!tokenIsCurrent(token) || !selected || String(selected.ratingKey || '') !== String(selectedItem.ratingKey || '') || !context) { return false; }
        if (!seriesPublished) {
          seriesPublished = true;
          renderSeriesContext(context, detail, optionsValue.playImmediately ? function () { controller.requestPlayback({ resume: false }); } : null);
        } else {
          reconcileSeriesContext(context);
        }
        return true;
      }

      if (!active() || !detail || !detail.ratingKey) { return false; }
      token = beginOpen(selectedItem, returnView, optionsValue.visible !== false, optionsValue);
      if (token === null) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      controller.setCurrentDetail(detail);
      controller.setSelectedItem(selectedItem);
      renderDetail(detail, optionsValue.deferMediaProfile === true);
      if (optionsValue.context) {
        renderSeriesContext(optionsValue.context, detail, optionsValue.playImmediately ? function () { controller.requestPlayback({ resume: false }); } : null);
      } else if (optionsValue.skipSeriesLoad) {
        if (optionsValue.playImmediately) { controller.requestPlayback({ resume: false }); }
      } else {
        loadSeriesContext(detail, function (error, context) {
          var selected = controllerSnapshot().selectedItem;
          if (!tokenIsCurrent(token) || !selected || String(selected.ratingKey || '') !== String(selectedItem.ratingKey || '')) { return; }
          if (detail.type === 'show' && (error || !context)) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
          if (!error && context) {
            if (detail.type === 'show' && !context.episodes.length) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
            publishSeriesContext(context);
            return;
          }
          if (optionsValue.playImmediately) { controller.requestPlayback({ resume: false }); }
        }, function (context) {
          if (context && context.episodes && context.episodes.length) { publishSeriesContext(context); }
        });
      }
      updateFocus();
      return true;
    }

    function playIntentIsCurrent(token, sourceView, featureToken) {
      return token === directPlayGeneration && tokenIsCurrent(featureToken) && currentView() === sourceView;
    }

    function cancelPendingPlayIntent() {
      directPlayGeneration += 1;
      if (!entered) { activeSourceContext = null; }
      return directPlayGeneration;
    }

    function playItemForIntent(item, playOptions, sourceView, playToken, featureToken) {
      var optionsValue = playOptions || {};
      var candidates;
      var resolved;
      if (!active() || !item || !item.ratingKey || !playIntentIsCurrent(playToken, sourceView, featureToken)) { return false; }
      resolved = sourceResolver.resolve(item, { preferredMachine: preferredSourceMachine(item), candidateContext: optionsValue.sourceContext || null });
      if (!resolved) { call(shell.showMessage, t('status.mediaUnavailable')); return false; }
      if (optionsValue.sourceFallbackResolved !== true && resolved.fallback) {
        candidates = sourceResolver.available(item, { candidateContext: optionsValue.sourceContext || null });
        if (!candidates.length) {
          call(shell.showMessage, t('status.mediaUnavailable'));
          return false;
        }
        fallbackSourceFromProfiles(item, candidates, function (_error, selected) {
          var nextOptions;
          if (!selected || !playIntentIsCurrent(playToken, sourceView, featureToken)) { return; }
          nextOptions = copyRecord(optionsValue);
          nextOptions.sourceFallbackResolved = true;
          nextOptions.sourceContext = null;
          playItemForIntent(selected, nextOptions, sourceView, playToken, featureToken);
        });
        return true;
      }
      item = resolved.item;
      if (!applySourceContext(item, optionsValue.sourceContext)) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      if (item.type === 'season') {
        trackRequest(sourceRequest(item, function (configValue, done) {
          return PlexClient.loadSeasonEpisodes(configValue, item.ratingKey, '', done, item.year);
        }, function (error, episodes) {
          var index;
          if (!playIntentIsCurrent(playToken, sourceView, featureToken)) { return; }
          if (error || !episodes.length) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
          index = selectedIndex(episodes);
          trackRequest(sourceRequest(episodes[index], function (configValue, done) {
            return PlexClient.loadMetadata(configValue, episodes[index].ratingKey, done);
          }, function (metadataError, detail) {
            if (!playIntentIsCurrent(playToken, sourceView, featureToken)) { return; }
            if (metadataError || !detail) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
            openLoaded(detail, { returnView: sourceView, selectedItem: item, playImmediately: true, fromContinueWatching: optionsValue.fromContinueWatching === true, sourceContext: sourceContext() });
          }));
        }));
        return true;
      }
      trackRequest(sourceRequest(item, function (configValue, done) {
        return PlexClient.loadMetadata(configValue, item.ratingKey, done);
      }, function (error, detail) {
        if (!playIntentIsCurrent(playToken, sourceView, featureToken)) { return; }
        if (error || !detail) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
        openLoaded(detail, { returnView: sourceView, selectedItem: item, playImmediately: true, fromContinueWatching: optionsValue.fromContinueWatching === true, sourceContext: sourceContext() });
      }));
      return true;
    }

    function playItem(item, playOptions) {
      var sourceView = currentView();
      var playToken;
      var featureToken;
      if (!active() || !item || !item.ratingKey || (sourceView !== 'home' && sourceView !== 'search' && sourceView !== 'library' && sourceView !== 'watchlist')) { return false; }
      directPlayGeneration += 1;
      playToken = directPlayGeneration;
      featureToken = currentToken();
      return playItemForIntent(item, playOptions || {}, sourceView, playToken, featureToken);
    }

    function presentEpisodeDetail(ratingKey, error, detail, callback, animateSeason) {
      if (error || !detail || currentView() !== 'detail') { return; }
      detail = rememberEpisodeDetail(detail, detail);
      if (animateSeason) { controller.setSeasonTransitionMediaKey(ratingKey); }
      renderDetail(detail);
      if (animateSeason) { animateSeasonContent('detail-copy'); }
      if (callback) { callback(detail); }
    }

    function loadEpisodeDetail(episode, callback, animateSeason) {
      var ratingKey = String(episode && episode.ratingKey || '');
      var cached = cachedEpisodeDetail(episode);
      if (cached) {
        presentEpisodeDetail(ratingKey, null, cached, callback, animateSeason);
        return null;
      }
      return controller.loadEpisode(episode, function (error, detail) {
        presentEpisodeDetail(ratingKey, error, detail ? rememberEpisodeDetail(episode, detail) : detail, callback, animateSeason);
      });
    }

    function loadEpisodePreviewDetail(episode, animateSeason) {
      var ratingKey = String(episode && episode.ratingKey || '');
      var seasonIndex = controllerSnapshot().seasonIndex;
      var cached = cachedEpisodeDetail(episode);
      var request = null;
      var completed = false;
      abortTrackedRequest(episodePreviewRequest);
      episodePreviewRequest = null;
      if (cached) {
        presentEpisodeDetail(ratingKey, null, cached, null, animateSeason);
        return null;
      }
      request = controller.loadEpisode(episode, function (error, detail) {
        completed = true;
        if (request && episodePreviewRequest === request) {
          episodePreviewRequest = null;
          untrackRequest(request);
        }
        if (seasonIndex !== controllerSnapshot().seasonIndex) { return; }
        presentEpisodeDetail(ratingKey, error, detail ? rememberEpisodeDetail(episode, detail) : detail, null, animateSeason);
      });
      if (completed) { untrackRequest(request); }
      else { episodePreviewRequest = request; }
      return request;
    }

    function loadSeasonPreviewEpisodes(season, callback) {
      var request = null;
      var completed = false;
      abortTrackedRequest(seasonPreviewRequest);
      seasonPreviewRequest = null;
      request = loadSeasonEpisodes(season, '', function (error, episodes) {
        completed = true;
        if (request && seasonPreviewRequest === request) {
          seasonPreviewRequest = null;
          untrackRequest(request);
        }
        callback(error, episodes);
      });
      if (completed) { untrackRequest(request); }
      else { seasonPreviewRequest = request; }
      return request;
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
      controller.scheduleEpisodePreview(function (episode) { loadEpisodePreviewDetail(episode, true); }, 180);
    }

    function scheduleSeasonPreview() {
      var token = currentToken();
      if (controller.cancelEpisodePreview) { controller.cancelEpisodePreview(); }
      abortTrackedRequest(episodePreviewRequest);
      episodePreviewRequest = null;
      controller.scheduleSeasonPreview(function (season, callback) {
        return loadSeasonPreviewEpisodes(season, callback);
      }, function (error, episodes, _season, seasonIndex) {
        if (!tokenIsCurrent(token) || error || currentView() !== 'detail' || seasonIndex !== controllerSnapshot().seasonIndex) { return; }
        if (_season && _season.sourceVariants && _season.sourceVariants.length > 1) {
          rememberSeasonEpisodeVariants(episodes);
        }
        episodes = retainEpisodeVariantRecords(episodes);
        controller.selectSeason(seasonIndex);
        controller.setEpisodes(episodes, selectedIndex(episodes));
        seedSeasonProfiles(episodes);
        episodeView.setEpisodes(episodes, episodes[controllerSnapshot().episodeIndex] && episodes[controllerSnapshot().episodeIndex].ratingKey);
        renderSeasonTabs();
        renderEpisodeStrip();
        animateSeasonContent('episode-strip');
        updateFocus();
        if (episodes.length) { loadEpisodePreviewDetail(episodes[controllerSnapshot().episodeIndex], true); }
      }, 200);
    }

    function loadSelectedSeason() {
      var current = controllerSnapshot();
      var season = current.seriesContext && current.seriesContext.seasons[current.seasonIndex];
      var token = currentToken();
      var activationToken = seasonActivationToken + 1;
      if (!season) { return false; }
      seasonActivationToken = activationToken;
      loadSeasonEpisodes(season, '', function (error, episodes) {
        var latest = controllerSnapshot();
        var activeSeason = latest.seriesContext && latest.seriesContext.seasons[latest.seasonIndex];
        if (!tokenIsCurrent(token) || activationToken !== seasonActivationToken || error || currentView() !== 'detail' || !activeSeason || String(activeSeason.ratingKey || '') !== String(season.ratingKey || '')) { return; }
        if (season.sourceVariants && season.sourceVariants.length > 1) {
          rememberSeasonEpisodeVariants(episodes);
        }
        episodes = retainEpisodeVariantRecords(episodes);
        controller.selectSeason(controllerSnapshot().seasonIndex);
        controller.setEpisodes(episodes, selectedIndex(episodes));
        seedSeasonProfiles(episodes);
        episodeView.setEpisodes(episodes, episodes[controllerSnapshot().episodeIndex] && episodes[controllerSnapshot().episodeIndex].ratingKey);
        controller.setFocus({ zone: 'episodes', episodeIndex: controllerSnapshot().episodeIndex });
        renderSeasonTabs();
        renderEpisodeStrip();
        updateFocus();
        if (episodes.length) {
          animateSeasonContent('episode-strip');
          loadEpisodeDetail(episodes[controllerSnapshot().episodeIndex], null, true);
        }
      });
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
        summaryOverflowing: presentation.summaryOverflowing,
        hasExtendedDetails: !!activeExtendedRootKey(),
        extendedAtTop: extendedView.atTop()
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
      } else if (effect === 'extended-enter') { enterExtendedDetail(); }
      else if (effect === 'extended-leave') { leaveExtendedDetail(); }
      else if (effect && effect.indexOf('extended-') === 0) {
        extendedView.navigate(effect.slice('extended-'.length));
      }
      updateFocus();
    }

    function updateFocus() {
      var current = controllerSnapshot();
      var target = null;
      if (current.zone === 'nav') { target = call(shell.navigationTarget, call(shell.navigationIndex)); }
      else if (current.zone === 'back') { target = node('detail-back'); }
      else if (current.zone === 'seasons' && document.querySelector) { target = document.querySelector('[data-season-position="' + current.seasonIndex + '"]'); }
      else if (current.zone === 'episodes') {
        target = episodeView.cardAt ? episodeView.cardAt(current.episodeIndex) : (document.querySelector ? document.querySelector('[data-episode-position="' + current.episodeIndex + '"]') : null);
      }
      else if (current.zone === 'audio') { target = node('detail-audio'); }
      else if (current.zone === 'subtitles') { target = node('detail-subtitles'); }
      else if (current.zone === 'version') { target = node('detail-version'); }
      else if (current.zone === 'summary') { target = node('detail-summary-button'); }
      else if (current.zone === 'extended') { target = extendedView.focusTarget(); }
      else { target = node(['detail-play', 'detail-watched', 'detail-watchlist', 'detail-options'][Number(current.actionIndex || 0)]); }
      var nextFocusScope = current.zone === 'nav' ? 'nav' : 'detail';
      releaseRenderedFocus(nextFocusScope);
      renderedFocusTarget = target || null;
      renderedFocusScope = nextFocusScope;
      if (target) {
        if (!hasFocusedClass(target)) { target.className = String(target.className || '') + ' is-focused'; }
        if (current.zone !== 'extended' && call(statePort.pointerSelectionActive) !== true && target.focus) { target.focus(); }
      }
      if (current.zone !== 'extended') { episodeView.startTitlePan(target); }
      return target;
    }

    function pointerFocus(zone, index) {
      if (!active()) { return false; }
      if (zone === 'cast' || zone === 'extra') {
        if (!extendedView.select || !extendedView.select(zone === 'cast' ? 'cast' : 'extras', Number(index || 0))) { return false; }
        controller.setFocus({ zone: 'extended' });
      } else if (zone === 'season') { controller.setFocus({ zone: 'seasons', seasonIndex: Number(index || 0) }); }
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

    function mergedVersionsEnabled() {
      return controllerSnapshot().returnView === 'home' ? settings().aggregateHomeLibraries === true : settings().aggregateLibraries === true;
    }

    function episodeSeasonCacheKey(item) {
      var hasSeason;
      var hasEpisode;
      if (!item || item.type && item.type !== 'episode') { return ''; }
      hasSeason = item.seasonIndex !== undefined || item.seasonNumber !== undefined || item.parentIndex !== undefined;
      hasEpisode = item.episodeIndex !== undefined || item.index !== undefined;
      if (hasSeason && hasEpisode) {
        return 'season:' + String(mediaSeasonNumber(item)) + ':episode:' + String(mediaEpisodeNumber(item));
      }
      if (item.guid) { return 'guid:' + String(item.guid); }
      return '';
    }

    function rememberEpisodeVariants(item) {
      var key = episodeSeasonCacheKey(item);
      var variants;
      if (!key || !item) { return false; }
      variants = item.sourceVariants && item.sourceVariants.length > 1 ? copySourceVariants(item.sourceVariants) : [];
      if (variants.length > 1) {
        aggregatedEpisodeVariants[key] = variants;
        return true;
      }
      return false;
    }

    function retainedEpisodeVariants(item) {
      var key = episodeSeasonCacheKey(item);
      var variants = key && aggregatedEpisodeVariants[key];
      return variants && variants.length > 1 ? copySourceVariants(variants) : [];
    }

    function retainEpisodeVariants(item) {
      var variants;
      var result;
      if (!item || item.type && item.type !== 'episode') { return item; }
      if (item.sourceVariants && item.sourceVariants.length > 1) {
        rememberEpisodeVariants(item);
        return item;
      }
      variants = retainedEpisodeVariants(item);
      if (variants.length < 2) { return item; }
      result = copyRecord(item);
      result.sourceVariants = variants;
      return result;
    }

    function retainEpisodeVariantRecords(items) {
      return (items || []).map(function (item) { return retainEpisodeVariants(item); });
    }

    function rememberSeasonEpisodeVariants(items) {
      (items || []).forEach(function (item) { rememberEpisodeVariants(item); });
      return items || [];
    }

    function knownSourceVariantCount(item) {
      var variants = item && item.sourceVariants || [];
      var seen = {};
      var count = 0;
      variants.forEach(function (variant) {
        var machine = String(variant && variant.serverMachineIdentifier || '');
        var ratingKey = String(variant && variant.ratingKey || '');
        var key;
        if (!machine || !ratingKey) { return; }
        key = machine + ':' + ratingKey;
        if (!seen[key]) {
          seen[key] = true;
          count += 1;
        }
      });
      return count;
    }

    function aggregatedSourceItem() {
      if (!mergedVersionsEnabled()) { return null; }
      var current = controllerSnapshot();
      var selected = current.selectedItem;
      var detail = current.currentDetail;
      var episode;
      if (detail && detail.sourceVariants && detail.sourceVariants.length > 1) { return detail; }
      if (detail && detail.type === 'episode' && current.seriesContext) {
        episode = matchingEpisodeRecord(current.seriesContext.episodes || [], detail);
        if (episode && episode.sourceVariants && episode.sourceVariants.length > 1) { return episode; }
      }
      if (detail && detail.type === 'episode') {
        episode = retainEpisodeVariants(detail);
        if (episode && episode.sourceVariants && episode.sourceVariants.length > 1) { return episode; }
        return null;
      }
      if (detail && detail.type === 'season') { return null; }
      if (selected && selected.sourceVariants && selected.sourceVariants.length > 1) { return selected; }
      return null;
    }

    function currentSeasonExpectsAggregatedVersions() {
      var current;
      var detail;
      var season;
      if (!mergedVersionsEnabled()) { return false; }
      current = controllerSnapshot();
      detail = current.currentDetail;
      if (!detail || detail.type !== 'episode' || !current.seriesContext) { return false; }
      if (aggregatedSeasonHints[String(mediaSeasonNumber(detail))] === true) { return true; }
      season = current.seriesContext.seasons && current.seriesContext.seasons[current.seasonIndex];
      if (!season || !season.sourceVariants || season.sourceVariants.length < 2) {
        season = matchingSeasonRecord(current.seriesContext.seasons || [], detail);
      }
      return !!(season && season.sourceVariants && season.sourceVariants.length > 1);
    }

    function seasonVariantHydrationIdentity(season) {
      var variants = season && season.sourceVariants && season.sourceVariants.length ? season.sourceVariants : [season];
      return variants.map(function (variant) {
        return String(variant && variant.serverMachineIdentifier || '') + ':' + String(variant && variant.ratingKey || '');
      }).sort().join('|') + ':season:' + String(mediaSeasonNumber(season));
    }

    function resetSeasonVariantHydration() {
      seasonVariantHydrationKey = '';
      seasonVariantHydrationPending = false;
      seasonVariantHydrationRequest = null;
      seasonVariantHydrationWaiters = [];
    }

    function loadMergedSeasonEpisodesSingleFlight(season, callback) {
      var key;
      var request = null;
      var completed = false;
      if (!season || !season.sourceVariants || season.sourceVariants.length < 2 || typeof data.loadMergedSeasonEpisodes !== 'function') { return false; }
      key = seasonVariantHydrationIdentity(season);
      if (seasonVariantHydrationPending && seasonVariantHydrationKey === key) {
        seasonVariantHydrationWaiters.push(callback);
        return true;
      }
      if (seasonVariantHydrationPending && seasonVariantHydrationRequest) { abortTrackedRequest(seasonVariantHydrationRequest); }
      resetSeasonVariantHydration();
      seasonVariantHydrationKey = key;
      seasonVariantHydrationPending = true;
      seasonVariantHydrationWaiters.push(callback);
      request = data.loadMergedSeasonEpisodes(season, function (error, episodes) {
        var waiters;
        completed = true;
        if (!seasonVariantHydrationPending || seasonVariantHydrationKey !== key) { return; }
        if (seasonVariantHydrationRequest) { untrackRequest(seasonVariantHydrationRequest); }
        waiters = seasonVariantHydrationWaiters.slice();
        resetSeasonVariantHydration();
        waiters.forEach(function (done) { call(done, error, episodes); });
      });
      if (!completed && request && typeof request.abort === 'function') {
        seasonVariantHydrationRequest = trackRequest(request);
      }
      return true;
    }

    function primeVisibleSeasonVariants() {
      var current = controllerSnapshot();
      var season = current.seriesContext && current.seriesContext.seasons[current.seasonIndex];
      var key;
      var missing = false;
      if (!mergedVersionsEnabled() || !season || !season.sourceVariants || season.sourceVariants.length < 2 ||
          typeof data.loadMergedSeasonEpisodes !== 'function') { return false; }
      (current.seriesContext.episodes || []).forEach(function (episode) {
        if (!episode.sourceVariants || episode.sourceVariants.length < 2) { missing = true; }
      });
      if (!missing) { return false; }
      key = String(season.serverMachineIdentifier || '') + ':' + String(season.ratingKey || '') + ':' + String(mediaSeasonNumber(season));
      if (seasonVariantsRequestedKey === key) { return true; }
      seasonVariantsRequestedKey = key;
      if (!hydrateEpisodeVariantsForVersionBrowser(function (_merged, error) {
        if (error) { seasonVariantsRequestedKey = ''; }
        renderMediaControls();
        updateFocus();
      })) {
        seasonVariantsRequestedKey = '';
        return false;
      }
      return true;
    }

    function mediaProfileReadyForCurrentDetail() {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      return !!(detail && current.mediaProfileLoading !== true &&
        String(current.mediaProfileRatingKey || '') === String(detail.ratingKey || '') && selectedMediaProfile());
    }

    function mediaSeasonNumber(item) {
      if (!item) { return 0; }
      if (item.seasonIndex !== undefined) { return Number(item.seasonIndex || 0); }
      if (item.seasonNumber !== undefined) { return Number(item.seasonNumber || 0); }
      if (item.parentIndex !== undefined) { return Number(item.parentIndex || 0); }
      return Number(item.index || 0);
    }

    function mediaEpisodeNumber(item) {
      if (!item) { return 0; }
      if (item.episodeIndex !== undefined) { return Number(item.episodeIndex || 0); }
      return Number(item.index || 0);
    }

    function matchingEpisodeRecord(episodes, detail) {
      var machine = String(detail && detail.serverMachineIdentifier || '');
      var seasonNumber = mediaSeasonNumber(detail);
      var episodeNumber = mediaEpisodeNumber(detail);
      var hasEpisodeNumber = !!detail && (detail.episodeIndex !== undefined || detail.index !== undefined);
      var index;
      var item;
      for (index = 0; index < (episodes || []).length; index += 1) {
        item = episodes[index];
        if (recordContainsRatingKey(item, detail && detail.ratingKey, machine)) { return item; }
        if (detail && detail.guid && item.guid === detail.guid) { return item; }
      }
      if (!hasEpisodeNumber) { return null; }
      for (index = 0; index < (episodes || []).length; index += 1) {
        item = episodes[index];
        if (item.guid || detail.guid) { continue; }
        if (mediaSeasonNumber(item) === seasonNumber && mediaEpisodeNumber(item) === episodeNumber) { return item; }
      }
      return null;
    }

    function matchingSeasonRecord(seasons, detail) {
      var seasonNumber = mediaSeasonNumber(detail);
      var index;
      for (index = 0; index < (seasons || []).length; index += 1) {
        if (mediaSeasonNumber(seasons[index]) === seasonNumber) { return seasons[index]; }
      }
      return null;
    }

    function hydrateCurrentEpisodeVariants(item, detail, token) {
      var current;
      var patch;
      var episodes;
      var index;
      if (!item || !item.sourceVariants || item.sourceVariants.length < 2) { return null; }
      current = currentDetail();
      if (!tokenIsCurrent(token) || currentView() !== 'detail' || !current ||
          String(current.ratingKey || '') !== String(detail && detail.ratingKey || '') ||
          (detail && detail.serverMachineIdentifier && current.serverMachineIdentifier &&
            String(current.serverMachineIdentifier) !== String(detail.serverMachineIdentifier))) { return null; }
      aggregatedSeasonHints[String(mediaSeasonNumber(detail))] = true;
      patch = { sourceVariants: item.sourceVariants.map(copyRecord) };
      if (item.sourcePreferenceGuid) { patch.sourcePreferenceGuid = item.sourcePreferenceGuid; }
      rememberEpisodeVariants(item);
      controller.patchCurrentDetail(patch);
      episodes = controllerSnapshot().seriesContext && controllerSnapshot().seriesContext.episodes || [];
      for (index = 0; index < episodes.length; index += 1) {
        if (episodes[index] === item || matchingEpisodeRecord([episodes[index]], detail)) {
          controller.patchEpisode(index, patch);
          break;
        }
      }
      return currentDetail();
    }

    function hydrateEpisodeVariantsForVersionBrowser(callback) {
      var current = controllerSnapshot();
      var detail = current.currentDetail;
      var selected = current.selectedItem;
      var activeSeason = current.seriesContext && current.seriesContext.seasons[current.seasonIndex] || null;
      var activeSeasonIdentity = activeSeason ? seasonVariantHydrationIdentity(activeSeason) : '';
      var token = currentToken();

      function detailSessionCurrent() {
        return tokenIsCurrent(token) && currentView() === 'detail';
      }

      function originalEpisodeCurrent() {
        var latest = currentDetail();
        return detailSessionCurrent() && latest && detail &&
          String(latest.ratingKey || '') === String(detail.ratingKey || '') &&
          (!detail.serverMachineIdentifier || !latest.serverMachineIdentifier ||
            String(latest.serverMachineIdentifier) === String(detail.serverMachineIdentifier));
      }

      function normalizedMergedItem(item) {
        var result;
        var preferenceGuid;
        if (!item || item.type && item.type !== 'episode' || !item.sourceVariants || item.sourceVariants.length < 2) { return null; }
        preferenceGuid = String(item.sourcePreferenceGuid || detail && detail.sourcePreferenceGuid || detail && detail.watchlistGuid ||
          selected && selected.type === 'show' && (selected.sourcePreferenceGuid || selected.guid) || '');
        if (!preferenceGuid || item.sourcePreferenceGuid) { return item; }
        result = copyRecord(item);
        result.sourcePreferenceGuid = preferenceGuid;
        return result;
      }

      function finishEpisodes(error, episodes) {
        var merged;
        var currentMerged;
        var currentVisibleDetail;
        var latest;
        var latestSeason;
        var latestSeasonIdentity;
        if (!detailSessionCurrent()) { return; }
        if (!error && episodes) { rememberSeasonEpisodeVariants(episodes); }
        latest = controllerSnapshot();
        latestSeason = latest.seriesContext && latest.seriesContext.seasons[latest.seasonIndex];
        latestSeasonIdentity = latestSeason ? seasonVariantHydrationIdentity(latestSeason) : '';
        if (!error && episodes && latest.seriesContext && latestSeasonIdentity === activeSeasonIdentity) {
          // Keep ownership for the entire visible season, including episodes
          // whose metadata has not been opened yet.
          latest.seriesContext.episodes.forEach(function (episode, index) {
            var match = normalizedMergedItem(matchingEpisodeRecord(episodes, episode));
            if (match) {
              rememberEpisodeVariants(match);
              controller.patchEpisode(index, {
                sourceVariants: match.sourceVariants.map(copyRecord),
                sourcePreferenceGuid: match.sourcePreferenceGuid || episode.sourcePreferenceGuid
              });
            }
          });
          seedSeasonProfiles(latest.seriesContext.episodes);
          currentVisibleDetail = latest.currentDetail;
          currentMerged = normalizedMergedItem(matchingEpisodeRecord(episodes, currentVisibleDetail));
          if (currentMerged) { hydrateCurrentEpisodeVariants(currentMerged, currentVisibleDetail, token); }
        }
        merged = !error ? normalizedMergedItem(matchingEpisodeRecord(episodes || [], detail)) : null;
        if (merged && originalEpisodeCurrent()) { hydrateCurrentEpisodeVariants(merged, detail, token); }
        call(callback, merged, error || null);
      }

      function loadMergedSeason(season) {
        return loadMergedSeasonEpisodesSingleFlight(season, finishEpisodes);
      }

      function recoverFromSeriesContext() {
        if (loadMergedSeason(activeSeason)) { return true; }
        if (!selected || !selected.sourceVariants || selected.sourceVariants.length < 2 || typeof data.loadMergedSeriesContext !== 'function') { return false; }
        trackRequest(data.loadMergedSeriesContext(selected, function (error, context) {
          var season;
          if (!detailSessionCurrent()) { return; }
          season = !error && context ? matchingSeasonRecord(context.seasons || [], detail) : null;
          if (!loadMergedSeason(season)) { call(callback, null, error || null); }
        }));
        return true;
      }

      if (!mergedVersionsEnabled() || !detail || detail.type !== 'episode' || detail.sourceVariants && detail.sourceVariants.length > 1) { return false; }
      var knownEpisode = normalizedMergedItem(matchingEpisodeRecord(current.seriesContext && current.seriesContext.episodes || [], detail));
      if (knownEpisode) {
        hydrateCurrentEpisodeVariants(knownEpisode, detail, token);
        call(callback, knownEpisode, null);
        return true;
      }
      if (activeSeason && activeSeason.sourceVariants && activeSeason.sourceVariants.length > 1 && loadMergedSeason(activeSeason)) { return true; }
      if (detail.guid && typeof data.resolveGuid === 'function') {
        trackRequest(data.resolveGuid(detail.guid, function (error, item) {
          var merged;
          if (!detailSessionCurrent()) { return; }
          merged = !error ? normalizedMergedItem(item) : null;
          if (merged && originalEpisodeCurrent()) {
            hydrateCurrentEpisodeVariants(merged, detail, token);
            call(callback, merged, null);
            return;
          }
          if (!recoverFromSeriesContext()) { call(callback, null, error || null); }
        }));
        return true;
      }
      return recoverFromSeriesContext();
    }

    function sourceVariantLabel(item) {
      var route = sourceRoute(item, null);
      return String(call(data.displayServerName, item && item.serverMachineIdentifier) || item && item.serverName || route && route.context && (route.context.serverName || route.context.name) || item && item.serverMachineIdentifier || '');
    }

    function profileVersions(profile) {
      return profile && profile.versions && profile.versions.length ? profile.versions.slice() : (profile ? [profile] : []);
    }

    function automaticVersion(versions, fallback) {
      if (modules.VersionSelection && typeof modules.VersionSelection.selectAutomatic === 'function') {
        return modules.VersionSelection.selectAutomatic(versions, playbackCapabilities(), settings().playbackMode, settings().videoVersionPriorities) || fallback || null;
      }
      return versions && versions.length ? versions[0] : (fallback || null);
    }

    function sourceVersionValue(machineIdentifier, version, automatic) {
      return 'source:' + String(machineIdentifier || '') + ':' + (automatic ? 'auto' : modules.MediaChoiceModel.versionValue(version));
    }

    function switchDetailSource(item, machineIdentifier, version) {
      var resolved = sourceResolver.resolve(item, { preferredMachine: machineIdentifier });
      var target = resolved && resolved.item;
      var current = currentDetail();
      var currentMachine = String(current && current.serverMachineIdentifier || '');
      if (!target || String(target.serverMachineIdentifier || '') !== String(machineIdentifier || '')) { call(shell.showMessage, t('status.mediaUnavailable')); return false; }
      if (String(machineIdentifier || '') === currentMachine) {
        sourceVersionSelection += 1;
        persistSourcePreference(item, machineIdentifier);
        setPlaybackVersion(version ? version.mediaIndex : null, version ? version.partIndex : null);
        return true;
      }
      if (current && current.type === 'episode' && controllerSnapshot().seriesContext) {
        return switchEpisodeVersion(item, target, version);
      }
      persistSourcePreference(item, machineIdentifier);
      pendingSourceVersionSelection = version ? { machineIdentifier: String(machineIdentifier || ''), mediaIndex: version.mediaIndex, partIndex: version.partIndex } : null;
      return open(target, { returnView: controllerSnapshot().returnView || 'home', visible: true });
    }

    function switchEpisodeVersion(item, target, version) {
      var previous = controllerSnapshot().currentDetail;
      var token = currentToken();
      var selection = ++sourceVersionSelection;
      var row;
      trackRequest(sourceRequest(target, function (configValue, done) {
        return PlexClient.loadMetadata(configValue, target.ratingKey, done);
      }, function (error, detail) {
        if (!tokenIsCurrent(token) || selection !== sourceVersionSelection || controllerSnapshot().currentDetail !== previous) { return; }
        if (error || !detail || !applySourceContext(target)) { call(shell.showMessage, t('status.mediaUnavailable')); return; }
        detail = sourceRouter.decorateItem(detail, activeSourceContext);
        detail.sourceVariants = item.sourceVariants.map(copyRecord);
        detail.sourcePreferenceGuid = item.sourcePreferenceGuid;
        row = aggregatedVersionRows[String(target.serverMachineIdentifier || '')];
        if (!detail.mediaProfile && row && profileCacheKey(row.item) === profileCacheKey(target)) { detail.mediaProfile = row.profile; }
        controller.setCurrentDetail(detail);
        persistSourcePreference(item, target.serverMachineIdentifier);
        pendingSourceVersionSelection = version ? { machineIdentifier: target.serverMachineIdentifier, mediaIndex: version.mediaIndex, partIndex: version.partIndex } : null;
        if (detail.mediaProfile) { prepareMediaProfile(detail); }
        else { queueMediaProfile(detail); }
        renderMediaControls();
        updateFocus();
      }));
      return true;
    }

    function openAggregatedSourceChoice(item) {
      var candidates = sourceResolver.available(item);
      var choices = [{ value: '', label: t('player.automatic') }];
      var selectedValue = sourcePreferences && sourcePreferences.get ? sourcePreferences.get(sourcePreferenceIdentity(item)) : '';
      var index;
      var variantItem;
      for (index = 0; index < candidates.length; index += 1) {
        variantItem = candidates[index].item;
        if (!variantItem.serverMachineIdentifier) { continue; }
        choices.push({
          value: String(variantItem.serverMachineIdentifier),
          label: sourceVariantLabel(variantItem),
          sourceItem: variantItem
        });
      }
      return openOwnedChoice(t('detail.source'), choices, selectedValue, function (choice) {
        var machine = String(choice && choice.value || '');
        if (!machine) {
          persistSourcePreference(item, '');
          pendingSourceVersionSelection = null;
          open(item, { returnView: controllerSnapshot().returnView || 'home', visible: true });
          return;
        }
        switchDetailSource(item, machine, null);
      }, updateFocus) !== false;
    }

    function profileCacheKey(item) {
      return String(item && item.serverMachineIdentifier || '') + ':' + String(item && item.ratingKey || '');
    }

    function episodeDetailCacheKey(item) {
      var key = profileCacheKey(item);
      return item && item.ratingKey && key !== ':' ? key : '';
    }

    function clearSeasonEpisodeDetails() {
      seasonEpisodeDetails = {};
      seasonEpisodeDetailOrder = [];
      aggregatedEpisodeVariants = {};
    }

    function touchEpisodeDetailCache(key) {
      var index = seasonEpisodeDetailOrder.indexOf(key);
      var stale;
      if (index !== -1) { seasonEpisodeDetailOrder.splice(index, 1); }
      seasonEpisodeDetailOrder.push(key);
      while (seasonEpisodeDetailOrder.length > seasonEpisodeDetailLimit) {
        stale = seasonEpisodeDetailOrder.shift();
        delete seasonEpisodeDetails[stale];
      }
    }

    function rememberEpisodeDetail(item, detail) {
      var key = episodeDetailCacheKey(item || detail);
      var cached = key && seasonEpisodeDetails[key];
      var merged;
      var source;
      if (!key || !detail) { return retainEpisodeVariants(detail); }
      merged = copyRecord(cached || {});
      source = item || {};
      Object.keys(source).forEach(function (name) { merged[name] = source[name]; });
      Object.keys(detail).forEach(function (name) { merged[name] = detail[name]; });
      merged = retainEpisodeVariants(merged);
      if (merged.sourceVariants && merged.sourceVariants.length > 1) { rememberEpisodeVariants(merged); }
      seasonEpisodeDetails[key] = copyRecord(merged);
      if (merged.sourceVariants) { seasonEpisodeDetails[key].sourceVariants = copySourceVariants(merged.sourceVariants); }
      touchEpisodeDetailCache(key);
      return copyRecord(merged);
    }

    function cachedEpisodeDetail(item) {
      var key = episodeDetailCacheKey(item);
      var detail = key && seasonEpisodeDetails[key];
      if (!detail) { return null; }
      touchEpisodeDetailCache(key);
      detail = copyRecord(detail);
      if (detail.sourceVariants) { detail.sourceVariants = copySourceVariants(detail.sourceVariants); }
      return retainEpisodeVariants(detail);
    }

    function clearSeasonProfiles() {
      seasonProfiles = {};
    }

    function seedSeasonProfiles(episodes) {
      var seeded = {};
      Object.keys(seasonProfiles).forEach(function (key) { seeded[key] = seasonProfiles[key]; });
      (episodes || []).forEach(function (episode) {
        var candidates = mergedVersionsEnabled()
          ? sourceResolver.available(episode)
          : [{ item: episode, route: sourceRoute(episode) }];
        candidates.forEach(function (candidate) {
          var item = candidate && candidate.item;
          var key = profileCacheKey(item);
          if (item && item.mediaProfile && key !== ':') {
            seeded[key] = { profile: item.mediaProfile, waiters: [] };
          }
        });
      });
      seasonProfiles = seeded;
    }

    function loadCachedProfile(item, configValue, callback) {
      var key = profileCacheKey(item);
      var entry = seasonProfiles[key];
      if (!item || typeof PlexClient.loadMediaProfile !== 'function') { return null; }
      if (entry) {
        if (entry.profile) { callback(null, entry.profile); }
        else { entry.waiters.push(callback); }
        return null;
      }
      if (Object.keys(seasonProfiles).length >= 160) {
        return trackRequest(PlexClient.loadMediaProfile(configValue, item.ratingKey, callback));
      }
      entry = { profile: null, waiters: [callback] };
      seasonProfiles[key] = entry;
      return trackRequest(PlexClient.loadMediaProfile(configValue, item.ratingKey, function (error, profile) {
        var waiters;
        waiters = entry.waiters;
        entry.waiters = [];
        if (!error && profile) { entry.profile = profile; }
        else { delete seasonProfiles[key]; }
        waiters.forEach(function (done) { done(error, profile); });
      }));
    }

    function aggregatedVersionKey(item) {
      if (!item) { return ''; }
      return sourceResolver.available(item).map(function (candidate) {
        return profileCacheKey(candidate.item);
      }).sort().join('|');
    }

    function resetAggregatedVersionProfiles() {
      aggregatedVersionGeneration += 1;
      episodeVariantsRequestedKey = '';
      aggregatedVersionItemKey = '';
      aggregatedVersionRows = {};
      aggregatedVersionRequested = {};
      aggregatedVersionPending = 0;
      aggregatedVersionWaiters = [];
    }

    function addAggregatedVersionRow(sourceItem, profile, versions) {
      var machine = String(sourceItem && sourceItem.serverMachineIdentifier || '');
      if (!machine || !profile) { return false; }
      aggregatedVersionRows[machine] = {
        item: sourceItem,
        machineIdentifier: machine,
        label: sourceVariantLabel(sourceItem),
        profile: profile,
        versions: versions && versions.length ? versions.slice() : profileVersions(profile)
      };
      return true;
    }

    function aggregatedRowsFor(item) {
      var candidates = sourceResolver.available(item);
      var rows = [];
      var seen = {};
      var index;
      var machine;
      var row;
      for (index = 0; index < candidates.length; index += 1) {
        machine = String(candidates[index].item.serverMachineIdentifier || '');
        row = aggregatedVersionKey(item) === aggregatedVersionItemKey && machine && aggregatedVersionRows[machine];
        if (row && profileCacheKey(row.item) !== profileCacheKey(candidates[index].item)) { row = null; }
        if (machine && !seen[machine]) {
          seen[machine] = true;
          rows.push(row || { item: candidates[index].item, machineIdentifier: machine, profile: null, versions: [] });
        }
      }
      return rows;
    }

    function aggregatedVersionChoiceCount(item) {
      var rows = item ? aggregatedRowsFor(item) : [];
      var count = 0;
      rows.forEach(function (row) { count += 1 + (row.versions.length > 1 ? row.versions.length : 0); });
      return count;
    }

    function finishAggregatedVersionProfiles() {
      var waiters;
      var index;
      renderMediaControls();
      if (aggregatedVersionPending > 0 || !aggregatedVersionWaiters.length) { return; }
      waiters = aggregatedVersionWaiters.slice();
      aggregatedVersionWaiters = [];
      for (index = 0; index < waiters.length; index += 1) { call(waiters[index]); }
    }

    function ensureAggregatedVersionProfiles(item, currentProfile, currentVersions, callback) {
      var candidates = sourceResolver.available(item);
      var key = aggregatedVersionKey(item);
      var current = currentDetail() || item;
      var currentMachine = String(current && current.serverMachineIdentifier || item && item.serverMachineIdentifier || '');
      var token = currentToken();
      var index;
      var sourceItem;
      var machine;
      var route;
      if (!item || !item.sourceVariants || item.sourceVariants.length < 2 || !currentProfile || !key) {
        call(callback);
        return false;
      }
      if (aggregatedVersionItemKey !== key) {
        resetAggregatedVersionProfiles();
        aggregatedVersionItemKey = key;
      }
      for (index = 0; index < candidates.length; index += 1) {
        sourceItem = candidates[index].item;
        machine = String(sourceItem.serverMachineIdentifier || '');
        var cached = seasonProfiles[profileCacheKey(sourceItem)];
        if (cached && cached.profile) {
          addAggregatedVersionRow(sourceItem, cached.profile, profileVersions(cached.profile));
          continue;
        }
        if (machine === currentMachine) { addAggregatedVersionRow(sourceItem, currentProfile, currentVersions); continue; }
        if (!machine || aggregatedVersionRequested[machine] || typeof PlexClient.loadMediaProfile !== 'function') { continue; }
        route = candidates[index].route;
        aggregatedVersionRequested[machine] = true;
        aggregatedVersionPending += 1;
        (function (requestedKey, requestedToken, requestedItem, requestedRoute, requestGeneration) {
          loadCachedProfile(requestedItem, requestedRoute.config, function (error, profile) {
            if (requestGeneration !== aggregatedVersionGeneration || requestedKey !== aggregatedVersionItemKey ||
                requestedKey !== aggregatedVersionKey(aggregatedSourceItem()) || !tokenIsCurrent(requestedToken)) { return; }
            if (!error && profile) { addAggregatedVersionRow(requestedItem, profile, profileVersions(profile)); }
            aggregatedVersionPending = Math.max(0, aggregatedVersionPending - 1);
            finishAggregatedVersionProfiles();
          });
        }(key, token, sourceItem, route, aggregatedVersionGeneration));
      }
      if (typeof callback === 'function') {
        if (aggregatedVersionPending > 0) { aggregatedVersionWaiters.push(callback); }
        else { call(callback); }
      }
      return true;
    }

    function aggregatedVersionChoices(item, includeModels) {
      var rows = aggregatedRowsFor(item);
      var choices = [];
      rows.forEach(function (row) {
        var automatic = automaticVersion(row.versions, row.profile);
        var automaticValue;
        automaticValue = sourceVersionValue(row.machineIdentifier, automatic, true);
        choices.push({
          value: automaticValue,
          label: automatic ? mediaVersionSourceLabel(automatic, true, row.item) : t('player.versionAuto') + ' (' + sourceVariantLabel(row.item) + ')',
          model: includeModels && automatic ? mediaInfoModel(automatic) : null,
          sourceMachineIdentifier: row.machineIdentifier,
          sourceItem: row.item,
          version: null
        });
        if (row.versions.length > 1) {
          row.versions.forEach(function (version) {
            choices.push({
              value: sourceVersionValue(row.machineIdentifier, version, false),
              label: mediaVersionSourceLabel(version, false, row.item),
              model: includeModels ? mediaInfoModel(version) : null,
              sourceMachineIdentifier: row.machineIdentifier,
              sourceItem: row.item,
              version: version
            });
          });
        }
      });
      return choices;
    }

    function selectedAggregatedVersionIndex(choices) {
      var current = currentDetail();
      var currentMachine = String(current && current.serverMachineIdentifier || '');
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var override = preferenceState.override || {};
      var index;
      if (override.versionSignature && modules.VersionSelection && typeof modules.VersionSelection.matchesAffinity === 'function') {
        for (index = 0; index < choices.length; index += 1) {
          if (choices[index].sourceMachineIdentifier === currentMachine && choices[index].version && modules.VersionSelection.matchesAffinity(choices[index].version, override.versionSignature)) { return index; }
        }
      }
      for (index = 0; index < choices.length; index += 1) {
        if (choices[index].sourceMachineIdentifier === currentMachine && !choices[index].version) { return index; }
      }
      return 0;
    }

    function cycleAggregatedVersion(item, direction) {
      var choices = aggregatedVersionChoices(item, false);
      var index;
      var next;
      if (choices.length < 2) { return false; }
      index = selectedAggregatedVersionIndex(choices);
      next = choices[(index + Number(direction || 0) + choices.length) % choices.length];
      if (!next || !next.sourceMachineIdentifier) { return false; }
      return switchDetailSource(item, next.sourceMachineIdentifier, next.version || null);
    }

    function openAggregatedVersionDetails(item, currentProfile, currentVersions) {
      ensureAggregatedVersionProfiles(item, currentProfile, currentVersions, function () {
        var choices = aggregatedVersionChoices(item, true);
        var selectedIndex;
        if (!choices.length) { return; }
        selectedIndex = selectedAggregatedVersionIndex(choices);
        openOwnedMediaVersions({
          choices: choices,
          selectedValue: choices[selectedIndex] && choices[selectedIndex].value || choices[0].value,
          apply: function (choice) {
            if (!choice || !choice.sourceMachineIdentifier) { return; }
            switchDetailSource(item, choice.sourceMachineIdentifier, choice.version || null);
          }
        }, 'detail');
      });
      return true;
    }

    function openVersionDetails() { return openVersionDetailsResolved(false); }

    function openVersionDetailsResolved(skipEpisodeHydration) {
      var versions = detailMediaVersions();
      var preferenceState = preferences.snapshot ? preferences.snapshot() : {};
      var override = preferenceState.override;
      var automatic = selectedMediaProfile();
      var choices = [];
      var selectedValue;
      var index;
      var version;
      var value;
      var aggregated = aggregatedSourceItem();
      if (!aggregated && skipEpisodeHydration !== true && hydrateEpisodeVariantsForVersionBrowser(function () { openVersionDetailsResolved(true); })) { return true; }
      aggregated = aggregatedSourceItem();
      if (aggregated && automatic && dialogs.openMediaVersions) { return openAggregatedVersionDetails(aggregated, automatic, versions); }
      if (aggregated && !automatic && dialogs.openChoice) { return openAggregatedSourceChoice(aggregated); }
      if (!versions.length || !automatic || !dialogs.openMediaVersions) { return false; }
      selectedValue = override && override.versionSignature ? null : 'auto';
      if (override && override.versionSignature) {
        if (modules.VersionSelection && modules.VersionSelection.matchesAffinity && modules.VersionSelection.matchesAffinity(automatic, override.versionSignature)) {
          selectedValue = modules.MediaChoiceModel.versionValue(automatic);
        }
        if (!selectedValue) { selectedValue = 'auto'; }
      }
      if (versions.length === 1) {
        choices.push({
          value: selectedValue,
          label: mediaVersionSourceLabel(automatic, selectedValue === 'auto', currentDetail()),
          model: mediaInfoModel(automatic)
        });
      } else {
        choices.push({ value: 'auto', label: mediaVersionSourceLabel(automatic, true, currentDetail()), model: mediaInfoModel(automatic) });
        for (index = 0; index < versions.length; index += 1) {
          version = versions[index];
          value = modules.MediaChoiceModel.versionValue(version);
          choices.push({ value: value, label: mediaVersionSourceLabel(version, false, currentDetail()), model: mediaInfoModel(version) });
        }
      }
      return openOwnedMediaVersions({
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

    function currentEpisode() {
      var current = controllerSnapshot();
      return current.seriesContext && current.seriesContext.episodes[current.episodeIndex] || null;
    }

    function syncSeasonPlaybackState(episodes) {
      var current = controllerSnapshot();
      var currentEpisode = current.seriesContext && current.seriesContext.episodes[current.episodeIndex];
      var selectedKey = currentEpisode && currentEpisode.ratingKey || current.currentDetail && current.currentDetail.ratingKey || '';
      var index;
      var fresh;
      if (!current.seriesContext || !episodes || !episodes.length) { return false; }
      episodes = retainEpisodeVariantRecords(episodes);
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

    function finishSeasonBulk(season, watched, total, failures, successKey) {
      var token = currentToken();
      loadSeasonEpisodes(season, '', function (error, episodes) {
        var activeSeason = currentSeason();
        var current = tokenIsCurrent(token);
        if (current) { resetSeasonBulkState(); }
        if (current && currentView() === 'detail' && !error && activeSeason && String(activeSeason.ratingKey || '') === String(season.ratingKey || '')) {
          syncSeasonPlaybackState(episodes || []);
        }
        if (!current || currentView() !== 'detail') { return; }
        if (error) { call(shell.showMessage, t('status.updateError')); return; }
        if (failures > 0) { call(shell.showMessage, t('detail.seasonBulkPartial', { count: failures })); }
        else { call(shell.showMessage, t(successKey || (watched ? 'detail.seasonWatchedComplete' : 'detail.seasonUnwatchedComplete'), { count: total })); }
      });
    }

    function runWatchedEpisodeBatch(source, watched, token, skipAlreadyWatched, callback) {
      var index = 0;
      var failures = 0;
      var ownerSourceContext = sourceContext();
      function next() {
        var episode;
        if (!tokenIsCurrent(token)) { return; }
        if (index >= source.length) { callback(failures); return; }
        episode = source[index];
        index += 1;
        if (!episode || !episode.ratingKey) { failures += 1; next(); return; }
        if (skipAlreadyWatched && episode.viewed) { next(); return; }
        trackRequest(sourceRequest(episode, function (requestConfigValue, done) {
          return PlexClient.setWatchedAndReset(requestConfigValue, episode.ratingKey, watched, done);
        }, function (watchedError, outcome) {
          if (watchedError) { failures += 1; }
          if (!watchedError || outcome && outcome.watchedApplied === true) {
            call(transitions.onWatchedChanged, episode.ratingKey, watched, ownerSourceContext);
          }
          next();
        }));
      }
      next();
    }

    function applySeasonWatched(watched) {
      var season = currentSeason();
      var token = currentToken();
      if (!season || seasonBulkPending || typeof PlexClient.loadSeasonEpisodes !== 'function' || typeof PlexClient.setWatchedAndReset !== 'function') { return false; }
      seasonBulkPending = true;
      if (node('detail-options')) { node('detail-options').disabled = true; }
      loadSeasonEpisodes(season, '', function (error, episodes) {
        var source = episodes || [];
        if (error || !source.length) {
          if (tokenIsCurrent(token)) { resetSeasonBulkState(); }
          if (tokenIsCurrent(token) && currentView() === 'detail') { call(shell.showMessage, error ? t('status.updateError') : t('status.mediaUnavailable')); }
          return;
        }
        runWatchedEpisodeBatch(source, watched, token, false, function (failures) {
          finishSeasonBulk(season, watched, source.length, failures);
        });
      });
      return true;
    }

    function applyPreviousEpisodesWatched(season, selectedKey) {
      var token = currentToken();
      if (!season || !selectedKey || seasonBulkPending || typeof PlexClient.loadSeasonEpisodes !== 'function' || typeof PlexClient.setWatchedAndReset !== 'function') { return false; }
      seasonBulkPending = true;
      if (node('detail-options')) { node('detail-options').disabled = true; }
      loadSeasonEpisodes(season, '', function (error, episodes) {
        var source = episodes || [];
        var selectedIndex = -1;
        var index;
        if (!error) {
          for (index = 0; index < source.length; index += 1) {
            if (String(source[index] && source[index].ratingKey || '') === String(selectedKey)) { selectedIndex = index; break; }
          }
        }
        if (error || selectedIndex <= 0) {
          if (tokenIsCurrent(token)) { resetSeasonBulkState(); }
          if (tokenIsCurrent(token) && currentView() === 'detail') { call(shell.showMessage, error ? t('status.updateError') : t('status.mediaUnavailable')); }
          return;
        }
        source = source.slice(0, selectedIndex);
        runWatchedEpisodeBatch(source, true, token, true, function (failures) {
          finishSeasonBulk(season, true, source.length, failures, 'detail.previousWatchedComplete');
        });
      });
      return true;
    }

    function confirmPreviousEpisodesWatched() {
      var current = controllerSnapshot();
      var season = currentSeason();
      var episode = currentEpisode();
      var count = Number(current.episodeIndex || 0);
      var selectedKey = String(episode && episode.ratingKey || '');
      if (!season || !selectedKey || count <= 0) { return false; }
      return openOwnedChoice(
        t('detail.markPreviousWatchedConfirm', { count: count }),
        [{ value: 'previous-watched', label: t('detail.markPreviousWatched') }],
        '',
        function () { applyPreviousEpisodesWatched(season, selectedKey); },
        updateFocus
      ) !== false;
    }

    function confirmSeasonWatched(watched) {
      var current = controllerSnapshot();
      var season = currentSeason();
      var count = current.seriesContext && current.seriesContext.episodes ? current.seriesContext.episodes.length : 0;
      var key = watched ? 'detail.markSeasonWatched' : 'detail.markSeasonUnwatched';
      if (!season) { return false; }
      return openOwnedChoice(
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
      var requestConfigValue;
      if (!detailState.fromContinueWatching || !detail || !detail.ratingKey || !data.mediaContext || typeof data.mediaContext.removeFromContinueWatching !== 'function') { return false; }
      requestConfigValue = requestConfig();
      if (!requestConfigValue) {
        call(shell.showMessage, t('status.mediaUnavailable'));
        return false;
      }
      target = { item: detail, view: 'detail', inContinueWatching: true, config: requestConfigValue };
      return call(data.mediaContext.removeFromContinueWatching, target, function (error) {
        if (!error && tokenIsCurrent(token) && controller.setFromContinueWatching) { controller.setFromContinueWatching(false); }
      }) !== false;
    }

    function openDetailOptions() {
      var detailState = controllerSnapshot();
      var detail = currentDetail() || detailState.selectedItem;
      var season = currentSeason();
      var episode = currentEpisode();
      var choices = [];
      var partial = detail && (Math.max(0, Number(detail.viewOffset || 0)) > 0 || Math.max(0, Number(detail.progress || 0)) > 0);
      if (partial) {
        choices.push({
          value: detail.viewed ? 'mark-watched' : 'mark-unwatched',
          label: t(detail.viewed ? 'detail.markWatched' : 'detail.markUnwatched')
        });
      }
      if (season && episode && episode.ratingKey && Number(detailState.episodeIndex || 0) > 0) {
        choices.push({ value: 'previous-watched', label: t('detail.markPreviousWatched') });
      }
      if (season) {
        choices.push({ value: 'season-watched', label: t('detail.markSeasonWatched') });
        choices.push({ value: 'season-unwatched', label: t('detail.markSeasonUnwatched') });
      }
      if (detailState.fromContinueWatching) { choices.push({ value: 'remove-continue', label: t('mediaActions.removeContinue') }); }
      if (!activeSourceContext || activeSourceContext.owned !== false) { choices.push({ value: 'refresh-metadata', label: t('detail.refreshMetadata') }); }
      return openOwnedChoice(t('detail.mediaOptions'), choices, '', function (choice) {
        if (!choice) { return; }
        if (choice.value === 'mark-watched') { setWatchedState(true); }
        else if (choice.value === 'mark-unwatched') { setWatchedState(false); }
        else if (choice.value === 'previous-watched') { confirmPreviousEpisodesWatched(); }
        else if (choice.value === 'season-watched') { confirmSeasonWatched(true); }
        else if (choice.value === 'season-unwatched') { confirmSeasonWatched(false); }
        else if (choice.value === 'remove-continue') { removeContinueWatching(); }
        else if (choice.value === 'refresh-metadata') { refreshCurrentMetadata(); }
      }, updateFocus) !== false;
    }

    function applyLocalPlaybackProgress(ratingKey, seconds) {
      if (!controller.recordPlaybackProgress(ratingKey, seconds)) { return false; }
      updateEpisodeCardsPlaybackState();
      return true;
    }

    function reconcileEpisodePlaybackState(freshEpisodes) {
      var detail;
      controller.reconcilePlaybackEpisodes(freshEpisodes);
      detail = currentDetail();
      if (detail) { setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched')); }
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
      freshEpisodes = sourceOwnedRecords(freshEpisodes);
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
      loadSeasonEpisodes(season, ratingKey || '', function (error, episodes) {
        var latest = controllerSnapshot();
        var activeSeason = latest.seriesContext && latest.seriesContext.seasons[latest.seasonIndex];
        if (!tokenIsCurrent(token) || error || currentView() !== 'detail' || !activeSeason || String(activeSeason.ratingKey || '') !== seasonKey) { return; }
        hydratePlaybackSeason(episodes, ratingKey);
        reconcileEpisodePlaybackState(episodes);
        updateEpisodeCardsPlaybackState();
        if (!retried && controller.playbackProgressPending(ratingKey)) {
          schedule(function () { refreshPlaybackState(ratingKey, _expectedSeconds, true); }, 650);
        }
      });
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
      var view = node('detail-view');
      var preserveExtended = controllerSnapshot().zone === 'extended';
      setDetailViewMode(false);
      if (view) { view.className = 'detail-view is-hidden' + (preserveExtended ? ' is-extended' : ''); }
    }

    function showSurface(optionsValue) {
      var view = node('detail-view');
      var restoreExtended = controllerSnapshot().zone === 'extended';
      var snapImmediately;
      var className;
      optionsValue = optionsValue || {};
      if (!currentDetail()) { return false; }
      snapImmediately = optionsValue.snapImmediately === true;
      setDetailViewMode(true);
      if (optionsValue.backLockedUntil !== undefined) { controller.setBackLockedUntil(Number(optionsValue.backLockedUntil || 0)); }
      if (view) {
        className = 'detail-view' + (restoreExtended ? ' is-extended' : '') + (snapImmediately ? ' is-snap-restoring' : '');
        view.className = className;
        if (snapImmediately) {
          view.offsetWidth;
          view.className = className.replace(/\s*is-snap-restoring/g, '');
        }
      }
      if (episodeView && episodeView.refreshSeasonOverflow) { episodeView.refreshSeasonOverflow(); }
      if (optionsValue.ensureMediaProfile === true) { ensureMediaProfile(currentDetail()); }
      if (optionsValue.renderEpisodeContext === true) { renderEpisodeContext(); }
      updateFocus();
      if (optionsValue.restoreTheme !== false) { call(shell.scheduleTheme, currentDetail(), sourceContext()); }
      return true;
    }

    function resumeAfterPlayer(backLockedUntil) {
      return showSurface({
        backLockedUntil: Number(backLockedUntil || 0),
        ensureMediaProfile: true,
        renderEpisodeContext: true,
        restoreTheme: true,
        snapImmediately: true
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
      resetExtendedDetail();
      resetSeasonBulkState();
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
      seasonVariantsRequestedKey = '';
      resetSeasonVariantHydration();
      aggregatedSeasonHints = {};
      clearSeasonProfiles();
      clearSeasonEpisodeDetails();
      clearFeatureTimers();
      lastPresentationKey = '';
      resetAggregatedVersionProfiles();
      if (controller.cancelTransitions) { controller.cancelTransitions(); }
      if (hasFocusedClass(renderedFocusTarget) && focusTargetConnected(renderedFocusTarget)) { removeFocusedClass(renderedFocusTarget); }
      renderedFocusTarget = null;
      renderedFocusScope = '';
      cleanupPresentation();
      activeSourceContext = null;
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
      mediaTitle: shell.mediaTitle,
      sourceContext: sourceContext,
      t: t,
      onSeasonActivate: function (index) {
        controller.setFocus({ seasonIndex: episodeView.setSeasonIndex(index, false) });
        loadSelectedSeason();
      },
      onEpisodeActivate: function (index) {
        controller.setFocus({ episodeIndex: episodeView.setEpisodeIndex(index, false) });
        if (controllerSnapshot().seriesContext) { playSelectedEpisode(controllerSnapshot().seriesContext.episodes[controllerSnapshot().episodeIndex]); }
      },
      onEpisodeBrowse: function (index) {
        controller.setFocus({ zone: 'episodes', episodeIndex: index });
        scheduleEpisodeDetail();
        updateFocus();
      }
    });

    extendedView = modules.DetailExtendedView.create({
      document: document,
      element: shell.element,
      ProgressiveImages: modules.ProgressiveImages,
      posterLoader: call(shell.posterLoader),
      sourceContext: sourceContext,
      t: t
    });

    controller = modules.DetailController.create({
      root: root,
      DetailNavigation: modules.DetailNavigation,
      MetadataRefresh: modules.MetadataRefresh,
      clearPreferences: function () { preferences.clear(); },
      loadMetadata: function (ratingKey, callback, ownerItem) {
        return trackRequest(sourceRequest(ownerItem, function (configValue, done) {
          return call(PlexClient.loadMetadata, configValue, ratingKey, done);
        }, callback));
      },
      preparePreferences: function (identity, detail) { return preferences.prepare(identity, detail); },
      loadMediaProfile: function (ratingKey, callback) {
        return trackRequest(sourceRequest(currentDetail(), function (configValue, done) {
          return loadCachedProfile(currentDetail(), configValue, function (error, profile) {
            done(error, profile);
          });
        }, callback));
      },
      setMediaProfile: function (profile) { return preferences.setProfile(profile); },
      onMediaProfileState: function (current) {
        if (currentView() !== 'detail') { return; }
        renderMediaControls();
        if (!current.mediaProfileLoading) {
          var detail = currentDetail();
          var episodeKey = detail && String(detail.serverMachineIdentifier || '') + ':' + String(detail.ratingKey || '');
          var seasonHydrationCovered;
          call(data.onAssPrefetchCandidate, detail, selectedMediaProfile(), resolvedTracks());
          ensureAggregatedVersionProfiles(aggregatedSourceItem(), selectedMediaProfile(), detailMediaVersions());
          // Aggregated rows can be satisfied synchronously by the batch season
          // metadata. Reflect them without issuing per-episode prefetches.
          renderMediaControls();
          seasonHydrationCovered = primeVisibleSeasonVariants();
          if (mergedVersionsEnabled() && detail && detail.type === 'episode' && !aggregatedSourceItem() &&
              !seasonHydrationCovered && !currentSeasonExpectsAggregatedVersions() && episodeVariantsRequestedKey !== episodeKey) {
            episodeVariantsRequestedKey = episodeKey;
            hydrateEpisodeVariantsForVersionBrowser(function () {
              ensureAggregatedVersionProfiles(aggregatedSourceItem(), selectedMediaProfile(), detailMediaVersions());
              renderMediaControls();
            });
          }
          if (pendingSourceVersionSelection && currentDetail() && String(currentDetail().serverMachineIdentifier || '') === pendingSourceVersionSelection.machineIdentifier) {
            setPlaybackVersion(pendingSourceVersionSelection.mediaIndex, pendingSourceVersionSelection.partIndex);
            pendingSourceVersionSelection = null;
          }
        }
        if (!current.mediaProfileLoading && String(current.mediaProfileRatingKey) === String(controllerSnapshot().seasonTransitionMediaKey || '')) {
          controller.setSeasonTransitionMediaKey('');
          animateSeasonContent('detail-playback-controls');
        }
        updateFocus();
      },
      playbackPreferences: playbackPreferences,
      playbackPreferencesFor: playbackPreferencesFor,
      selectedMediaProfile: selectedMediaProfile,
      resolvedTracks: resolvedTracks,
      requestPlayback: function (request) { return call(transitions.requestPlayback, request); },
      refreshMetadata: function (key, callback) {
        return trackRequest(sourceRequest(currentDetail(), function (configValue, done) {
          return call(PlexClient.refreshMetadata, configValue, key, done);
        }, callback));
      },
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
      activateExtended: activateExtended,
      now: function () { return new Date().getTime(); }
    });

    bindClick('detail-play', function () { controller.requestPlayback({ resume: false }); });
    bindClick('detail-back', close);
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
      cancelPendingPlayIntent: cancelPendingPlayIntent,
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
      sourceContext: sourceContext,
      queueSnapshot: queueSnapshot,
      playbackPreferences: playbackPreferences,
      playbackPreferencesFor: playbackPreferencesFor,
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

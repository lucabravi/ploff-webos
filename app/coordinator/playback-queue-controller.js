(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlaybackQueueController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var root = values.root || {};
    var model = values.PlaybackQueueModel;
    var timing = values.UpNextTiming;
    var upNext = values.UpNextState && values.UpNextState.create ? values.UpNextState.create() : null;
    var contract = values.QueueSequenceContract;
    var Cache = values.BoundedQueueCache;
    var SeriesQueueProvider = values.SeriesQueueProvider;
    var PlexContainerQueueProvider = values.PlexContainerQueueProvider;
    var seriesProvider = null;
    var containerProvider = null;
    var sequenceKind = '';
    var sequenceIdentity = '';
    var sequenceContainer = null;
    var state = {
      playlistPlaybackQueue: null,
      playlistPlaybackAutoToken: 0,
      playbackMetadataRequestToken: 0,
      adjacentTokens:[0,0],
      seriesPlaybackQueue: null,
      playlistQueueDrawerOpen: false,
      playlistQueueDrawerIndex: 0,
      playlistQueueDrawerFocusReady: false,
      playlistQueueDrawerFocusTimer: null,
      playlistQueueDrawerWindowToken: 0,
      playlistDirectPlayToken: 0,
      playlistDirectPlayOrigin: false,
      playlistDirectPlayPending: false,
      autoplayTimer: null,
      autoplaySeconds: 0,
      autoplayVisible: false,
      autoplayPreparing: false,
      autoplayDismissed: false,
      autoplayTarget: null,
      autoplayBackdropToken: 0,
      autoplayResolutionToken: 0,
      autoplayBackdropPrefetchKey: '',
      containerOrigin: null,
      adjacentPreviousState: 'unavailable',
      adjacentNextState: 'unavailable',
      destroyed: false
    };
    var requests = { metadata: null };
    var timers = { drawer: null, directPlay: null, upNext: null };
    var drawerWindowRequest = null;


    if (contract && Cache && SeriesQueueProvider && typeof SeriesQueueProvider.create === 'function') {
      seriesProvider = SeriesQueueProvider.create({
        QueueSequenceContract: contract,
        BoundedQueueCache: Cache,
        pageSize: 40,
        maxPages: 5,
        maxRecords: 200,
        loadSeasonEpisodes: function (season, callback) { return call(values.loadSeasonEpisodes, season, callback); }
      });
    }
    if (contract && Cache && PlexContainerQueueProvider && typeof PlexContainerQueueProvider.create === 'function') {
      containerProvider = PlexContainerQueueProvider.create({
        QueueSequenceContract: contract,
        BoundedQueueCache: Cache,
        pageSize: 40,
        maxPages: 5,
        maxRecords: 200,
        loadPage: function (request, callback) {
          var container = sequenceContainer;
          if (!container) { call(callback, new Error('queue origin unavailable')); return null; }
          return call(values.loadContainerPage, container, request.start, request.size, function (error, page) {
            call(callback, error || null, page ? { items: page.items || [], total: page.totalSize } : null);
          });
        }
      });
    }

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }

    function abort(request) {
      if (request && typeof request.abort === 'function') { request.abort(); }
    }

    function clearTimer(name) {
      if (timers[name] !== null && root.clearTimeout) { root.clearTimeout(timers[name]); }
      timers[name] = null;
      if (name === 'drawer') { state.playlistQueueDrawerFocusTimer = null; }
      if (name === 'upNext') { state.autoplayTimer = null; }
    }

    function setTimer(name, callback, delay) {
      clearTimer(name);
      if (!root.setTimeout) { call(callback); return null; }
      timers[name] = root.setTimeout(function () {
        timers[name] = null;
        if (name === 'drawer') { state.playlistQueueDrawerFocusTimer = null; }
        if (name === 'upNext') { state.autoplayTimer = null; }
        if (!state.destroyed) { call(callback); }
      }, Math.max(0, Number(delay || 0)));
      if (name === 'drawer') { state.playlistQueueDrawerFocusTimer = timers[name]; }
      if (name === 'upNext') { state.autoplayTimer = timers[name]; }
      return timers[name];
    }

    function cancelRequest(name) {
      abort(requests[name]);
      requests[name] = null;
    }

    function invalidateMetadataRequest() {
      state.playbackMetadataRequestToken += 1;
      cancelRequest('metadata');
      return state.playbackMetadataRequestToken;
    }

    function loadCurrentMetadata(ratingKey, callback) {
      var token = invalidateMetadataRequest();
      var completed = false;
      var request = call(values.loadMetadata, ratingKey, function (error, detail) {
        completed = true;
        if (state.destroyed || token !== state.playbackMetadataRequestToken) { return; }
        requests.metadata = null;
        call(callback, error || null, detail || null);
      });
      if (!completed && token === state.playbackMetadataRequestToken) { requests.metadata = request || null; }
      return request || null;
    }

    function playable(items) { return model.playableItems(items || []); }
    function createQueue(items, ratingKey, title, preferredIndex) { return model.createQueue(items || [], ratingKey, title, preferredIndex); }
    function currentIndex(items, ratingKey, preferredIndex) { return model.currentIndex(items || [], ratingKey, preferredIndex); }
    function firstUnfinished(items) { return model.firstUnfinishedIndex(items || []); }
    function queueContext(queue) { return model.seriesContext(queue); }

    function updateContainerQueueCurrent(queue, index, item, occurrenceId) {
      var absoluteIndex = Number(index);
      if (!queue || queue.kind === 'series' || !item) { return false; }
      queue.index = isFinite(absoluteIndex) && absoluteIndex >= 0 ? absoluteIndex : 0;
      queue.currentItem = copyRecord(item);
      queue.currentOccurrenceId = String(occurrenceId || '');
      queue.total = drawerTotal(queue);
      return true;
    }

    function containerActivationResult(queue, item, localIndex, absoluteIndex, occurrenceId) {
      var resident = localIndex === absoluteIndex && queue.items && queue.items[localIndex];
      var context = queueContext(resident ? queue : { items: [item], index: 0, title: queue.title });
      context.queueAbsoluteIndex = absoluteIndex;
      context.queueTotal = queue.total;
      context.queueOccurrenceId = String(occurrenceId || '');
      return {
        queue: queue,
        context: context,
        index: resident ? localIndex : 0,
        absoluteIndex: absoluteIndex
      };
    }


    function setAdjacentState(direction, nextState) {
      if (Number(direction) < 0) { state.adjacentPreviousState = String(nextState || 'unavailable'); }
      else { state.adjacentNextState = String(nextState || 'unavailable'); }
    }

    function containerIdentity(container) {
      var kind = model.containerKind(container);
      var id = container && (container.containerKey || container.ratingKey || container.key || container.id || container.title) || '';
      return kind && id ? kind + '|' + String(id) : '';
    }

    function seriesSeasonNumber(detail) {
      var context = detail && detail.seriesContext || {};
      var season = context.seasons && context.seasons[Number(detail && detail.seasonIndex || 0)] || {};
      var current = detail && detail.currentDetail || {};
      if (current.parentIndex !== undefined) { return Number(current.parentIndex || 0); }
      if (current.seasonIndex !== undefined) { return Number(current.seasonIndex || 0); }
      return Number(season.index || 0);
    }

    function seriesSequenceIdentity(detail) {
      var current = detail && detail.currentDetail || {};
      var id = current.showRatingKey || current.grandparentRatingKey || current.grandparentTitle || current.title || seriesIdentity(detail);
      var scope = contract ? contract.seriesScope({ seasonNumber: seriesSeasonNumber(detail) }) : 'regular';
      return String(id || '') + '|' + scope;
    }

    function closeSequenceProviders() {
      if (seriesProvider && typeof seriesProvider.close === 'function') { seriesProvider.close(); }
      if (containerProvider && typeof containerProvider.close === 'function') { containerProvider.close(); }
      sequenceKind = '';
      sequenceIdentity = '';
      sequenceContainer = null;
      state.adjacentPreviousState = 'unavailable';
      state.adjacentNextState = 'unavailable';
    }

    function ensureSeriesSequence(detail) {
      var identity;
      var current;
      var context;
      var seasonNumber;
      if (!seriesProvider || !seriesEligible(detail)) { return null; }
      identity = seriesSequenceIdentity(detail);
      if (sequenceKind !== 'series' || sequenceIdentity !== identity) {
        closeSequenceProviders();
        current = detail.currentDetail || {};
        context = detail.seriesContext || {};
        seasonNumber = seriesSeasonNumber(detail);
        seriesProvider.open({
          kind: 'series',
          id: String(current.showRatingKey || current.grandparentRatingKey || current.grandparentTitle || current.title || identity),
          title: String(current.grandparentTitle || current.title || call(values.queueLabel) || 'Queue'),
          seasons: context.seasons || [],
          currentItem: current,
          currentSeasonNumber: seasonNumber,
          currentEpisodeNumber: Number(current.index || current.episodeIndex || 0),
          currentSeasonEpisodes: context.episodes || [current]
        });
        sequenceKind = 'series';
        sequenceIdentity = identity;
      } else if (typeof seriesProvider.setCurrent === 'function') {
        seriesProvider.setCurrent(detail.currentDetail);
      }
      return seriesProvider;
    }

    function ensureContainerSequence(container) {
      var identity;
      /** @type {{kind:string, id:string, title:string, total?:number}} */
      var origin;
      var total;
      if (!containerProvider || !container || !model.containerKind(container)) { return null; }
      identity = containerIdentity(container);
      if (sequenceKind !== 'container' || sequenceIdentity !== identity) {
        closeSequenceProviders();
        sequenceContainer = container;
        origin = {
          kind: model.containerKind(container),
          id: String(container.containerKey || container.ratingKey || container.key || container.id || container.title || ''),
          title: String(container.title || '')
        };
        total = Number(container.totalSize);
        if (container.totalSize !== null && container.totalSize !== undefined && isFinite(total) && total >= 0) { origin.total = total; }
        containerProvider.open(origin);
        sequenceKind = 'container';
        sequenceIdentity = identity;
      } else {
        sequenceContainer = container;
      }
      return containerProvider;
    }

    function findSeriesSeasonIndex(detail, seasonNumberValue) {
      var seasons = detail && detail.seriesContext && detail.seriesContext.seasons || [];
      var index;
      for (index = 0; index < seasons.length; index += 1) {
        if (Number(seasons[index] && seasons[index].index || 0) === Number(seasonNumberValue)) { return index; }
      }
      return 0;
    }

    function findEpisodeIndex(episodes, ratingKey, episodeNumberValue) {
      var index;
      for (index = 0; index < (episodes || []).length; index += 1) {
        if (String(episodes[index] && episodes[index].ratingKey || '') === String(ratingKey || '')) { return index; }
      }
      for (index = 0; index < (episodes || []).length; index += 1) {
        if (Number(episodes[index] && episodes[index].index || 0) === Number(episodeNumberValue)) { return index; }
      }
      return 0;
    }

    function normalizeSeriesTarget(result, queue, detail, direction) {
      var item = copyRecord(result.item) || {};
      var context = detail && detail.seriesContext || {};
      var seasonIndex = findSeriesSeasonIndex(detail, result.seasonNumber);
      var currentSeasonNumber = seriesSeasonNumber(detail);
      var episodes = Number(currentSeasonNumber) === Number(result.seasonNumber) ? (context.episodes || []) : [item];
      var episodeIndex = findEpisodeIndex(episodes, item.ratingKey, result.episodeNumber);
      var queueIndex = queue ? activeIndex(queue, detail) + (Number(direction) < 0 ? -1 : 1) : 0;
      var index;
      if (queue && queue.items) {
        for (index = 0; index < queue.items.length; index += 1) {
          if (String(queue.items[index].ratingKey || '') === String(item.ratingKey || '') &&
              Number(queue.items[index].queueSeasonNumber || 0) === Number(result.seasonNumber) &&
              Number(queue.items[index].queueEpisodeNumber || 0) === Number(result.episodeNumber)) {
            item = queue.items[index];
            queueIndex = index;
            episodes = item.queueEpisodes || episodes;
            episodeIndex = Number(item.queueEpisodeIndex || episodeIndex);
            seasonIndex = Number(item.queueSeasonIndex || seasonIndex);
            break;
          }
        }
      }
      if (!item.queueEpisodes) { item.queueEpisodes = episodes; }
      item.queueSeasonIndex = seasonIndex;
      item.queueEpisodeIndex = episodeIndex;
      item.queueSeasonNumber = Number(result.seasonNumber || 0);
      item.queueEpisodeNumber = Number(result.episodeNumber || 0);
      return {
        state: 'available',
        providerKind: 'series',
        occurrenceId: String(result.occurrenceId || ''),
        seasonNumber: Number(result.seasonNumber || 0),
        episodeNumber: Number(result.episodeNumber || 0),
        item: item,
        queue: queue,
        index: Math.max(0, Number(queueIndex || 0))
      };
    }

    function normalizeContainerTarget(result, queue) {
      return {
        state: 'available',
        providerKind: 'container',
        occurrenceId: String(result.occurrenceId || ''),
        absoluteIndex: Number(result.absoluteIndex || 0),
        item: result.item,
        queue: queue,
        index: Number(result.absoluteIndex || 0)
      };
    }

    function normalizeSequenceResult(result, queue, detail, direction) {
      var confirmation;
      var target;
      if (!result || result.state === 'unavailable') { return { state: 'unavailable' }; }
      if (result.state === 'resolving') { return { state: 'resolving' }; }
      if (result.state === 'available') {
        return sequenceKind === 'series' ? normalizeSeriesTarget(result, queue, detail, direction) : normalizeContainerTarget(result, queue);
      }
      if (result.state === 'confirmation-required') {
        confirmation = copyRecord(result.confirmation) || {};
        if (result.confirmation && result.confirmation.missingSeasons) { confirmation.missingSeasons = copyRecord(result.confirmation.missingSeasons); }
        if (result.confirmation && result.confirmation.missingEpisodes) { confirmation.missingEpisodes = copyRecord(result.confirmation.missingEpisodes); }
        target = result.confirmation && result.confirmation.target;
        if (target) { confirmation.target = normalizeSeriesTarget(target, queue, detail, direction); }
        return { state: 'confirmation-required', confirmation: confirmation };
      }
      return { state: 'unavailable' };
    }

    function detailSnapshot(snapshot) {
      return snapshot || call(values.currentDetailSnapshot) || call(values.detailSnapshot) || {};
    }

    function seriesEligible(snapshot) {
      var detail = detailSnapshot(snapshot);
      var context = detail.seriesContext;
      return !!(context && !context.playlistQueue && detail.currentDetail && detail.currentDetail.type === 'episode' &&
        context.seasons && context.seasons.length && context.episodes && context.episodes.length);
    }

    function seriesIdentity(snapshot) {
      var detail = detailSnapshot(snapshot);
      var current = detail.currentDetail || {};
      var context = detail.seriesContext || {};
      var seasonKeys = (context.seasons || []).map(function (season) { return String(season && season.ratingKey || ''); }).join(',');
      return String(current.showRatingKey || current.title || '') + '|' + seasonKeys;
    }

    function seriesCurrentIndex(queue, snapshot) {
      var detail = detailSnapshot(snapshot);
      var items = queue && queue.items || [];
      var key = detail.currentDetail && detail.currentDetail.ratingKey;
      var index;
      for (index = 0; index < items.length; index += 1) {
        if (Number(items[index].queueSeasonIndex) === Number(detail.seasonIndex) &&
            Number(items[index].queueEpisodeIndex) === Number(detail.episodeIndex)) { return index; }
      }
      return currentIndex(items, key, 0);
    }

    function resetSeries() {
      var changed = !!state.seriesPlaybackQueue;
      state.seriesPlaybackQueue = null;
      if (changed) { call(values.onQueueChanged, snapshot()); }
    }

    function createSeries(snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var context = detail.seriesContext;
      var season;
      var items;
      if (!seriesEligible(detail)) { return null; }
      season = context.seasons[detail.seasonIndex];
      items = model.seriesItems(season, detail.seasonIndex, context.episodes, 0);
      if (!items.length) { return null; }
      return {
        kind: 'series',
        identity: seriesIdentity(detail),
        title: String(detail.currentDetail.title || call(values.queueLabel) || 'Queue'),
        items: items,
        index: 0,
        loadedThrough: detail.seasonIndex,
        loading: false,
        complete: false
      };
    }

    function ensureSeries(snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var identity;
      if (!seriesEligible(detail)) { resetSeries(); return null; }
      identity = seriesIdentity(detail);
      if (state.seriesPlaybackQueue && state.seriesPlaybackQueue.identity === identity && seriesCurrentIndex(state.seriesPlaybackQueue, detail) >= 0) {
        ensureSeriesSequence(detail);
        return state.seriesPlaybackQueue;
      }
      resetSeries();
      state.seriesPlaybackQueue = createSeries(detail);
      if (state.seriesPlaybackQueue) { ensureSeriesSequence(detail); }
      return state.seriesPlaybackQueue;
    }

    function activeQueue(snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      if (state.playlistPlaybackQueue && state.playlistPlaybackQueue.items && state.playlistPlaybackQueue.items.length &&
          detail.seriesContext && detail.seriesContext.playlistQueue) { return state.playlistPlaybackQueue; }
      return ensureSeries(detail);
    }

    function activeIndex(queue, snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var context = detail.seriesContext || {};
      var absoluteIndex;
      if (!queue) { return -1; }
      if (queue.kind === 'series') {
        if (seriesProvider && sequenceKind === 'series' && typeof seriesProvider.indexOf === 'function') {
          absoluteIndex = Number(seriesProvider.indexOf(detail.currentDetail));
          if (isFinite(absoluteIndex) && absoluteIndex >= 0) { return absoluteIndex; }
        }
        return seriesCurrentIndex(queue, detail);
      }
      if (context.playlistQueue) {
        absoluteIndex = Number(context.queueAbsoluteIndex);
        if (context.queueAbsoluteIndex !== null && context.queueAbsoluteIndex !== undefined && isFinite(absoluteIndex) && absoluteIndex >= 0) {
          return absoluteIndex;
        }
        if (Number(detail.episodeIndex) >= 0) { return Number(detail.episodeIndex); }
      }
      return Math.max(0, Number(queue.index || 0));
    }

    function clear() {
      state.adjacentTokens[0]+=1;state.adjacentTokens[1]+=1;
      state.playlistPlaybackAutoToken += 1;
      state.playlistDirectPlayToken += 1;
      invalidateMetadataRequest();
      clearTimer('directPlay');
      resetPlaybackSession();
      state.playlistPlaybackQueue = null;
      state.containerOrigin = null;
      state.playlistDirectPlayOrigin = false;
      state.playlistDirectPlayPending = false;
      closeSequenceProviders();
      resetSeries();
      closeDrawer();
      call(values.onQueueChanged, snapshot());
    }

    function preparePlaylist(container, items, item, preferredIndex, _snapshotValue) {
      var queue;
      clear();
      if (!container || !item) { return null; }
      queue = createQueue(items || [], item.ratingKey, container.title, preferredIndex);
      if (!queue) { return null; }
      state.playlistPlaybackQueue = queue;
      state.containerOrigin = container;
      ensureContainerSequence(container);
      call(values.onQueueChanged, snapshot());
      return queue;
    }

    function activatePlaylist(ratingKey, preferredIndex, item, occurrenceId) {
      var queue = state.playlistPlaybackQueue;
      var requestedIndex = Number(preferredIndex);
      var hasRequestedIndex = preferredIndex !== undefined && isFinite(requestedIndex) && requestedIndex >= 0;
      var currentItem;
      var currentOccurrenceId;
      var absoluteIndex;
      var localIndex;
      var result;
      if (!queue || !ratingKey) { return null; }
      if (!hasRequestedIndex && queue.currentItem &&
          String(queue.currentItem.ratingKey || '') === String(ratingKey || '')) {
        currentItem = queue.currentItem;
        currentOccurrenceId = queue.currentOccurrenceId;
        absoluteIndex = Math.max(0, Number(queue.index || 0));
        localIndex = queue.items && queue.items[absoluteIndex] &&
          String(queue.items[absoluteIndex].ratingKey || '') === String(ratingKey || '') ? absoluteIndex : -1;
      } else {
        localIndex = currentIndex(queue.items, ratingKey, hasRequestedIndex ? requestedIndex : queue.index);
        currentItem = item || (localIndex >= 0 && queue.items[localIndex]);
        if (!currentItem) { clear(); return null; }
        absoluteIndex = hasRequestedIndex ? requestedIndex : localIndex;
        currentOccurrenceId = occurrenceId || '';
      }
      updateContainerQueueCurrent(queue, absoluteIndex, currentItem, currentOccurrenceId);
      result = containerActivationResult(queue, currentItem, localIndex, absoluteIndex, queue.currentOccurrenceId);
      call(values.onQueueChanged, snapshot());
      return result;
    }

    function resolveAdjacent(direction, callback, snapshotValue) {
      return resolveAdjacentState(direction, function (error, result) {
        call(callback, !error && result && result.state === 'available' ? result : null);
      }, snapshotValue);
    }

    function resolveAdjacentState(direction, callback, snapshotValue) {
      var directionValue = Number(direction) < 0 ? -1 : 1;
      var detail;
      var queue;
      var provider = null;
      var current = null;
      var requestToken = 0;
      var tokenIndex = directionValue < 0 ? 0 : 1;
      var immediate;
      if ((directionValue < 0 ? state.adjacentPreviousState : state.adjacentNextState) === 'resolving') { return {state:'resolving'}; }
      detail = detailSnapshot(snapshotValue);
      queue = activeQueue(detail);
      if (detail.seriesContext && detail.seriesContext.playlistQueue && state.containerOrigin) {
        provider = ensureContainerSequence(state.containerOrigin);
        current = queue ? {
          absoluteIndex: activeIndex(queue, detail),
          occurrenceId: sequenceIdentity + ':' + activeIndex(queue, detail),
          item: queue.items && queue.items[activeIndex(queue, detail)]
        } : null;
      } else if (seriesEligible(detail)) {
        provider = ensureSeriesSequence(detail);
        current = detail.currentDetail;
      }
      if (!provider || !current) {
        setAdjacentState(directionValue, 'unavailable');
        immediate = { state: 'unavailable' };
        call(callback, null, immediate);
        return immediate;
      }
      requestToken = state.adjacentTokens[tokenIndex] += 1;
      setAdjacentState(directionValue, 'resolving');
      immediate = provider.resolveAdjacent(current, directionValue, function (error, result) {
        var normalized;
        if (state.destroyed || requestToken !== state.adjacentTokens[tokenIndex]) { return; }
        if (error) {
          setAdjacentState(directionValue, 'available');
          call(callback, error, null);
          return;
        }
        normalized = normalizeSequenceResult(result, queue, detail, directionValue);
        setAdjacentState(directionValue, normalized.state);
        call(callback, null, normalized);
      });
      return immediate && immediate.state ? { state: immediate.state } : { state: 'resolving' };
    }

    function isConfirmationCurrent(confirmation) {
      var providerSnapshot;
      if (!confirmation || sequenceKind !== 'series' || !seriesProvider || !sequenceIdentity) { return false; }
      providerSnapshot = seriesProvider.snapshot();
      return Number(confirmation.generation) === Number(providerSnapshot.generation) &&
        String(confirmation.currentOccurrenceId || '') !== '' &&
        String(confirmation.currentOccurrenceId) === String(providerSnapshot.currentOccurrenceId || '') &&
        String(confirmation.targetOccurrenceId || confirmation.target && confirmation.target.occurrenceId || '') !== '';
    }

    function requestResolved(result, requestOptions) {
      var optionsValue = requestOptions || {};
      if (!result || result.state !== 'available' || !result.item || !result.item.ratingKey) { return false; }
      updateContainerQueueCurrent(result.queue, result.index, result.item, result.occurrenceId);
      call(values.requestPlayback, {
        origin: optionsValue.origin || 'queue',
        item: result.item,
        queue: result.queue || null,
        index: Number(result.index || 0),
        occurrenceId: String(result.occurrenceId || ''),
        resume: optionsValue.resume === true,
        resumeOffset: Number(optionsValue.resumeOffset || 0),
        versionAffinity: optionsValue.versionAffinity || null
      });
      return true;
    }

    function requestQueueOccurrence(queue, current, index, target, occurrenceId, requestOptions, token) {
      loadCurrentMetadata(target.ratingKey, function (error, metadata) {
        if (state.destroyed || token !== state.playlistPlaybackAutoToken) { return; }
        if (error || !metadata) { call(values.onPlaybackError, error || new Error('metadata unavailable'), target, index); return; }
        updateContainerQueueCurrent(queue, index, target, occurrenceId);
        call(values.requestPlayback, {
          origin: 'queue',
          item: target,
          detail: metadata,
          queue: queue,
          index: index,
          previousIndex: current,
          occurrenceId: String(occurrenceId || ''),
          versionAffinity: requestOptions.versionAffinity || null,
          resume: requestOptions.resume === true || Number(target.viewOffset || 0) > 0,
          resumeOffset: Number(target.viewOffset || target.progress || 0)
        });
      });
      return true;
    }

    function requestIndex(index, requestOptions, snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var queue = activeQueue(detail);
      var current;
      var target;
      var token;
      var provider;
      var total;
      requestOptions = requestOptions || {};
      if (!queue) { return false; }
      current = activeIndex(queue, detail);
      total = drawerTotal(queue);
      index = model.focusedIndex(index, total);
      if (index === current && requestOptions.allowCurrent !== true) { return false; }
      token = state.playlistPlaybackAutoToken += 1;
      invalidateMetadataRequest();
      if (queue.kind === 'series') {
        provider = ensureSeriesSequence(detail);
        if (provider && typeof provider.resolveAt === 'function') {
          provider.resolveAt(index, function (error, occurrence) {
            var normalized;
            if (state.destroyed || token !== state.playlistPlaybackAutoToken) { return; }
            if (error || !occurrence || !occurrence.item) {
              call(values.onPlaybackError, error || new Error('queue item unavailable'), null, index);
              return;
            }
            normalized = normalizeSeriesTarget(occurrence, queue, detail, index - current);
            normalized.index = index;
            requestQueueOccurrence(queue, current, index, normalized.item, occurrence.occurrenceId, requestOptions, token);
          });
          return true;
        }
      }
      if (detail.seriesContext && detail.seriesContext.playlistQueue && state.containerOrigin) {
        provider = ensureContainerSequence(state.containerOrigin);
        if (provider && typeof provider.resolveAt === 'function') {
          provider.resolveAt(index, function (error, occurrence) {
            if (state.destroyed || token !== state.playlistPlaybackAutoToken) { return; }
            if (error || !occurrence || !occurrence.item) {
              call(values.onPlaybackError, error || new Error('queue item unavailable'), null, index);
              return;
            }
            requestQueueOccurrence(queue, current, index, occurrence.item, occurrence.occurrenceId, requestOptions, token);
          });
          return true;
        }
      }
      target = queue.items[index];
      if (!target) { return false; }
      return requestQueueOccurrence(queue, current, index, target, '', requestOptions, token);
    }

    function startContainer(container, callback) {
      var token;
      var provider;
      if (!container || model.containerKind(container) === '' || state.playlistDirectPlayPending) { return false; }
      clear();
      state.playlistDirectPlayOrigin = true;
      state.playlistDirectPlayPending = true;
      state.containerOrigin = container;
      token = state.playlistDirectPlayToken += 1;
      provider = ensureContainerSequence(container);

      function finish(error) {
        if (error) {
          state.playlistDirectPlayPending = false;
          call(callback, error);
        }
      }

      function openOccurrence(target) {
        var queue;
        if (state.destroyed || token !== state.playlistDirectPlayToken || !target || !target.item) {
          finish(new Error('media unavailable'));
          return;
        }
        queue = createQueue([target.item], target.item.ratingKey, container.title, 0);
        if (!queue) { finish(new Error('media unavailable')); return; }
        queue.total = Number(provider && provider.snapshot().knownTotal || container.totalSize || 1);
        updateContainerQueueCurrent(queue, target.absoluteIndex, target.item, target.occurrenceId);
        state.playlistPlaybackQueue = queue;
        call(values.onQueueChanged, snapshot());
        loadCurrentMetadata(target.item.ratingKey, function (error, metadata) {
          if (state.destroyed || token !== state.playlistDirectPlayToken) { return; }
          if (error || !metadata) { finish(error || new Error('metadata unavailable')); return; }
          state.playlistDirectPlayPending = false;
          call(values.requestPlayback, {
            origin: model.containerKind(container),
            item: target.item,
            detail: metadata,
            queue: queue,
            index: target.absoluteIndex,
            occurrenceId: target.occurrenceId,
            resume: Number(target.item.viewOffset || target.item.progress || 0) > 0,
            resumeOffset: Number(target.item.viewOffset || target.item.progress || 0),
            versionAffinity: call(values.versionAffinity) || null
          });
          call(callback, null, target.item, metadata, queue);
        });
      }

      function firstUnfinishedOccurrence(records) {
        var index;
        var item;
        var progress;
        for (index = 0; index < (records || []).length; index += 1) {
          item = records[index] && records[index].item || {};
          progress = Number(item.progress || 0);
          if (!item.viewed || (progress > 0 && progress < 100)) { return records[index]; }
        }
        return null;
      }

      function scanProvider(start, firstOccurrence) {
        provider.window(start, start + 40, function (error, result) {
          var records;
          var target;
          var total;
          var nextStart;
          if (state.destroyed || token !== state.playlistDirectPlayToken) { return; }
          if (error || !result) { finish(error || new Error('queue unavailable')); return; }
          records = result.items || [];
          firstOccurrence = firstOccurrence || records[0] || null;
          target = firstUnfinishedOccurrence(records);
          if (target) { openOccurrence(target); return; }
          total = result.total;
          nextStart = start + 40;
          if (total !== null && total !== undefined && nextStart >= Number(total)) {
            openOccurrence(firstOccurrence);
            return;
          }
          scanProvider(nextStart, firstOccurrence);
        });
      }

      if (provider && typeof provider.window === 'function') { scanProvider(0, null); }
      else { finish(new Error('queue provider unavailable')); }
      return true;
    }

    function prepareContainer(container, items, item, preferredIndex, snapshotValue) {
      return !!preparePlaylist(container, items, item, preferredIndex, snapshotValue);
    }

    function completeDirect() {
      state.playlistDirectPlayOrigin = false;
      state.playlistDirectPlayPending = false;
      clearTimer('directPlay');
      return true;
    }

    function waitForDetail(ratingKey, callback) {
      return loadCurrentMetadata(ratingKey, callback);
    }

    function restoreContainerOrigin() {
      if (!state.playlistDirectPlayOrigin) { return false; }
      state.playlistDirectPlayToken += 1;
      state.playlistDirectPlayOrigin = false;
      state.playlistDirectPlayPending = false;
      invalidateMetadataRequest();
      call(values.onRestoreOrigin, state.containerOrigin);
      state.containerOrigin = null;
      return true;
    }

    function drawerTotal(queue) {
      var providerState;
      var total;
      if (sequenceKind === 'series' && seriesProvider) {
        providerState = seriesProvider.snapshot();
        total = Number(providerState.knownTotal);
        if (isFinite(total) && total >= 0) { return total; }
      }
      if (sequenceKind === 'container' && containerProvider) {
        providerState = containerProvider.snapshot();
        if (providerState.knownTotal !== null && providerState.knownTotal !== undefined) {
          total = Number(providerState.knownTotal);
          if (isFinite(total) && total >= 0) { return total; }
        }
      }
      if (state.containerOrigin && state.containerOrigin.totalSize !== null && state.containerOrigin.totalSize !== undefined) {
        total = Number(state.containerOrigin.totalSize);
        if (isFinite(total) && total >= 0) { return total; }
      }
      return queue && queue.items ? queue.items.length : 0;
    }

    function legacyDrawerOccurrence(item, absoluteIndex) {
      var originId = sequenceIdentity || 'legacy-queue';
      return {
        occurrenceId: contract && contract.occurrenceIdentity && item && item.ratingKey
          ? contract.occurrenceIdentity(originId, absoluteIndex, item.ratingKey)
          : originId + ':' + absoluteIndex + ':' + String(item && item.ratingKey || ''),
        absoluteIndex: absoluteIndex,
        item: item
      };
    }

    function copyDrawerOccurrence(value) {
      return {
        occurrenceId: String(value && value.occurrenceId || ''),
        absoluteIndex: Number(value && value.absoluteIndex || 0),
        item: copyRecord(value && value.item)
      };
    }

    function loadDrawerWindow(optionsValue, callback, snapshotValue) {
      var options = optionsValue || {};
      var detail = detailSnapshot(snapshotValue);
      var queue = activeQueue(detail);
      var total;
      var bounds;
      var token;
      var provider;
      var records = [];
      var prefetchRecords = [];
      var index;
      if (!queue) {
        call(callback, null, { total: 0, bounds: model.windowBounds({ total: 0 }), items: [] });
        return { state: 'unavailable' };
      }
      total = drawerTotal(queue);
      bounds = model.windowBounds({
        focusIndex: state.playlistQueueDrawerIndex,
        total: total,
        viewportItems: options.viewportItems,
        direction: options.direction
      });
      if (queue.kind === 'series') {
        provider = ensureSeriesSequence(detail);
      } else if (state.containerOrigin) {
        provider = ensureContainerSequence(state.containerOrigin);
      }
      if (provider && typeof provider.window === 'function') {
        var requestKey = [sequenceIdentity, bounds.sdStart, bounds.sdEnd, options.viewportItems || 0, options.direction || 0].join('|');
        var pendingRequest;
        if (drawerWindowRequest && drawerWindowRequest.key === requestKey) {
          drawerWindowRequest.callbacks.push(callback);
          return { state: 'resolving' };
        }
        token = state.playlistQueueDrawerWindowToken += 1;
        pendingRequest = {
          key: requestKey,
          token: token,
          callbacks: [callback]
        };
        drawerWindowRequest = pendingRequest;
        provider.window(bounds.sdStart, bounds.sdEnd, function (error, result) {
          var resolvedTotal;
          var resolvedBounds;
          var resolvedRecords;
          var retained;
          var prefetched;
          var callbacks;
          var callbackIndex;
          var published;
          if (state.destroyed || token !== state.playlistQueueDrawerWindowToken || drawerWindowRequest !== pendingRequest) { return; }
          callbacks = pendingRequest.callbacks.slice();
          drawerWindowRequest = null;
          if (error) {
            for (callbackIndex = 0; callbackIndex < callbacks.length; callbackIndex += 1) { call(callbacks[callbackIndex], error, null); }
            return;
          }
          resolvedTotal = result && result.total !== null && result.total !== undefined ? Number(result.total) : total;
          if (!isFinite(resolvedTotal) || resolvedTotal < 0) { resolvedTotal = total; }
          resolvedBounds = model.windowBounds({
            focusIndex: state.playlistQueueDrawerIndex,
            total: resolvedTotal,
            viewportItems: options.viewportItems,
            direction: options.direction
          });
          resolvedRecords = (result && result.items || []).map(copyDrawerOccurrence);
          retained = resolvedRecords.filter(function (record) {
            return record.absoluteIndex >= resolvedBounds.retainedStart && record.absoluteIndex < resolvedBounds.retainedEnd;
          });
          prefetched = resolvedRecords.filter(function (record) {
            return record.absoluteIndex < resolvedBounds.retainedStart || record.absoluteIndex >= resolvedBounds.retainedEnd;
          });
          published = {
            total: resolvedTotal,
            bounds: resolvedBounds,
            items: retained,
            prefetchItems: prefetched
          };
          for (callbackIndex = 0; callbackIndex < callbacks.length; callbackIndex += 1) { call(callbacks[callbackIndex], null, published); }
        });
        return { state: 'resolving' };
      }
      for (index = bounds.sdStart; index < bounds.sdEnd; index += 1) {
        if (!queue.items[index]) { continue; }
        if (index >= bounds.retainedStart && index < bounds.retainedEnd) {
          records.push(copyDrawerOccurrence(legacyDrawerOccurrence(queue.items[index], index)));
        } else {
          prefetchRecords.push(copyDrawerOccurrence(legacyDrawerOccurrence(queue.items[index], index)));
        }
      }
      call(callback, null, { total: total, bounds: bounds, items: records, prefetchItems: prefetchRecords });
      return { state: 'available' };
    }

    function buildDrawerSnapshot(snapshotValue, full, queueValue) {
      var detail = detailSnapshot(snapshotValue);
      var queue = arguments.length > 2 ? queueValue : activeQueue(detail);
      var current = queue ? activeIndex(queue, detail) : -1;
      var total = queue ? drawerTotal(queue) : 0;
      state.playlistQueueDrawerIndex = queue && total > 0
        ? model.focusedIndex(state.playlistQueueDrawerIndex, total) : 0;
      return {
        open: state.playlistQueueDrawerOpen,
        index: state.playlistQueueDrawerIndex,
        focusReady: state.playlistQueueDrawerFocusReady,
        queue: full ? copyQueue(queue) : queue ? {kind:queue.kind||'',title:queue.title||'',index:Math.max(0,+queue.index||0)} : null,
        currentIndex: current,
        total: total
      };
    }

    function drawerEventSnapshot(snapshotValue, queueValue) {
      return arguments.length > 1
        ? buildDrawerSnapshot(snapshotValue, false, queueValue) : buildDrawerSnapshot(snapshotValue, false);
    }

    function openDrawer(snapshotValue, delay) {
      var detail = detailSnapshot(snapshotValue);
      var queue = activeQueue(detail);
      if (!queue) { return false; }
      state.playlistQueueDrawerOpen = true;
      state.playlistQueueDrawerFocusReady = false;
      state.playlistQueueDrawerIndex = Math.max(0, activeIndex(queue, detail));
      setTimer('drawer', function () {
        if (!state.playlistQueueDrawerOpen) { return; }
        state.playlistQueueDrawerFocusReady = true;
        call(values.onDrawerState || values.onDrawerChanged, drawerEventSnapshot());
      }, delay === undefined ? 220 : delay);
      call(values.onDrawerState || values.onDrawerChanged, drawerEventSnapshot(detail, queue));
      return true;
    }

    function closeDrawer() {
      state.playlistQueueDrawerWindowToken += 1;
      drawerWindowRequest = null;
      clearTimer('drawer');
      state.playlistQueueDrawerOpen = false;
      state.playlistQueueDrawerFocusReady = false;
      call(values.onDrawerState || values.onDrawerChanged, drawerEventSnapshot());
    }

    function moveDrawer(direction, snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var queue = activeQueue(detail);
      var total;
      if (!queue) { return -1; }
      total = drawerTotal(queue);
      state.playlistQueueDrawerIndex = model.focusedIndex(state.playlistQueueDrawerIndex + (Number(direction) < 0 ? -1 : 1), total);
      call(values.onDrawerState || values.onDrawerChanged, drawerEventSnapshot(detail, queue));
      return state.playlistQueueDrawerIndex;
    }

    function pointDrawer(index, snapshotValue) {
      var detail = detailSnapshot(snapshotValue);
      var queue = activeQueue(detail);
      var total;
      if (!queue) { return -1; }
      total = drawerTotal(queue);
      state.playlistQueueDrawerIndex = model.focusedIndex(index, total);
      call(values.onDrawerState || values.onDrawerChanged, drawerEventSnapshot(detail, queue));
      return state.playlistQueueDrawerIndex;
    }

    function drawerSnapshot(snapshotValue) { return buildDrawerSnapshot(snapshotValue, true); }

    function renderUpNext() {
      if (upNext) { call(values.renderUpNext, upNext.snapshot(), state.autoplaySeconds, state.autoplayTarget); }
      call(values.onUpNextState, upNextSnapshot());
    }

    function scheduleUpNextTick() {
      if (!state.autoplayVisible) { clearTimer('upNext'); return; }
      setTimer('upNext', function () {
        if (!state.autoplayVisible) { return; }
        state.autoplaySeconds = timing.next(state.autoplaySeconds);
        if (timing.complete(state.autoplaySeconds)) { confirmUpNext(); return; }
        if (upNext) { upNext.tick(state.autoplaySeconds); }
        renderUpNext();
        scheduleUpNextTick();
      }, 1000);
    }

    function showUpNext(target, delay, layout) {
      if (!target || state.destroyed) { return false; }
      state.autoplayTarget = target;
      state.autoplayVisible = true;
      state.autoplayPreparing = false;
      state.autoplaySeconds = timing.initial(delay);
      if (upNext) { upNext.show(call(values.upNextItem, target, layout) || target.item || target, state.autoplaySeconds, layout); }
      if (target.action === 'home') { call(values.clearUpNextBackdrop); }
      else { call(values.loadUpNextBackdrop, target.item || target, state.autoplayBackdropToken += 1); }
      renderUpNext();
      scheduleUpNextTick();
      return true;
    }

    function playbackEnded(options, snapshotValue) {
      var settings = call(values.autoplaySettings) || {};
      var resolutionToken;
      options = options || {};
      if (options.delay === undefined) { options.delay = settings.delay; }
      if (options.layout === undefined) { options.layout = settings.layout; }
      if (options.actualEnd === undefined) { options.actualEnd = true; }
      if (state.destroyed || options.actualEnd !== true || call(values.playerActive) === false ||
          state.autoplayVisible || state.autoplayPreparing || state.autoplayDismissed || Number(options.delay || 0) === 0 ||
          state.adjacentNextState === 'resolving') { return false; }
      if (options.skipPromptVisible === true) { call(values.resetSkipPrompt); }
      resolutionToken = state.autoplayResolutionToken += 1;
      state.autoplayPreparing = true;
      resolveAdjacentState(1, function (error, result) {
        if (state.destroyed || resolutionToken !== state.autoplayResolutionToken) { return; }
        state.autoplayPreparing = false;
        if (error) {
          cancelUpNext(false);
          call(values.onPlaybackError, error);
          return;
        }
        if (!result || result.state === 'unavailable') {
          result = call(values.endOfQueueTarget);
          if (!result || state.autoplayDismissed) { cancelUpNext(false); return; }
          call(values.resetSkipPrompt);
          showUpNext(result, options.delay, options.layout);
          return;
        }
        if (state.autoplayDismissed) { cancelUpNext(false); return; }
        if (result.state === 'confirmation-required') {
          call(values.onGapRequired, result.confirmation, 'up-next');
          return;
        }
        if (result.state !== 'available') { return; }
        call(values.resetSkipPrompt);
        showUpNext(result, options.delay, options.layout);
      }, snapshotValue);
      return true;
    }

    function cancelUpNext(dismiss) {
      var notifyCancellation = dismiss === true && state.autoplayVisible;
      var cancelledTarget = state.autoplayTarget;
      state.autoplayResolutionToken += 1;
      state.autoplayVisible = false;
      state.autoplayPreparing = false;
      state.autoplayDismissed = state.autoplayDismissed || dismiss === true;
      state.autoplayTarget = null;
      state.autoplaySeconds = 0;
      clearTimer('upNext');
      if (upNext) { upNext.hide(); }
      state.autoplayBackdropToken += 1;
      call(values.clearUpNextBackdrop);
      renderUpNext();
      if (notifyCancellation) { call(values.onUpNextCancelled, cancelledTarget); }
    }

    function observePlayback(positionSeconds, durationSeconds) {
      var position = Number(positionSeconds);
      var duration = Number(durationSeconds);
      if (state.destroyed || !isFinite(position) || !isFinite(duration) || duration <= 0 || duration - position < 5) { return false; }
      if (state.autoplayPreparing) {
        state.autoplayResolutionToken += 1;
        state.autoplayPreparing = false;
        renderUpNext();
        return true;
      }
      if (state.autoplayVisible) { cancelUpNext(false); return true; }
      if (!state.autoplayDismissed) { return false; }
      state.autoplayDismissed = false;
      call(values.onUpNextState, upNextSnapshot());
      call(values.onUpNextRearmed);
      return true;
    }

    function confirmUpNext() {
      var target = state.autoplayTarget;
      if (!state.autoplayVisible || !target) { return false; }
      cancelUpNext(false);
      if (target.action === 'home') {
        call(values.requestHome);
        return true;
      }
      updateContainerQueueCurrent(target.queue, target.index, target.item, target.occurrenceId);
      call(values.requestPlayback, {
        origin: 'up-next',
        item: target.item,
        queue: target.queue,
        index: target.index,
        occurrenceId: String(target.occurrenceId || ''),
        resume: false
      });
      return true;
    }

    function moveUpNext(direction) {
      if (!state.autoplayVisible || !upNext) { return null; }
      upNext.move(direction);
      renderUpNext();
      return upNext.snapshot();
    }

    function activateUpNext() {
      if (!state.autoplayVisible || !upNext) { return false; }
      if (upNext.select() === 'cancel') { cancelUpNext(true); return 'cancel'; }
      confirmUpNext();
      return 'play';
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (state.destroyed || !state.autoplayVisible || code === 27 || code === 461) { return false; }
      if (direction === 'left' || direction === 'right') { moveUpNext(direction === 'left' ? -1 : 1); }
      else if (code === 13) { activateUpNext(); }
      else if (code === 415) { confirmUpNext(); }
      else if (code === 413) { cancelUpNext(true); call(values.closePlayer); }
      return true;
    }

    function resetPlaybackSession() {
      state.autoplayDismissed = false;
      cancelUpNext(false);
      state.autoplayDismissed = false;
    }


    function capturePlaylistGeneration() { return state.playlistPlaybackAutoToken; }

    function isPlaylistGenerationCurrent(token) {
      return !state.destroyed && Number(token) === Number(state.playlistPlaybackAutoToken);
    }

    function claimBackdropPrefetch(key) {
      key = String(key || '');
      if (state.destroyed || !key || key === state.autoplayBackdropPrefetchKey) { return false; }
      state.autoplayBackdropPrefetchKey = key;
      return true;
    }

    function beginBackdropLoad() {
      if (state.destroyed) { return state.autoplayBackdropToken; }
      state.autoplayBackdropToken += 1;
      return state.autoplayBackdropToken;
    }

    function invalidateBackdropLoad() {
      if (state.destroyed) { return state.autoplayBackdropToken; }
      state.autoplayBackdropToken += 1;
      return state.autoplayBackdropToken;
    }

    function isBackdropLoadCurrent(token, requireVisible) {
      return !state.destroyed && Number(token) === Number(state.autoplayBackdropToken) && (requireVisible !== true || state.autoplayVisible);
    }

    function upNextSnapshot() {
      return copyUpNext({
        visible: state.autoplayVisible,
        preparing: state.autoplayPreparing,
        dismissed: state.autoplayDismissed,
        target: state.autoplayTarget,
        seconds: state.autoplaySeconds,
        view: upNext ? upNext.snapshot() : null
      });
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

    function copyItems(items) {
      return (items || []).map(function (item) { return copyRecord(item); });
    }

    function copyQueue(queue) {
      var result;
      if (!queue) { return null; }
      result = copyRecord(queue);
      result.items = copyItems(queue.items);
      return result;
    }

    function copyUpNext(source) {
      var result = copyRecord(source) || {};
      var target = source && source.target;
      if (target) {
        result.target = copyRecord(target);
        result.target.item = copyRecord(target.item);
        result.target.queue = copyQueue(target.queue);
      }
      result.view = copyRecord(source && source.view);
      return result;
    }

    /** @returns {PloffPlaybackQueueSnapshot} */
    function snapshot() {
      return {
        playlistQueue: copyQueue(state.playlistPlaybackQueue),
        seriesQueue: copyQueue(state.seriesPlaybackQueue),
        drawer: drawerSnapshot(),
        upNext: upNextSnapshot(),
        directPlayOrigin: copyRecord(state.playlistDirectPlayOrigin),
        directPlayPending: state.playlistDirectPlayPending,
        containerOrigin: copyRecord(state.containerOrigin),
        sequence: {
          kind: sequenceKind,
          identity: sequenceIdentity,
          previousState: state.adjacentPreviousState,
          nextState: state.adjacentNextState,
          provider: sequenceKind === 'series' && seriesProvider ? seriesProvider.snapshot() :
            (sequenceKind === 'container' && containerProvider ? containerProvider.snapshot() : null)
        },
        destroyed: state.destroyed
      };
    }

    function destroy() {
      if (state.destroyed) { return; }
      clear();
      cancelUpNext(false);
      clearTimer('drawer');
      clearTimer('directPlay');
      cancelRequest('metadata');
      if (seriesProvider) { seriesProvider.destroy(); }
      if (containerProvider) { containerProvider.destroy(); }
      state.destroyed = true;
    }

    return {
      activatePlaylist: activatePlaylist,
      activateUpNext: activateUpNext,
      activeIndex: activeIndex,
      activeQueue: activeQueue,
      beginBackdropLoad: beginBackdropLoad,
      capturePlaylistGeneration: capturePlaylistGeneration,
      claimBackdropPrefetch: claimBackdropPrefetch,
      cancelUpNext: cancelUpNext,
      clear: clear,
      closeDrawer: closeDrawer,
      completeDirect: completeDirect,
      confirmUpNext: confirmUpNext,
      createQueue: createQueue,
      destroy: destroy,
      drawerSnapshot: drawerSnapshot,
      ensureSeries: ensureSeries,
      firstUnfinished: firstUnfinished,
      handleKey: handleKey,
      invalidateBackdropLoad: invalidateBackdropLoad,
      isBackdropLoadCurrent: isBackdropLoadCurrent,
      isPlaylistGenerationCurrent: isPlaylistGenerationCurrent,
      isConfirmationCurrent: isConfirmationCurrent,
      loadDrawerWindow: loadDrawerWindow,
      moveDrawer: moveDrawer,
      moveUpNext: moveUpNext,
      observePlayback: observePlayback,
      openDrawer: openDrawer,
      playable: playable,
      playbackEnded: playbackEnded,
      pointDrawer: pointDrawer,
      prepareContainer: prepareContainer,
      preparePlaylist: preparePlaylist,
      queueContext: queueContext,
      requestIndex: requestIndex,
      resetPlaybackSession: resetPlaybackSession,
      resetSeries: resetSeries,
      resolveAdjacent: resolveAdjacent,
      resolveAdjacentState: resolveAdjacentState,
      requestResolved: requestResolved,
      restoreContainerOrigin: restoreContainerOrigin,
      seriesCurrentIndex: seriesCurrentIndex,
      showUpNext: showUpNext,
      snapshot: snapshot,
      startContainer: startContainer,
      upNextSnapshot: upNextSnapshot,
      waitForDetail: waitForDetail
    };
  }

  return { create: create };
}));

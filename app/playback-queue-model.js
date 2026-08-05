(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackQueueModel = factory();
  }
}(this, function () {
  'use strict';

  function playableItems(items) {
    return (items || []).filter(function (item) {
      return !!(item && item.ratingKey && (item.type === 'episode' || item.type === 'movie'));
    });
  }

  function currentIndex(items, ratingKey, preferredIndex) {
    var source = items || [];
    var preferred = Number(preferredIndex);
    var index;
    if (isFinite(preferred) && source[preferred] && String(source[preferred].ratingKey) === String(ratingKey || '')) {
      return preferred;
    }
    for (index = 0; index < source.length; index += 1) {
      if (String(source[index] && source[index].ratingKey || '') === String(ratingKey || '')) { return index; }
    }
    return -1;
  }

  function originFocusIndex(queue, items) {
    var queueItems = queue && queue.items || [];
    var sourceItems = items || [];
    var queueIndex = Number(queue && queue.index);
    var current = isFinite(queueIndex) && queueItems[queueIndex] ? queueItems[queueIndex] : null;
    var occurrence = 0;
    var seen = 0;
    var index;
    if (!current || !current.ratingKey) { return -1; }
    for (index = 0; index < queueIndex; index += 1) {
      if (String(queueItems[index] && queueItems[index].ratingKey || '') === String(current.ratingKey)) { occurrence += 1; }
    }
    for (index = 0; index < sourceItems.length; index += 1) {
      if (String(sourceItems[index] && sourceItems[index].ratingKey || '') !== String(current.ratingKey)) { continue; }
      if (seen === occurrence) { return index; }
      seen += 1;
    }
    return -1;
  }

  function itemTitle(item) {
    var detail = String(item && item.detail || '');
    if (item && item.type === 'episode' && detail) {
      return detail.replace(/^E0*[0-9]+\s*-\s*/, '') || String(item.title || '');
    }
    return String(item && item.title || '');
  }

  function pad(value) {
    var text = String(Math.max(0, Number(value || 0)));
    return text.length < 2 ? '0' + text : text;
  }

  function episodeNumbers(item) {
    var hasSeason = !!(item && (item.queueSeasonNumber !== undefined || item.seasonIndex !== undefined));
    var hasEpisode = !!(item && (item.queueEpisodeNumber !== undefined || item.episodeIndex !== undefined));
    var season = Number(item && (item.queueSeasonNumber !== undefined ? item.queueSeasonNumber : item.seasonIndex) || 0);
    var episode = Number(item && (item.queueEpisodeNumber !== undefined ? item.queueEpisodeNumber : item.episodeIndex) || 0);
    var match;
    if (!hasSeason && item && item.meta) {
      match = String(item.meta).match(/(?:Season|Stagione)\s+0*([0-9]+)/i);
      if (match) { season = Number(match[1]); hasSeason = true; }
    }
    if (!hasEpisode && item && item.detail) {
      match = String(item.detail).match(/^E0*([0-9]+)/i);
      if (match) { episode = Number(match[1]); hasEpisode = true; }
    }
    return item && item.type === 'episode' && hasEpisode
      ? { season: hasSeason ? season : 0, episode: episode }
      : null;
  }

  function itemDisplayTitle(item) {
    var title = itemTitle(item);
    var numbers = episodeNumbers(item);
    if (!numbers) { return title; }
    return 'S' + pad(numbers.season) + 'E' + pad(numbers.episode) +
      (title ? ' - ' + title : '');
  }

  function itemTypeLabel(item, language) {
    var italian = String(language || 'en').toLowerCase().indexOf('it') === 0;
    return item && item.type === 'episode' ? (italian ? 'SERIE' : 'SERIES') : (italian ? 'FILM' : 'MOVIE');
  }

  function firstUnfinishedIndex(items) {
    var source = items || [];
    var index;
    var progress;
    for (index = 0; index < source.length; index += 1) {
      progress = Number(source[index] && source[index].progress || 0);
      if (!source[index].viewed || (progress > 0 && progress < 100)) { return index; }
    }
    return source.length ? 0 : -1;
  }

  function createQueue(items, ratingKey, title, preferredIndex) {
    var sourceItems = items || [];
    var preferred = Number(preferredIndex);
    var playable = playableItems(sourceItems);
    var playablePreferredIndex = preferred;
    var index;
    if (isFinite(preferred) && preferred >= 0 && preferred < sourceItems.length &&
        playableItems([sourceItems[preferred]]).length) {
      playablePreferredIndex = playableItems(sourceItems.slice(0, preferred)).length;
    }
    index = currentIndex(playable, ratingKey, playablePreferredIndex);
    if (index < 0) { return null; }
    return { kind: 'container', items: playable, index: index, title: String(title || 'Queue') };
  }

  function seriesContext(context) {
    var current = context || {};
    var items = current.items || [];
    return {
      playlistQueue: true,
      seasons: [{ ratingKey: 'playlist', index: 1, title: current.title || '', selected: true }],
      episodes: items.map(function (item, index) {
        return {
          ratingKey: item.ratingKey,
          type: item.type,
          title: itemTitle(item),
          index: index + 1,
          image: item.image || '',
          viewed: !!item.viewed,
          progress: Number(item.progress || 0),
          selected: index === current.index
        };
      })
    };
  }

  function upcomingItems(items, current) {
    var source = items || [];
    var start = Math.max(0, Math.min(source.length, Number(current) || 0));
    return source.slice(start);
  }

  function focusedIndex(requested, length) {
    var maximum = Math.max(0, Number(length || 0) - 1);
    return Math.max(0, Math.min(maximum, Number(requested) || 0));
  }

  function progressSummary(items) {
    var source = playableItems(items || []);
    var result = {
      totalCount: source.length,
      watchedCount: 0,
      remainingCount: 0,
      totalDuration: 0,
      watchedDuration: 0,
      remainingDuration: 0
    };
    var index;
    var item;
    var duration;
    var offset;
    var progress;
    var watched;
    for (index = 0; index < source.length; index += 1) {
      item = source[index] || {};
      duration = Math.max(0, Number(item.duration || 0));
      offset = Math.max(0, Number(item.viewOffset || 0));
      progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
      watched = item.viewed === true ? duration : Math.min(duration, offset || duration * progress / 100);
      result.totalDuration += duration;
      result.watchedDuration += watched;
      if (item.viewed === true) { result.watchedCount += 1; }
    }
    result.remainingCount = Math.max(0, result.totalCount - result.watchedCount);
    result.remainingDuration = Math.max(0, result.totalDuration - result.watchedDuration);
    return result;
  }

  function drawerScrollTop(options) {
    var values = options || {};
    var scrollTop = Math.max(0, Number(values.scrollTop || 0));
    var clientHeight = Math.max(0, Number(values.clientHeight || 0));
    var focusedTop = Math.max(0, Number(values.focusedTop || 0));
    var focusedHeight = Math.max(0, Number(values.focusedHeight || 0));
    var focusedBottom = focusedTop + focusedHeight;
    var nextTop = Number(values.nextTop);
    var nextHeight = Math.max(0, Number(values.nextHeight || 0));
    var viewportBottom = scrollTop + clientHeight;
    var targetBottom;
    if (focusedTop < scrollTop) { return focusedTop; }
    if (values.isLast !== true && isFinite(nextTop)) {
      targetBottom = Math.max(focusedBottom, nextTop + nextHeight);
      if (targetBottom > viewportBottom) { return Math.max(0, targetBottom - clientHeight); }
      return scrollTop;
    }
    if (focusedBottom > viewportBottom) { return Math.max(0, focusedBottom - clientHeight); }
    return scrollTop;
  }

  function windowBounds(options) {
    var values = options || {};
    var viewport = Math.max(1, Math.floor(Number(values.viewportItems || 5)));
    var total = Math.max(0, Math.floor(Number(values.total || 0)));
    var focus = Math.max(0, Math.floor(Number(values.focusIndex || 0)));
    var half = Math.floor(viewport / 2);
    var visibleStart;
    var visibleEnd;
    var retainedStart;
    var retainedEnd;
    var sdStart;
    var sdEnd;
    var finalStart;
    var finalEnd;
    if (total > 0) { focus = Math.min(total - 1, focus); }
    else { focus = 0; }
    visibleStart = Math.max(0, focus - half);
    if (total > viewport) { visibleStart = Math.min(visibleStart, total - viewport); }
    visibleEnd = Math.min(total, visibleStart + viewport);
    retainedStart = Math.max(0, visibleStart - viewport * 3);
    retainedEnd = Math.min(total, visibleEnd + viewport * 3);
    sdStart = retainedStart;
    sdEnd = retainedEnd;
    if (Number(values.direction) < 0) { sdStart = Math.max(0, retainedStart - viewport); }
    else if (Number(values.direction) > 0) { sdEnd = Math.min(total, retainedEnd + viewport); }
    finalStart = Math.max(0, visibleStart - 3);
    finalEnd = Math.min(total, visibleEnd + 3);
    return {
      focusIndex: focus,
      total: total,
      visibleStart: visibleStart,
      visibleEnd: visibleEnd,
      retainedStart: retainedStart,
      retainedEnd: retainedEnd,
      sdStart: sdStart,
      sdEnd: sdEnd,
      finalStart: finalStart,
      finalEnd: finalEnd
    };
  }

  function windowTier(bounds, index) {
    var value = Number(index);
    var windowValue = bounds || {};
    if (!isFinite(value)) { return 'none'; }
    if (value >= Number(windowValue.finalStart || 0) && value < Number(windowValue.finalEnd || 0)) { return 'final'; }
    if (value >= Number(windowValue.sdStart || 0) && value < Number(windowValue.sdEnd || 0)) { return 'sd'; }
    return 'none';
  }

  function prefetchDirection(previous, movement) {
    var state = previous || { direction: 0, pendingDirection: 0, pendingCount: 0 };
    var next = Number(movement) < 0 ? -1 : (Number(movement) > 0 ? 1 : 0);
    var direction = Number(state.direction) < 0 ? -1 : (Number(state.direction) > 0 ? 1 : 0);
    var pendingDirection = Number(state.pendingDirection) < 0 ? -1 : (Number(state.pendingDirection) > 0 ? 1 : 0);
    var pendingCount = Math.max(0, Number(state.pendingCount || 0));
    if (!next) {
      return { direction: direction, pendingDirection: pendingDirection, pendingCount: pendingCount };
    }
    if (!direction || next === direction) {
      return { direction: next, pendingDirection: 0, pendingCount: 0 };
    }
    if (pendingDirection !== next) {
      return { direction: direction, pendingDirection: next, pendingCount: 1 };
    }
    pendingCount += 1;
    if (pendingCount >= 2) {
      return { direction: next, pendingDirection: 0, pendingCount: 0 };
    }
    return { direction: direction, pendingDirection: next, pendingCount: pendingCount };
  }

  function adjacentItem(queue, current, direction) {
    var items = queue && queue.items || [];
    var step = Number(direction) < 0 ? -1 : 1;
    var index = Number(current || 0) + step;
    if (index < 0 || index >= items.length || !items[index]) { return null; }
    return { queue: queue, index: index, item: items[index] };
  }

  function containerKind(container) {
    var kind = String(container && container.containerType || '');
    return kind === 'playlist' || kind === 'collection' ? kind : '';
  }

  function seriesItems(season, seasonIndex, episodes, startIndex) {
    var source = episodes || [];
    var start = Math.max(0, Math.min(source.length, Number(startIndex) || 0));
    var result = [];
    var episode;
    var index;
    for (index = start; index < source.length; index += 1) {
      episode = source[index];
      if (!episode || !episode.ratingKey) { continue; }
      result.push({
        ratingKey: episode.ratingKey,
        type: 'episode',
        title: itemTitle(episode),
        grandparentTitle: episode.grandparentTitle || (episode.detail ? episode.title : ''),
        parentTitle: episode.parentTitle || episode.meta || '',
        detail: episode.detail || '',
        image: episode.image || '',
        art: episode.art || '',
        viewed: !!episode.viewed,
        progress: Number(episode.progress || 0),
        index: Number(episode.index || index + 1),
        queueSeasonIndex: Number(seasonIndex || 0),
        queueEpisodeIndex: index,
        queueSeasonNumber: Number(season && season.index || Number(seasonIndex || 0) + 1),
        queueEpisodeNumber: Number(episode.index || index + 1),
        queueEpisodes: source
      });
    }
    return result;
  }

  function versionAffinity(preferences, playback, signature) {
    var snapshot = preferences || {};
    var override = snapshot.override;
    var versions;
    var index;
    if (!override || override.mediaIndex === null || override.mediaIndex === undefined ||
        !playback || typeof signature !== 'function') { return null; }
    versions = playback.mediaVersions || [];
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === playback.mediaIndex &&
          versions[index].partIndex === playback.partIndex) {
        return signature(versions[index]);
      }
    }
    return null;
  }

  return {
    playableItems: playableItems,
    currentIndex: currentIndex,
    originFocusIndex: originFocusIndex,
    itemTitle: itemTitle,
    episodeNumbers: episodeNumbers,
    itemDisplayTitle: itemDisplayTitle,
    itemTypeLabel: itemTypeLabel,
    firstUnfinishedIndex: firstUnfinishedIndex,
    createQueue: createQueue,
    seriesContext: seriesContext,
    upcomingItems: upcomingItems,
    focusedIndex: focusedIndex,
    progressSummary: progressSummary,
    drawerScrollTop: drawerScrollTop,
    windowBounds: windowBounds,
    windowTier: windowTier,
    prefetchDirection: prefetchDirection,
    adjacentItem: adjacentItem,
    containerKind: containerKind,
    seriesItems: seriesItems,
    versionAffinity: versionAffinity
  };
}));

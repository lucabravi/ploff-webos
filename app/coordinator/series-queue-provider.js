(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSeriesQueueProvider = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var contract = values.QueueSequenceContract;
    var Cache = values.BoundedQueueCache;
    var pageSize = Math.max(1, Number(values.pageSize || 40));
    var cache = Cache.create({
      pageSize: pageSize,
      maxPages: Math.max(1, Number(values.maxPages || 5)),
      maxRecords: Math.max(1, Number(values.maxRecords || 200))
    });
    var origin = null;
    var generation = 0;
    var confirmationCounter = 0;
    var segments = {};
    var pendingSeasons = {};
    var pendingAdjacent = {};
    var destroyed = false;

    function call(callback, arg1, arg2) {
      if (typeof callback === 'function') { callback(arg1, arg2); }
    }

    function own(source, name) {
      return Object.prototype.hasOwnProperty.call(source || {}, name);
    }

    function numeric(value, fallback) {
      var result = Number(value);
      return isFinite(result) ? result : Number(fallback || 0);
    }

    function seasonNumber(season) {
      if (!season) { return 0; }
      if (own(season, 'seasonNumber')) { return numeric(season.seasonNumber, 0); }
      return numeric(season.index, 0);
    }

    function episodeNumber(item) {
      if (!item) { return 0; }
      if (own(item, 'episodeNumber')) { return numeric(item.episodeNumber, 0); }
      if (own(item, 'queueEpisodeNumber')) { return numeric(item.queueEpisodeNumber, 0); }
      if (own(item, 'index')) { return numeric(item.index, 0); }
      return numeric(item.episodeIndex, 0);
    }

    function itemSeasonNumber(item) {
      if (!item) { return 0; }
      if (own(item, 'seasonNumber')) { return numeric(item.seasonNumber, 0); }
      if (own(item, 'queueSeasonNumber')) { return numeric(item.queueSeasonNumber, 0); }
      if (own(item, 'parentIndex')) { return numeric(item.parentIndex, 0); }
      return numeric(item.seasonIndex, 0);
    }

    function seasonKey(season) {
      return String(season && (season.ratingKey || season.key) || 'season-' + seasonNumber(season));
    }

    function originIdentity() {
      return origin ? 'series-' + origin.id + '-' + origin.scope : '';
    }

    function copyItem(item) {
      var result = {};
      var key;
      for (key in item) {
        if (own(item, key)) { result[key] = item[key]; }
      }
      return result;
    }

    function copyOccurrence(value) {
      if (!value) { return null; }
      var result = {
        occurrenceId: String(value.occurrenceId || ''),
        seasonNumber: Number(value.seasonNumber || 0),
        episodeNumber: Number(value.episodeNumber || 0),
        seasonKey: String(value.seasonKey || ''),
        item: copyItem(value.item || {})
      };
      if (value.absoluteIndex !== undefined) { result.absoluteIndex = Number(value.absoluteIndex); }
      return result;
    }

    function segmentDescriptor(season) {
      var descriptor = segments[seasonKey(season)];
      return descriptor && descriptor.generation === generation ? descriptor : null;
    }

    function seasonCount(season) {
      var descriptor = segmentDescriptor(season);
      var declared=Math.max(0,numeric(season&&season.leafCount,0));
      return descriptor ? Math.max(0, Number(descriptor.count || 0)) : declared;
    }

    function seasonOffset(season) {
      var offset = 0;
      var index;
      for (index = 0; index < (origin && origin.seasons || []).length; index += 1) {
        if (origin.seasons[index] === season) { return offset; }
        offset += seasonCount(origin.seasons[index]);
      }
      return offset;
    }

    function knownTotal() {
      var total = 0;
      var index;
      for (index = 0; index < (origin && origin.seasons || []).length; index += 1) {
        total += seasonCount(origin.seasons[index]);
      }
      return total;
    }

    function localEpisodeIndex(item, season) {
      var records = readSegment(season);
      var targetKey = String(item && item.ratingKey || '');
      var targetEpisode = episodeNumber(item);
      var index;
      if (records) {
        for (index = 0; index < records.length; index += 1) {
          if (String(records[index] && records[index].ratingKey || '') === targetKey) { return index; }
        }
        for (index = 0; index < records.length; index += 1) {
          if (episodeNumber(records[index]) === targetEpisode) { return index; }
        }
      }
      return Math.max(0, targetEpisode - 1);
    }

    function occurrence(item, season, absoluteIndex) {
      var s = seasonNumber(season || item);
      var e = episodeNumber(item);
      var result = {
        occurrenceId: contract.seriesOccurrenceIdentity(originIdentity(), s, e, item.ratingKey),
        seasonNumber: s,
        episodeNumber: e,
        seasonKey: seasonKey(season || { index: s }),
        item: item
      };
      result.absoluteIndex = absoluteIndex === undefined
        ? seasonOffset(season) + localEpisodeIndex(item, season)
        : Number(absoluteIndex);
      return result;
    }

    function sortSeasons(left, right) {
      return seasonNumber(left) - seasonNumber(right);
    }

    function sortEpisodes(left, right) {
      return episodeNumber(left) - episodeNumber(right);
    }

    function normalizeEpisodes(source) {
      return (source || []).filter(function (item) {
        return contract.isPlayable(item) && item.type === 'episode';
      }).slice(0).sort(sortEpisodes);
    }

    function targetWithEpisodes(item, episodes) {
      var target = copyItem(item);
      target.queueEpisodes = (episodes || []).slice(0);
      return target;
    }

    function rawEpisodeBounds(source) {
      var minimum = Infinity;
      var maximum = 0;
      var index;
      var number;
      for (index = 0; index < (source || []).length; index += 1) {
        number = episodeNumber(source[index]);
        if (number > 0) {
          minimum = Math.min(minimum, number);
          maximum = Math.max(maximum, number);
        }
      }
      return { minimum: minimum === Infinity ? 0 : minimum, maximum: maximum };
    }

    function segmentSignature(records) {
      var hash = 2166136261;
      var source = records || [];
      var index;
      var text;
      var offset;
      for (index = 0; index < source.length; index += 1) {
        text = String(source[index] && source[index].ratingKey || '') + '|' +
          String(source[index] && source[index].type || '') + ';';
        for (offset = 0; offset < text.length; offset += 1) {
          hash ^= text.charCodeAt(offset);
          hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
      }
      return String(hash >>> 0) + ':' + source.length;
    }

    function segmentBase(season) {
      var index = origin ? origin.seasons.indexOf(season) : -1;
      return Math.max(0, index) * 100000;
    }

    function storeSegment(season, source) {
      var records = normalizeEpisodes(source);
      var bounds = rawEpisodeBounds(source);
      var starts = [];
      var base = segmentBase(season);
      var key = seasonKey(season);
      var previous = segmentDescriptor(season);
      var signature = segmentSignature(records);
      var offset;
      var chunk;
      if (previous && previous.signature && previous.signature !== signature) {
        throw new Error('Series queue origin changed during playback');
      }
      for (offset = 0; offset < records.length; offset += pageSize) {
        chunk = records.slice(offset, offset + pageSize);
        cache.putPage(base + offset, chunk, {
          total: records.length,
          terminal: offset + chunk.length >= records.length,
          generation: generation
        });
        starts.push(base + offset);
      }
      segments[key] = {
        starts: starts,
        count: records.length,
        generation: generation,
        signature: signature,
        minimumEpisodeNumber: bounds.minimum,
        maximumEpisodeNumber: Math.max(bounds.maximum, numeric(season && season.leafCount, 0))
      };
      return records;
    }

    function readSegment(season) {
      var descriptor = segments[seasonKey(season)];
      var records = [];
      var page;
      var index;
      if (!descriptor || descriptor.generation !== generation) { return null; }
      if (!descriptor.starts.length) { return []; }
      for (index = 0; index < descriptor.starts.length; index += 1) {
        page = cache.getPage(descriptor.starts[index]);
        if (!page) { return null; }
        records = records.concat(page);
      }
      return records;
    }

    function abortPending() {
      var previous = pendingSeasons;
      var keys = Object.keys(previous);
      var index;
      pendingSeasons = {};
      pendingAdjacent = {};
      for (index = 0; index < keys.length; index += 1) {
        if (previous[keys[index]].request && typeof previous[keys[index]].request.abort === 'function') {
          previous[keys[index]].request.abort();
        }
      }
    }

    function invalidate() {
      generation += 1;
      abortPending();
      segments = {};
      cache.clear();
    }

    function loadSeason(season, callback) {
      var cached = readSegment(season);
      var key = seasonKey(season);
      var requestGeneration = generation;
      var requestOrigin = origin;
      var entry;
      var completed = false;
      var request = null;
      if (cached !== null) {
        call(callback, null, cached);
        return null;
      }
      if (pendingSeasons[key]) {
        pendingSeasons[key].callbacks.push(callback);
        return pendingSeasons[key].request;
      }
      entry = { callbacks: [callback], request: null };
      pendingSeasons[key] = entry;

      function complete(error, episodes) {
        var callbacks;
        var records;
        var storeError = null;
        var index;
        completed = true;
        if (destroyed || requestGeneration !== generation || requestOrigin !== origin || pendingSeasons[key] !== entry) { return; }
        delete pendingSeasons[key];
        callbacks = entry.callbacks.slice(0);
        if (!error) {
          try { records = storeSegment(season, episodes || []); }
          catch (caughtError) { storeError = caughtError; records = null; }
        } else { records = null; }
        for (index = 0; index < callbacks.length; index += 1) {
          call(callbacks[index], error || storeError || null, records);
        }
      }

      try {
        request = values.loadSeasonEpisodes(season, complete);
      } catch (loadError) {
        if (!completed && pendingSeasons[key] === entry) {
          completed = true;
          delete pendingSeasons[key];
          entry.callbacks.slice(0).forEach(function (pendingCallback) {
            call(pendingCallback, loadError, null);
          });
        }
      }
      if (!completed && pendingSeasons[key] === entry) {
        entry.request = request || null;
      }
      return request || null;
    }

    function findSeason(number, key) {
      var index;
      var candidate;
      for (index = 0; index < (origin && origin.seasons || []).length; index += 1) {
        candidate = origin.seasons[index];
        if (key && seasonKey(candidate) === String(key)) { return candidate; }
        if (seasonNumber(candidate) === Number(number)) { return candidate; }
      }
      return null;
    }

    function currentPosition(current) {
      var value = current && current.item ? current : null;
      var item = value ? value.item : current && current.ratingKey ? current : origin && origin.currentItem;
      var s = value ? numeric(value.seasonNumber, 0) : itemSeasonNumber(item);
      var e = value ? numeric(value.episodeNumber, 0) : episodeNumber(item);
      var season = findSeason(s, value && value.seasonKey);
      if (!item || !season) { return null; }
      return {
        item: item,
        season: season,
        seasonNumber: s,
        episodeNumber: e,
        occurrenceId: value && value.occurrenceId || contract.seriesOccurrenceIdentity(originIdentity(), s, e, item.ratingKey)
      };
    }

    function nearestEpisode(episodes, position, direction) {
      var step = direction < 0 ? -1 : 1;
      var currentIndex = -1;
      var index;
      var candidate = null;
      for (index = 0; index < episodes.length; index += 1) {
        if (String(episodes[index].ratingKey || '') === String(position.item.ratingKey || '')) {
          currentIndex = index;
          break;
        }
      }
      if (currentIndex !== -1) {
        return episodes[currentIndex + step] || null;
      }
      if (step > 0) {
        for (index = 0; index < episodes.length; index += 1) {
          if (episodeNumber(episodes[index]) > position.episodeNumber) { return episodes[index]; }
        }
      } else {
        for (index = episodes.length - 1; index >= 0; index -= 1) {
          if (episodeNumber(episodes[index]) < position.episodeNumber) { return episodes[index]; }
        }
      }
      return candidate;
    }

    function ascendingRange(first, last) {
      var start = Math.min(Number(first), Number(last));
      var end = Math.max(Number(first), Number(last));
      return start <= end ? { start: start, end: end } : null;
    }

    function missingEpisodeRange(from, to) {
      if (to > from + 1) { return ascendingRange(from + 1, to - 1); }
      if (to < from - 1) { return ascendingRange(to + 1, from - 1); }
      return null;
    }

    function targetOpeningEpisodeRange(season, target, direction) {
      var targetNumber = episodeNumber(target);
      var descriptor = segments[seasonKey(season)] || {};
      var maximum = Math.max(numeric(season && season.leafCount, 0), numeric(descriptor.maximumEpisodeNumber, 0));
      if (direction > 0 && targetNumber > 1) { return { start: 1, end: targetNumber - 1 }; }
      if (direction < 0 && maximum > targetNumber) { return { start: targetNumber + 1, end: maximum }; }
      return null;
    }

    function makeConfirmation(direction, current, target, seasonRange, episodeRange) {
      var kind = seasonRange && episodeRange ? 'combined' : seasonRange ? 'season' : 'episode';
      confirmationCounter += 1;
      return {
        kind: kind,
        direction: direction < 0 ? -1 : 1,
        currentOccurrenceId: String(current.occurrenceId || ''),
        targetOccurrenceId: String(target.occurrenceId || ''),
        target: copyOccurrence(target),
        missingSeasons: seasonRange || null,
        missingEpisodes: episodeRange || null,
        targetSeasonNumber: target.seasonNumber,
        targetEpisodeNumber: target.episodeNumber,
        title: String(target.item && target.item.title || ''),
        artwork: String(target.item && (target.item.image || target.item.thumb || target.item.art) || ''),
        generation: generation,
        token: originIdentity() + ':' + generation + ':' + confirmationCounter + ':' + target.occurrenceId
      };
    }

    function adjacentResult(direction, current, targetItem, targetSeason, seasonRange, episodeRange) {
      var target = occurrence(targetItem, targetSeason);
      var confirmation;
      if (!seasonRange && !episodeRange) { return contract.adjacentState('available', target); }
      confirmation = makeConfirmation(direction, current, target, seasonRange, episodeRange);
      return contract.adjacentState('confirmation-required', null, confirmation);
    }

    function resolveAcrossSeasons(position, direction, callback) {
      var seasons = origin.seasons;
      var currentIndex = seasons.indexOf(position.season);
      var index = currentIndex + (direction < 0 ? -1 : 1);

      function next() {
        var season;
        if (index < 0 || index >= seasons.length) {
          call(callback, null, contract.adjacentState('unavailable'));
          return;
        }
        season = seasons[index];
        index += direction < 0 ? -1 : 1;
        loadSeason(season, function (error, episodes) {
          var targetItem;
          var seasonRange;
          var episodeRange;
          if (error) { call(callback, error, null); return; }
          if (!episodes || !episodes.length) { next(); return; }
          targetItem = direction < 0 ? episodes[episodes.length - 1] : episodes[0];
          targetItem = targetWithEpisodes(targetItem, episodes);
          seasonRange = missingEpisodeRange(position.seasonNumber, seasonNumber(season));
          episodeRange = targetOpeningEpisodeRange(season, targetItem, direction);
          call(callback, null, adjacentResult(direction, position, targetItem, season, seasonRange, episodeRange));
        });
      }

      next();
    }

    function resolvePosition(position, direction, callback) {
      loadSeason(position.season, function (error, episodes) {
        var targetItem;
        var gap;
        if (error) { call(callback, error, null); return; }
        targetItem = nearestEpisode(episodes || [], position, direction);
        if (targetItem) {
          targetItem = targetWithEpisodes(targetItem, episodes);
          gap = missingEpisodeRange(position.episodeNumber, episodeNumber(targetItem));
          call(callback, null, adjacentResult(direction, position, targetItem, position.season, null, gap));
          return;
        }
        resolveAcrossSeasons(position, direction, callback);
      });
    }

    function open(nextOrigin) {
      var scope;
      var seasons;
      var currentSeason;
      var currentSeasonNumber;
      if (destroyed) { throw new Error('Series queue provider is destroyed'); }
      if (!nextOrigin || String(nextOrigin.kind || '') !== 'series' || !nextOrigin.id || !nextOrigin.currentItem) {
        throw new Error('Series queue origin requires an id and current item');
      }
      invalidate();
      currentSeasonNumber = numeric(nextOrigin.currentSeasonNumber, itemSeasonNumber(nextOrigin.currentItem));
      scope = contract.seriesScope({ seasonNumber: currentSeasonNumber });
      seasons = (nextOrigin.seasons || []).filter(function (candidate) {
        return contract.seasonInScope(scope, seasonNumber(candidate));
      }).slice(0).sort(sortSeasons);
      currentSeason = null;
      seasons.some(function (candidate) {
        if (seasonNumber(candidate) === currentSeasonNumber) { currentSeason = candidate; return true; }
        return false;
      });
      if (!currentSeason) {
        currentSeason = {
          ratingKey: nextOrigin.currentItem.parentRatingKey || 'season-' + currentSeasonNumber,
          index: currentSeasonNumber,
          title: nextOrigin.currentItem.parentTitle || ''
        };
        seasons.push(currentSeason);
        seasons.sort(sortSeasons);
      }
      origin = {
        id: String(nextOrigin.id),
        title: String(nextOrigin.title || ''),
        scope: scope,
        seasons: seasons,
        currentItem: nextOrigin.currentItem,
        currentSeasonNumber: currentSeasonNumber,
        currentEpisodeNumber: numeric(nextOrigin.currentEpisodeNumber, episodeNumber(nextOrigin.currentItem)),
        currentSeason: currentSeason
      };
      storeSegment(currentSeason, nextOrigin.currentSeasonEpisodes || [nextOrigin.currentItem]);
      return generation;
    }

    function close() {
      if (destroyed || !origin) { return false; }
      invalidate();
      origin = null;
      return true;
    }

    function current() {
      if (!origin) { return null; }
      return copyOccurrence(occurrence(origin.currentItem, origin.currentSeason));
    }

    function setCurrent(item) {
      var number;
      var episode;
      var season;
      var previousOccurrenceId;
      var nextOccurrenceId;
      if (destroyed || !origin || !item || !item.ratingKey) { return false; }
      number = itemSeasonNumber(item);
      episode = episodeNumber(item);
      season = findSeason(number, item.parentRatingKey);
      if (!season) { return false; }
      previousOccurrenceId = contract.seriesOccurrenceIdentity(
        originIdentity(), origin.currentSeasonNumber, origin.currentEpisodeNumber, origin.currentItem.ratingKey
      );
      nextOccurrenceId = contract.seriesOccurrenceIdentity(originIdentity(), number, episode, item.ratingKey);
      if (previousOccurrenceId !== nextOccurrenceId) { pendingAdjacent = {}; }
      origin.currentItem = item;
      origin.currentSeasonNumber = number;
      origin.currentEpisodeNumber = episode;
      origin.currentSeason = season;
      return true;
    }

    function indexOf(currentValue) {
      var position;
      if (destroyed || !origin) { return -1; }
      position = currentPosition(currentValue);
      if (!position) { return -1; }
      return occurrence(position.item, position.season).absoluteIndex;
    }

    function resolveAdjacent(currentValue, direction, callback) {
      var directionValue = Number(direction) < 0 ? -1 : 1;
      var position;
      var key;
      var requestGeneration = generation;
      if (destroyed || !origin) {
        call(callback, null, contract.adjacentState('unavailable'));
        return contract.adjacentState('unavailable');
      }
      position = currentPosition(currentValue);
      if (!position) {
        call(callback, new Error('Current series occurrence is unavailable'), null);
        return contract.adjacentState('unavailable');
      }
      key = position.occurrenceId + ':' + directionValue;
      if (pendingAdjacent[key]) { return contract.adjacentState('resolving'); }
      pendingAdjacent[key] = true;
      resolvePosition(position, directionValue, function (error, result) {
        if (destroyed || requestGeneration !== generation || !pendingAdjacent[key]) { return; }
        delete pendingAdjacent[key];
        call(callback, error || null, result || null);
      });
      return contract.adjacentState('resolving');
    }

    function layoutAt(absoluteIndex) {
      var index = Number(absoluteIndex);
      var offset = 0;
      var count;
      var season;
      var seasonIndex;
      if (!origin || !isFinite(index) || index < 0) { return null; }
      for (seasonIndex = 0; seasonIndex < origin.seasons.length; seasonIndex += 1) {
        season = origin.seasons[seasonIndex];
        count = seasonCount(season);
        if (index < offset + count) {
          return {
            season: season,
            offset: offset,
            count: count,
            localIndex: index - offset
          };
        }
        offset += count;
      }
      return null;
    }

    function resolveAt(absoluteIndex, callback, retryCount) {
      var index = Number(absoluteIndex);
      var layout;
      var requestGeneration = generation;
      retryCount = Math.max(0, Number(retryCount || 0));
      if (destroyed || !origin || !isFinite(index) || index < 0 || index >= knownTotal()) {
        call(callback, null, null);
        return false;
      }
      layout = layoutAt(index);
      if (!layout) {
        call(callback, null, null);
        return false;
      }
      loadSeason(layout.season, function (error, records) {
        var currentLayout;
        var item;
        if (destroyed || requestGeneration !== generation) { return; }
        if (error) { call(callback, error, null); return; }
        currentLayout = layoutAt(index);
        if (!currentLayout) { call(callback, null, null); return; }
        if (currentLayout.season !== layout.season || currentLayout.localIndex !== layout.localIndex) {
          if (retryCount >= origin.seasons.length) {
            call(callback, new Error('Series queue layout did not stabilize'), null);
            return;
          }
          resolveAt(index, callback, retryCount + 1);
          return;
        }
        item = records && records[currentLayout.localIndex];
        call(callback, null, item ? copyOccurrence(occurrence(item, currentLayout.season, index)) : null);
      });
      return true;
    }

    function window(startIndex, endIndex, callback, retryCount) {
      var requestGeneration = generation;
      var start = Math.max(0, Math.floor(Number(startIndex || 0)));
      var requestedEnd = Math.max(start, Math.floor(Number(endIndex || 0)));
      var total = knownTotal();
      var end = Math.min(total, requestedEnd);
      var initialLayout = [];
      var currentLayout = [];
      var targets = [];
      var results = [];
      var offset = 0;
      var remaining;
      var seasonIndex;
      var season;
      var count;
      var localStart;
      var localEnd;
      retryCount = Math.max(0, Number(retryCount || 0));
      if (destroyed || !origin) {
        call(callback, null, { start: start, end: start, total: 0, items: [] });
        return false;
      }
      if (end <= start) {
        call(callback, null, { start: start, end: start, total: total, items: [] });
        return true;
      }
      for (seasonIndex = 0; seasonIndex < origin.seasons.length; seasonIndex += 1) {
        season = origin.seasons[seasonIndex];
        count = seasonCount(season);
        if (start < offset + count && end > offset) {
          localStart = Math.max(0, start - offset);
          localEnd = Math.min(count, end - offset);
          targets.push({
            season: season,
            offset: offset,
            localStart: localStart,
            localEnd: localEnd
          });
          initialLayout.push([seasonKey(season), offset, count, localStart, localEnd].join(':'));
        }
        offset += count;
      }
      remaining = targets.length;
      if (!remaining) {
        call(callback, null, { start: start, end: end, total: total, items: [] });
        return true;
      }

      function finishTarget(error, records, target) {
        var localIndex;
        var item;
        if (destroyed || requestGeneration !== generation || remaining <= 0) { return; }
        if (error) {
          remaining = 0;
          call(callback, error, null);
          return;
        }
        for (localIndex = target.localStart; localIndex < target.localEnd; localIndex += 1) {
          item = records && records[localIndex];
          if (item) {
            results.push(copyOccurrence(occurrence(item, target.season, target.offset + localIndex)));
          }
        }
        remaining -= 1;
        if (remaining > 0) { return; }
        offset = 0;
        currentLayout = [];
        total = knownTotal();
        end = Math.min(total, requestedEnd);
        for (seasonIndex = 0; seasonIndex < origin.seasons.length; seasonIndex += 1) {
          season = origin.seasons[seasonIndex];
          count = seasonCount(season);
          if (start < offset + count && end > offset) {
            localStart = Math.max(0, start - offset);
            localEnd = Math.min(count, end - offset);
            currentLayout.push([seasonKey(season), offset, count, localStart, localEnd].join(':'));
          }
          offset += count;
        }
        if (initialLayout.join('|') !== currentLayout.join('|')) {
          if (retryCount >= origin.seasons.length) {
            call(callback, new Error('Series queue layout did not stabilize'), null);
            return;
          }
          window(start, requestedEnd, callback, retryCount + 1);
          return;
        }
        results.sort(function (left, right) { return left.absoluteIndex - right.absoluteIndex; });
        call(callback, null, {
          start: start,
          end: end,
          total: total,
          items: results
        });
      }

      targets.forEach(function (target) {
        loadSeason(target.season, function (error, records) {
          finishTarget(error, records, target);
        });
      });
      return true;
    }

    function snapshot() {
      var cacheState = cache.snapshot();
      var now=currentPosition();
      return {
        kind: origin ? 'series' : '',
        originId: origin && origin.id || '',
        scope: origin && origin.scope || '',
        generation: generation,
        currentOccurrenceId: now&&now.occurrenceId||'',
        knownTotal: origin ? knownTotal() : 0,
        residentPages: cacheState.residentPages,
        residentRecords: cacheState.residentRecords,
        peakResidentPages: cacheState.peakResidentPages,
        peakResidentRecords: cacheState.peakResidentRecords,
        pendingSeasons: Object.keys(pendingSeasons).length,
        pendingAdjacent: Object.keys(pendingAdjacent).length
      };
    }

    function destroy() {
      if (destroyed) { return; }
      if (origin) { close(); }
      else { invalidate(); }
      destroyed = true;
      origin = null;
      cache.destroy();
    }

    return {
      open: open,
      close: close,
      current: current,
      setCurrent: setCurrent,
      indexOf: indexOf,
      resolveAt: resolveAt,
      resolveAdjacent: resolveAdjacent,
      window: window,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

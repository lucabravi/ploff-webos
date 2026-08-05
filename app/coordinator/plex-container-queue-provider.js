(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlexContainerQueueProvider = factory();
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
    var knownTotal = null;
    var terminalTotal = null;
    var pending = {};
    var pendingAdjacent = {};
    var destroyed = false;

    function call(callback, arg1, arg2) {
      if (typeof callback === 'function') { callback(arg1, arg2); }
    }

    function publish(waiters, error, records) {
      var index;
      for (index = 0; index < (waiters || []).length; index += 1) {
        call(waiters[index], error || null, records || null);
      }
    }

    function originIdentity() {
      return origin ? String(origin.kind) + '-' + String(origin.id) : '';
    }

    function pageSignature(items) {
      var hash = 2166136261;
      var source = items || [];
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

    function abortPending() {
      var previous = pending;
      var keys = Object.keys(previous);
      var index;
      pending = {};
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
      cache.clear();
    }

    function open(nextOrigin) {
      var kind = String(nextOrigin && nextOrigin.kind || '');
      if (destroyed) { throw new Error('Container queue provider is destroyed'); }
      if (kind !== 'playlist' && kind !== 'collection') {
        throw new Error('Container queue origin must be a playlist or collection');
      }
      invalidate();
      origin = {
        kind: kind,
        id: String(nextOrigin.id || ''),
        title: String(nextOrigin.title || '')
      };
      knownTotal = isFinite(Number(nextOrigin.total)) ? Math.max(0, Number(nextOrigin.total)) : null;
      terminalTotal = null;
      return generation;
    }

    function close() {
      if (destroyed || !origin) { return false; }
      invalidate();
      origin = null;
      knownTotal = null;
      terminalTotal = null;
      return true;
    }

    function occurrence(item, absoluteIndex) {
      return {
        occurrenceId: contract.occurrenceIdentity(originIdentity(), absoluteIndex, item.ratingKey),
        absoluteIndex: absoluteIndex,
        item: item
      };
    }

    function resolveFromRecords(records, start, absoluteIndex, callback) {
      var item = records && records[absoluteIndex - start];
      if (!item || !contract.isPlayable(item)) {
        call(callback, null, null);
        return;
      }
      call(callback, null, occurrence(item, absoluteIndex));
    }

    function ensurePage(start, callback) {
      var key = String(start);
      var cached = cache.getPage(start);
      var requestGeneration = generation;
      var requestOrigin = origin;
      var entry;
      var requestCompleted = false;
      var request = null;
      if (cached) {
        call(callback, null, cached);
        return null;
      }
      if (pending[key]) {
        pending[key].waiters.push(callback);
        return pending[key].request;
      }
      entry = { waiters: [callback], request: null };
      pending[key] = entry;

      function complete(error, response) {
        var waiting;
        var items;
        var total;
        var reportedTotal;
        var previousKnownTotal;
        var terminal;
        var signature;
        var previousDescriptor;
        var cacheError = null;
        requestCompleted = true;
        if (destroyed || requestGeneration !== generation || requestOrigin !== origin || pending[key] !== entry) { return; }
        delete pending[key];
        waiting = entry.waiters.slice(0);
        if (terminalTotal !== null && start >= terminalTotal) {
          publish(waiting, null, []);
          return;
        }
        if (error) {
          publish(waiting, error, null);
          return;
        }
        items = response && response.items;
        if (items === undefined || items === null) { items = []; }
        if (!Array.isArray(items)) {
          publish(waiting, new Error('Queue page items must be an array'), null);
          return;
        }
        if (items.length > pageSize) {
          publish(waiting, new Error('Queue page exceeds requested size'), null);
          return;
        }
        previousKnownTotal = knownTotal;
        reportedTotal = Number(response && response.total);
        total = reportedTotal;
        signature = pageSignature(items);
        previousDescriptor = cache.descriptor(start);
        if (previousDescriptor && previousDescriptor.signature && previousDescriptor.signature !== signature) {
          publish(waiting, new Error('Queue origin changed during playback'), null);
          return;
        }
        if (terminalTotal === null && isFinite(total) && total >= 0) {
          total = Math.max(total, start + items.length);
          knownTotal = knownTotal === null ? total : Math.max(knownTotal, total);
          if (reportedTotal === start + items.length &&
              (previousKnownTotal === null || previousKnownTotal <= reportedTotal)) {
            terminalTotal = reportedTotal;
            knownTotal = terminalTotal;
            cache.discardFrom(terminalTotal);
          }
        }
        terminal = items.length < pageSize ||
          (knownTotal !== null && start + items.length >= knownTotal);
        if (items.length < pageSize) {
          terminalTotal = terminalTotal === null ? start + items.length :
            Math.min(terminalTotal, start + items.length);
          knownTotal = terminalTotal;
          cache.discardFrom(terminalTotal);
        }
        try {
          cache.putPage(start, items, {
            total: knownTotal === null ? 0 : knownTotal,
            terminal: terminal,
            generation: generation,
            signature: signature
          });
        } catch (caughtError) {
          cacheError = caughtError;
        }
        if (cacheError) {
          publish(waiting, cacheError, null);
          return;
        }
        publish(waiting, null, items.slice(0));
      }

      try {
        request = values.loadPage({
          origin: {
            kind: requestOrigin.kind,
            id: requestOrigin.id,
            title: requestOrigin.title
          },
          start: start,
          size: pageSize,
          generation: requestGeneration
        }, complete);
      } catch (loadError) {
        if (!requestCompleted && pending[key] === entry) {
          requestCompleted = true;
          delete pending[key];
          publish(entry.waiters.slice(0), loadError, null);
        }
      }
      if (!requestCompleted && pending[key] === entry) { entry.request = request || null; }
      return request || null;
    }

    function resolveAt(absoluteIndex, callback) {
      var index = Number(absoluteIndex);
      var start;
      if (destroyed || !origin || !isFinite(index) || index < 0 ||
          (knownTotal !== null && index >= knownTotal)) {
        call(callback, null, null);
        return false;
      }
      start = Math.floor(index / pageSize) * pageSize;
      ensurePage(start, function (error, records) {
        if (error) { call(callback, error, null); return; }
        resolveFromRecords(records, start, index, callback);
      });
      return true;
    }

    function window(startIndex, endIndex, callback) {
      var requestGeneration = generation;
      var start = Math.max(0, Math.floor(Number(startIndex || 0)));
      var end = Math.max(start, Math.floor(Number(endIndex || 0)));
      var firstPage;
      var lastPage;
      var remainingPages;
      var results = [];
      var completed = false;
      var pageStart;
      if (destroyed || !origin) {
        call(callback, null, { start: start, end: start, total: 0, items: [] });
        return false;
      }
      if (knownTotal !== null) { end = Math.min(end, knownTotal); }
      if (end <= start) {
        call(callback, null, { start: start, end: start, total: knownTotal, items: [] });
        return true;
      }
      firstPage = Math.floor(start / pageSize) * pageSize;
      lastPage = Math.floor((end - 1) / pageSize) * pageSize;
      remainingPages = Math.floor((lastPage - firstPage) / pageSize) + 1;

      function finishPage(error, records, loadedStart) {
        var from;
        var to;
        var absoluteIndex;
        var item;
        if (completed || destroyed || requestGeneration !== generation) { return; }
        if (error) {
          completed = true;
          call(callback, error, null);
          return;
        }
        from = Math.max(start, loadedStart);
        to = Math.min(end, loadedStart + (records || []).length);
        for (absoluteIndex = from; absoluteIndex < to; absoluteIndex += 1) {
          item = records[absoluteIndex - loadedStart];
          if (item && contract.isPlayable(item)) {
            results[absoluteIndex - start] = occurrence(item, absoluteIndex);
          }
        }
        remainingPages -= 1;
        if (remainingPages > 0) { return; }
        completed = true;
        to = knownTotal === null ? end : Math.min(end, knownTotal);
        from = Math.min(start, to);
        call(callback, null, {
          start: from,
          end: to,
          total: knownTotal,
          items: results.slice(0, Math.max(0, to - start)).filter(function (entry) { return !!entry; })
        });
      }

      for (pageStart = firstPage; pageStart <= lastPage; pageStart += pageSize) {
        (function (loadedStart) {
          ensurePage(loadedStart, function (error, records) {
            finishPage(error, records, loadedStart);
          });
        }(pageStart));
      }
      return true;
    }

    function resolveAdjacent(current, direction, callback) {
      var step = Number(direction) < 0 ? -1 : 1;
      var currentIndex = Number(current && current.absoluteIndex);
      var nextIndex = currentIndex + step;
      var key;
      var requestGeneration = generation;
      if (destroyed || !origin || !isFinite(currentIndex)) {
        call(callback, null, contract.adjacentState('unavailable'));
        return contract.adjacentState('unavailable');
      }
      if (nextIndex < 0 || (knownTotal !== null && nextIndex >= knownTotal)) {
        var boundary = contract.adjacentState('unavailable');
        call(callback, null, boundary);
        return boundary;
      }
      key = String(current && current.occurrenceId || currentIndex) + ':' + step;
      if (pendingAdjacent[key]) { return contract.adjacentState('resolving'); }
      pendingAdjacent[key] = true;
      resolveAt(nextIndex, function (error, value) {
        if (destroyed || requestGeneration !== generation || !pendingAdjacent[key]) { return; }
        delete pendingAdjacent[key];
        if (error) { call(callback, error, null); return; }
        if (!value) { call(callback, null, contract.adjacentState('unavailable')); return; }
        call(callback, null, contract.adjacentState('available', value));
      });
      return contract.adjacentState('resolving');
    }

    function snapshot() {
      var cacheState = cache.snapshot();
      return {
        kind: origin && origin.kind || '',
        originId: origin && origin.id || '',
        generation: generation,
        knownTotal: knownTotal,
        residentPages: cacheState.residentPages,
        residentRecords: cacheState.residentRecords,
        peakResidentPages: cacheState.peakResidentPages,
        peakResidentRecords: cacheState.peakResidentRecords,
        pendingPages: Object.keys(pending).length,
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
      resolveAt: resolveAt,
      window: window,
      resolveAdjacent: resolveAdjacent,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

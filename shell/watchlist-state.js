(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffWatchlistState = factory();
  }
}(this, function () {
  'use strict';

  function available(mode, accountToken) {
    return mode === 'plex' && !!accountToken;
  }

  function statusKey(loading, error, itemCount) {
    if (loading) { return 'watchlist.loading'; }
    if (error) { return 'state.watchlistError'; }
    return Number(itemCount) > 0 ? '' : 'watchlist.empty';
  }

  function resolve(items, resolver, concurrency, callback) {
    var seen = {};
    var queue = [];
    var results = [];
    var active = 0;
    var completed = 0;
    var limit = Math.max(1, Number(concurrency) || 4);
    (items || []).forEach(function (item, originalIndex) {
      var guid = String(item.guid || '');
      if (!guid || seen[guid]) { return; }
      seen[guid] = true;
      queue.push({ item: item, guid: guid, index: originalIndex });
    });
    if (!queue.length) { callback(null, []); return; }
    function finishIfReady() {
      if (completed !== queue.length) { return false; }
      results.sort(function (left, right) { return left.index - right.index; });
      callback(null, results.map(function (entry) { return entry.item; }));
      return true;
    }
    function pump() {
      var entry;
      while (active < limit && completed + active < queue.length) {
        entry = queue[completed + active];
        active += 1;
        (function (current) {
          resolver(current.guid, function (error, localItem) {
            var merged;
            active -= 1;
            completed += 1;
            if (!error && localItem) {
              merged = {};
              Object.keys(localItem).forEach(function (key) { merged[key] = localItem[key]; });
              merged.cloudRatingKey = current.item.ratingKey;
              merged.cloudGuid = current.guid;
              merged.inWatchlist = true;
              results.push({ index: current.index, item: merged });
            }
            if (!finishIfReady()) { pump(); }
          });
        }(entry));
      }
    }
    pump();
  }

  function optimistic(items, item, enabled) {
    var previous = (items || []).slice();
    var next = previous.filter(function (entry) { return String(entry.ratingKey || '') !== String(item.ratingKey || ''); });
    if (enabled) { next.push(item); }
    return { items: next, rollback: function () { return previous; } };
  }

  return { available: available, optimistic: optimistic, resolve: resolve, statusKey: statusKey };
}));

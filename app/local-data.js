(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLocalData = factory(); }
}(this, function () {
  'use strict';

  var PREFIX = 'ploff.';

  function clear(storage) {
    var keys = [];
    var index;
    var key;
    var removed = 0;
    if (!storage || !storage.key || !storage.removeItem) { return 0; }
    try {
      for (index = 0; index < storage.length; index += 1) {
        key = storage.key(index);
        if (String(key || '').indexOf(PREFIX) === 0) { keys.push(key); }
      }
    } catch (_readError) { return 0; }
    for (index = 0; index < keys.length; index += 1) {
      try { storage.removeItem(keys[index]); removed += 1; }
      catch (_removeError) {}
    }
    return removed;
  }

  return { PREFIX: PREFIX, clear: clear };
}));

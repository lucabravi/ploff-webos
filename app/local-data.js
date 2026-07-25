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
    if (!storage || !storage.key || !storage.removeItem) { return 0; }
    for (index = 0; index < storage.length; index += 1) {
      key = storage.key(index);
      if (String(key || '').indexOf(PREFIX) === 0) { keys.push(key); }
    }
    for (index = 0; index < keys.length; index += 1) {
      storage.removeItem(keys[index]);
    }
    return keys.length;
  }

  return { PREFIX: PREFIX, clear: clear };
}));

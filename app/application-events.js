(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffApplicationEvents = factory(); }
}(this, function () {
  'use strict';

  function removeBound(bindings) {
    var entry;
    while (bindings.length) {
      entry = bindings.pop();
      try { entry.target.removeEventListener(entry.name, entry.handler, entry.options || false); }
      catch (error) { /* Teardown must continue for the remaining listeners. */ }
    }
  }

  function bind(entries) {
    var candidates = (entries || []).filter(function (entry) {
      return entry && entry.target && entry.target.addEventListener && entry.name && entry.handler;
    });
    var bindings = [];
    var destroyed = false;

    try {
      candidates.forEach(function (entry) {
        entry.target.addEventListener(entry.name, entry.handler, entry.options || false);
        bindings.push(entry);
      });
    } catch (error) {
      removeBound(bindings);
      throw error;
    }

    return {
      destroy: function () {
        if (destroyed) { return; }
        destroyed = true;
        removeBound(bindings);
      }
    };
  }

  return { bind: bind };
}));

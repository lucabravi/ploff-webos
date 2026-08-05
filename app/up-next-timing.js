(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffUpNextTiming = factory(); }
}(this, function () {
  'use strict';
  function initial(delay) { return Math.max(0, Math.ceil(Number(delay) || 0)); }
  function next(seconds) { return Math.max(0, Math.ceil(Number(seconds) || 0) - 1); }
  function complete(seconds) { return Number(seconds) <= 0; }
  return { initial: initial, next: next, complete: complete };
}));

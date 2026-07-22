(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupScanIndicator = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var timer = null;
    var count = 0;
    function tick() {
      if (values.shouldContinue && !values.shouldContinue()) { stop(); return; }
      count = (count % 4) + 1;
      values.message(count);
    }
    function stop() {
      values.root.clearInterval(timer);
      timer = null;
      count = 0;
    }
    function start() {
      stop();
      tick();
      timer = values.root.setInterval(tick, 500);
    }
    return { dots: function () { return count; }, start: start, stop: stop };
  }
  return { create: create };
}));

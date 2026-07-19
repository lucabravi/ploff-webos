(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlayerControlsState = factory();
  }
}(this, function () {
  'use strict';

  function next(mode, input) {
    var current = mode === 'timeline' || mode === 'full' ? mode : 'hidden';
    if (input === 'timeout' || input === 'hide') { return 'hidden'; }
    if (current === 'hidden' && input === 'seek') { return 'timeline'; }
    if (current === 'hidden' && (input === 'ok' || input === 'navigate' || input === 'pointer')) { return 'full'; }
    if (current === 'timeline' && (input === 'ok' || input === 'navigate' || input === 'pointer')) { return 'full'; }
    return current;
  }

  function timeout(mode) {
    if (mode === 'timeline') { return 3000; }
    if (mode === 'full') { return 5000; }
    return 0;
  }

  function visible(mode) {
    return mode !== 'hidden';
  }

  return { next: next, timeout: timeout, visible: visible };
}));

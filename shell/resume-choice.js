(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffResumeChoice = factory();
  }
}(this, function () {
  'use strict';

  function create(viewOffsetMs) {
    var value = Number(viewOffsetMs);
    var offset = isFinite(value) && value > 0 ? Math.floor(value / 1000) : 0;
    return { visible: offset > 0, index: 0, offset: offset };
  }

  function move(state, delta) {
    var direction = Number(delta) < 0 ? -1 : 1;
    return {
      visible: !!state.visible,
      index: (Number(state.index || 0) + direction + 3) % 3,
      offset: Math.max(0, Number(state.offset || 0))
    };
  }

  function select(state) {
    if (Number(state.index || 0) === 0) { return { action: 'resume', offset: Math.max(0, Number(state.offset || 0)) }; }
    if (Number(state.index || 0) === 1) { return { action: 'restart', offset: 0 }; }
    return cancel(state);
  }

  function cancel() {
    return { action: 'cancel', offset: null };
  }

  return {
    cancel: cancel,
    create: create,
    move: move,
    select: select
  };
}));

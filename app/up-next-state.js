(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffUpNextState = factory();
  }
}(this, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function create() {
    var state = { visible: false, layout: 'compact', item: null, seconds: 0, total: 0, focus: 1 };

    function snapshot() {
      return {
        visible: state.visible,
        layout: state.layout,
        item: state.item,
        seconds: state.seconds,
        total: state.total,
        focus: state.focus,
        progress: state.total ? clamp(state.seconds / state.total, 0, 1) : 0
      };
    }

    return {
      show: function (item, seconds, layout) {
        state.visible = true;
        state.layout = layout === 'bottom-panel' ? 'bottom-panel' : 'compact';
        state.item = item || null;
        state.total = Math.max(1, Number(seconds) || 0);
        state.seconds = state.total;
        state.focus = 1;
        return snapshot();
      },
      tick: function (seconds) {
        state.seconds = clamp(seconds, 0, state.total);
        return snapshot();
      },
      move: function (direction) {
        if (state.visible) {
          state.focus = clamp(state.focus + (Number(direction) < 0 ? -1 : 1), 0, 1);
        }
        return snapshot();
      },
      select: function () {
        return state.focus === 0 ? 'cancel' : 'play';
      },
      hide: function () {
        state.visible = false;
        return snapshot();
      },
      snapshot: snapshot
    };
  }

  return { create: create };
}));

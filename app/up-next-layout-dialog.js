(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffUpNextLayoutDialog = factory(); }
}(this, function () {
  'use strict';
  function create() {
    var state = { open: false, selected: 'compact', focus: 0 };
    function snapshot() { return { open: state.open, selected: state.selected, focus: state.focus }; }
    return {
      open: function (selected) { state.open = true; state.selected = selected === 'bottom-panel' ? 'bottom-panel' : 'compact'; state.focus = state.selected === 'compact' ? 0 : 1; return snapshot(); },
      close: function () { state.open = false; return snapshot(); },
      moveHorizontal: function (direction) {
        if (state.focus >= 2) { state.focus = Number(direction) < 0 ? 2 : 3; }
        return snapshot();
      },
      moveVertical: function (direction) {
        if (Number(direction) > 0) {
          state.focus = state.focus === 0 ? 1 : (state.focus === 1 ? 2 : state.focus);
        } else {
          state.focus = state.focus === 1 ? 0 : (state.focus >= 2 ? 1 : state.focus);
        }
        return snapshot();
      },
      choose: function (value) { if (value === 'compact' || value === 'bottom-panel') { state.selected = value; state.focus = 3; } return snapshot(); },
      confirm: function () { return state.selected; },
      snapshot: snapshot
    };
  }
  return { create: create };
}));

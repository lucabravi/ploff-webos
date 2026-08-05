(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffQueueGapController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var state = {
      open: false,
      focus: 0,
      confirmation: null,
      destroyed: false
    };

    function call(callback, arg1, arg2) {
      if (typeof callback === 'function') { return callback(arg1, arg2); }
      return undefined;
    }

    function copyRecord(source) {
      var result = {};
      var key;
      source = source || {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }

    function copyConfirmation(source) {
      var result;
      if (!source) { return null; }
      result = copyRecord(source);
      if (source.missingSeasons) { result.missingSeasons = copyRecord(source.missingSeasons); }
      if (source.missingEpisodes) { result.missingEpisodes = copyRecord(source.missingEpisodes); }
      if (source.target) {
        result.target = copyRecord(source.target);
        result.target.item = copyRecord(source.target.item);
      }
      return result;
    }

    function snapshot() {
      return {
        open: state.open,
        focus: state.focus,
        confirmation: copyConfirmation(state.confirmation),
        destroyed: state.destroyed
      };
    }

    function publish() { call(values.onState, snapshot()); }

    function closeSilently() {
      var changed = state.open || !!state.confirmation;
      state.open = false;
      state.focus = 0;
      state.confirmation = null;
      if (changed) { publish(); }
      return changed;
    }

    function open(confirmation) {
      if (state.destroyed || !confirmation || !confirmation.token || !confirmation.target ||
          !confirmation.target.occurrenceId || !confirmation.target.item) { return false; }
      if (state.open && state.confirmation && String(state.confirmation.token) === String(confirmation.token)) { return false; }
      state.open = true;
      state.focus = 0;
      state.confirmation = copyConfirmation(confirmation);
      publish();
      return true;
    }

    function move(direction) {
      if (!state.open || state.destroyed) { return state.focus; }
      direction=+direction<0?0:1;
      if(state.focus!==direction){state.focus=direction;publish();}
      return direction;
    }

    function valid(confirmation) {
      return typeof values.isValid !== 'function' || values.isValid(confirmation) === true;
    }

    function confirm() {
      var confirmation;
      var target;
      if (!state.open || state.destroyed || !state.confirmation) { return false; }
      confirmation = copyConfirmation(state.confirmation);
      target = confirmation.target;
      if (!valid(confirmation)) {
        closeSilently();
        return false;
      }
      closeSilently();
      call(values.onConfirm, target, confirmation);
      return true;
    }

    function cancel() {
      var confirmation;
      if (!state.open || state.destroyed || !state.confirmation) { return false; }
      confirmation = copyConfirmation(state.confirmation);
      closeSilently();
      call(values.onCancel, confirmation);
      return true;
    }

    function activate() {
      if (!state.open || state.destroyed) { return false; }
      if (state.focus === 0) { cancel(); return 'cancel'; }
      return confirm() ? 'confirm' : false;
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (!state.open || state.destroyed) { return false; }
      if (event && typeof event.preventDefault === 'function') { event.preventDefault(); }
      if (code === 27 || code === 461) { cancel(); }
      else if (direction === 'left' || code === 37) { move(-1); }
      else if (direction === 'right' || code === 39) { move(1); }
      else if (code === 13) { activate(); }
      else if (code === 415) { confirm(); }
      return true;
    }

    function invalidate() {
      if (state.destroyed) { return false; }
      return closeSilently();
    }

    function destroy() {
      if (state.destroyed) { return; }
      closeSilently();
      state.destroyed = true;
    }

    return {
      open: open,
      move: move,
      confirm: confirm,
      cancel: cancel,
      activate: activate,
      handleKey: handleKey,
      invalidate: invalidate,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffChoiceDialogController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var View = values.ChoiceDialogView;
    var view;
    var state = { open: false, index: 0, title: '', choices: [], variant: '', destroyed: false };
    var applyCallback = null;
    var returnFocusCallback = null;
    var closeCallback = null;
    var generation = 0;

    function call(callback, arg1, arg2) {
      if (typeof callback === 'function') { return callback(arg1, arg2); }
      return undefined;
    }

    function copyChoices(choices) { return (choices || []).slice(); }

    function snapshot() {
      var current = view && view.snapshot ? view.snapshot() : {};
      return {
        open: state.open,
        index: state.open && current.index !== undefined ? Number(current.index || 0) : state.index,
        title: state.title,
        choices: copyChoices(state.choices),
        destroyed: state.destroyed
      };
    }

    function open(openOptions) {
      var next = openOptions || {};
      var choices = copyChoices(next.choices);
      var current;
      if (state.destroyed || !choices.length) { return false; }
      generation += 1;
      state.open = true;
      state.title = String(next.title || '');
      state.choices = choices;
      state.variant = String(next.variant || '');
      applyCallback = next.apply || null;
      returnFocusCallback = next.returnFocus || null;
      closeCallback = next.onClose || null;
      view.open(state.title, choices, next.selectedValue, state.variant, next.previewOptions || {});
      current = view.snapshot ? view.snapshot() : {};
      state.index = Math.max(0, Number(current.index || 0));
      return true;
    }

    function close(applySelection) {
      var selected;
      var apply;
      var returnFocus;
      var onClose;
      var shouldApply = applySelection === true;
      var closingGeneration;
      if (!state.open) { return false; }
      closingGeneration = generation;
      selected = view.selected ? view.selected() : null;
      apply = applyCallback;
      returnFocus = returnFocusCallback;
      onClose = closeCallback;
      state.open = false;
      state.index = 0;
      state.title = '';
      state.choices = [];
      state.variant = '';
      applyCallback = null;
      returnFocusCallback = null;
      closeCallback = null;
      view.close();
      if (shouldApply && selected) { call(apply, selected); }
      call(onClose, shouldApply && !!selected, selected || null);
      if (!state.open && generation === closingGeneration) { call(returnFocus); }
      return true;
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (state.destroyed || !state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (direction === 'up' || code === 38) { view.move(-1); }
      else if (direction === 'down' || code === 40) { view.move(1); }
      else if (code === 13) { close(true); }
      else if (code === 27 || code === 461) { close(false); }
      state.index = state.open && view.snapshot ? Number(view.snapshot().index || 0) : 0;
      return true;
    }

    function pointerFocus(index) {
      if (state.destroyed || !state.open) { return false; }
      view.focus(Math.max(0, Number(index || 0)));
      state.index = view.snapshot ? Number(view.snapshot().index || 0) : Math.max(0, Number(index || 0));
      return true;
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      state.open = false;
      state.index = 0;
      state.title = '';
      state.choices = [];
      state.variant = '';
      applyCallback = null;
      returnFocusCallback = null;
      closeCallback = null;
      if (view && view.close) { view.close(); }
    }

    if (!View || typeof View.create !== 'function') { throw new Error('ChoiceDialogController requires ChoiceDialogView'); }
    view = View.create({ document: values.document, t: values.t, CardLayout: values.CardLayout });

    return {
      open: open,
      close: close,
      handleKey: handleKey,
      pointerFocus: pointerFocus,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

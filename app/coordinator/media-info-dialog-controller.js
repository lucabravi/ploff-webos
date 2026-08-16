(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffMediaInfoDialogController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var View = values.MediaInfoView;
    var documentRef = values.document;
    var view;
    var closeButton = null;
    var applyButton = null;
    var previousButton = null;
    var nextButton = null;
    var applyCallback = null;
    var state = {
      open: false, origin: '', destroyed: false, mode: 'info',
      choices: [], selectedValue: '', previewIndex: 0, focus: 'selector'
    };

    function call(callback, arg1) {
      if (typeof callback === 'function') { return callback(arg1); }
      return undefined;
    }

    function copyChoices(choices) { return (choices || []).slice(); }

    function snapshot() {
      var result = { open: state.open, origin: state.origin, destroyed: state.destroyed };
      if (state.open && state.mode === 'versions') {
        result.mode = 'versions';
        result.previewIndex = state.previewIndex;
        result.focus = state.focus;
      }
      return result;
    }

    function resetVersionState() {
      state.mode = 'info';
      state.choices = [];
      state.selectedValue = '';
      state.previewIndex = 0;
      state.focus = 'selector';
      applyCallback = null;
    }

    function currentChoice() { return state.choices[state.previewIndex] || null; }

    function frame() {
      var choice = currentChoice() || {};
      return {
        model: choice.model || null,
        label: String(choice.label || ''),
        index: state.previewIndex,
        count: state.choices.length,
        active: String(choice.value) === String(state.selectedValue),
        canCycle: state.choices.length > 1,
        showApply: state.choices.length > 1,
        focus: state.focus
      };
    }

    function open(model, origin) {
      if (state.destroyed || !model || !view.open(model, origin)) { return false; }
      resetVersionState();
      state.open = true;
      state.origin = String(origin || '');
      return true;
    }

    function openVersions(openOptions, origin) {
      var next = openOptions || {};
      var choices = copyChoices(next.choices);
      var index;
      if (state.destroyed || !choices.length || typeof view.openVersions !== 'function') { return false; }
      for (index = 0; index < choices.length; index += 1) {
        if (!choices[index] || !choices[index].model) { return false; }
      }
      state.mode = 'versions';
      state.choices = choices;
      state.selectedValue = String(next.selectedValue === undefined || next.selectedValue === null ? '' : next.selectedValue);
      state.previewIndex = 0;
      state.focus = 'selector';
      applyCallback = next.apply || null;
      for (index = 0; index < choices.length; index += 1) {
        if (String(choices[index].value) === state.selectedValue) { state.previewIndex = index; break; }
      }
      if (!view.openVersions(frame())) { resetVersionState(); return false; }
      state.open = true;
      state.origin = String(origin || '');
      return true;
    }

    function close(applySelection) {
      var origin;
      var selected;
      var apply;
      if (state.destroyed || !state.open) { return false; }
      origin = state.origin;
      selected = currentChoice();
      apply = applyCallback;
      state.open = false;
      state.origin = '';
      view.close();
      if (applySelection === true && state.mode === 'versions' && state.choices.length > 1 && selected) { call(apply, selected); }
      resetVersionState();
      call(values.onClosed, origin);
      return true;
    }

    function scroll(direction) {
      if (state.destroyed || !state.open) { return false; }
      return view.scroll(Number(direction || 0));
    }

    function preview(direction) {
      var length = state.choices.length;
      if (state.destroyed || !state.open || state.mode !== 'versions' || length < 2) { return false; }
      state.previewIndex = (state.previewIndex + Number(direction || 0) + length) % length;
      if (view.updateVersions) { view.updateVersions(frame()); }
      return true;
    }

    function focusVersion(zone) {
      if (state.destroyed || !state.open || state.mode !== 'versions') { return false; }
      if (zone === 'apply' && state.choices.length < 2) { zone = 'cancel'; }
      state.focus = zone;
      if (view.focusVersion) { view.focusVersion(state.focus, state.choices.length > 1); }
      return true;
    }

    function handleVersionKey(code, direction) {
      var moved;
      if (code === 27 || code === 461) { close(false); return true; }
      if (state.focus === 'selector') {
        if (direction === 'left' || code === 37) { preview(-1); }
        else if (direction === 'right' || code === 39) { preview(1); }
        else if (direction === 'down' || code === 40) { focusVersion('content'); }
      } else if (state.focus === 'content') {
        if (direction === 'up' || code === 38) {
          moved = view.scroll(-1);
          if (!moved) { focusVersion('selector'); }
        } else if (direction === 'down' || code === 40) {
          moved = view.scroll(1);
          if (!moved) { focusVersion('cancel'); }
        }
      } else if (state.focus === 'cancel' || state.focus === 'apply') {
        if (direction === 'up' || code === 38) { focusVersion('content'); }
        else if ((direction === 'left' || code === 37 || direction === 'right' || code === 39) && state.choices.length > 1) {
          focusVersion(state.focus === 'cancel' ? 'apply' : 'cancel');
        } else if (code === 13) { close(state.focus === 'apply'); }
      }
      return true;
    }

    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (state.destroyed || !state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (state.mode === 'versions') { return handleVersionKey(code, direction); }
      if (code === 27 || code === 461 || code === 13) { close(false); }
      else if (direction === 'up' || code === 38) { scroll(-1); }
      else if (direction === 'down' || code === 40) { scroll(1); }
      return true;
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      state.open = false;
      state.origin = '';
      resetVersionState();
      if (closeButton) { closeButton.onclick = null; }
      if (applyButton) { applyButton.onclick = null; }
      if (previousButton) { previousButton.onclick = null; }
      if (nextButton) { nextButton.onclick = null; }
      if (view && view.close) { view.close(); }
    }

    if (!View || typeof View.create !== 'function') { throw new Error('MediaInfoDialogController requires MediaInfoView'); }
    view = View.create({ document: documentRef, t: values.t });
    closeButton = documentRef && documentRef.getElementById ? documentRef.getElementById('media-info-dialog-close') : null;
    applyButton = documentRef && documentRef.getElementById ? documentRef.getElementById('media-info-dialog-apply') : null;
    previousButton = documentRef && documentRef.getElementById ? documentRef.getElementById('media-info-dialog-version-prev') : null;
    nextButton = documentRef && documentRef.getElementById ? documentRef.getElementById('media-info-dialog-version-next') : null;
    if (closeButton) { closeButton.onclick = function () { close(false); }; }
    if (applyButton) { applyButton.onclick = function () { close(true); }; }
    if (previousButton) { previousButton.onclick = function () { preview(-1); }; }
    if (nextButton) { nextButton.onclick = function () { preview(1); }; }

    return {
      open: open,
      openVersions: openVersions,
      close: close,
      handleKey: handleKey,
      scroll: scroll,
      preview: preview,
      focusVersion: focusVersion,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

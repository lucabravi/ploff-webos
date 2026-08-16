(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSafeAreaDialog = factory(); }
}(this, function () {
  'use strict';

  var EDGE_KEYS = ['safeAreaTop', 'safeAreaRight', 'safeAreaBottom', 'safeAreaLeft'];
  var EDGE_LABELS = ['settings.safeAreaTop', 'settings.safeAreaRight', 'settings.safeAreaBottom', 'settings.safeAreaLeft'];
  var ACTION_IDS = ['safe-area-reset', 'safe-area-cancel', 'safe-area-apply'];
  var EDGE_IDS = ['top', 'right', 'bottom', 'left'];

  function copyValues(values) {
    var source = values || {};
    return {
      safeAreaTop: Number(source.safeAreaTop || 0),
      safeAreaRight: Number(source.safeAreaRight || 0),
      safeAreaBottom: Number(source.safeAreaBottom || 0),
      safeAreaLeft: Number(source.safeAreaLeft || 0)
    };
  }

  function create(options) {
    var values = options || {};
    var document = values.document;
    var t = values.t || function (key) { return key; };
    var insets = values.insets || [0, 1, 2, 3, 4, 5];
    var state = { open: false, focus: 0, editing: false, values: copyValues(null), callbacks: {} };

    function call(callback, arg) {
      if (typeof callback === 'function') { return callback(arg); }
      return undefined;
    }

    function node(id) {
      return document && document.getElementById ? document.getElementById(id) : null;
    }

    function focusNodes() {
      return document && document.querySelectorAll ? document.querySelectorAll('[data-safe-area-index]') : [];
    }

    function setText(id, text) {
      var target = node(id);
      if (target) { target.textContent = text === undefined || text === null ? '' : String(text); }
    }

    function clampFocus(index) {
      return Math.max(0, Math.min(EDGE_KEYS.length + ACTION_IDS.length - 1, Number(index) || 0));
    }

    function renderFocus() {
      var buttons = focusNodes();
      var index;
      var button;
      if (values.clearFocus) { values.clearFocus(); }
      for (index = 0; index < buttons.length; index += 1) {
        button = buttons[index];
        button.className = String(button.className || '')
          .replace(/\s?is-focused/g, '')
          .replace(/\s?is-editing/g, '') +
          (state.open && index === state.focus ? ' is-focused' : '') +
          (state.open && state.editing && index === state.focus ? ' is-editing' : '');
        if (index < EDGE_KEYS.length) {
          button.setAttribute('aria-pressed', state.open && state.editing && index === state.focus ? 'true' : 'false');
        }
      }
      button = buttons[state.focus];
      if (state.open && button && !call(values.pointerActive) && button.focus) { button.focus(); }
    }

    function render() {
      var index;
      var key;
      var target;
      var dialog = node('safe-area-dialog');
      if (!state.open) { return; }
      setText('safe-area-dialog-title', t('settings.safeAreaTitle'));
      setText('safe-area-dialog-hint', t('settings.safeAreaHint'));
      setText('safe-area-dialog-message', t('settings.safeAreaMessage'));
      for (index = 0; index < EDGE_KEYS.length; index += 1) {
        key = EDGE_KEYS[index];
        setText('safe-area-edge-' + EDGE_IDS[index] + '-label', t(EDGE_LABELS[index]));
        setText('safe-area-edge-' + EDGE_IDS[index] + '-value', state.values[key] + '%');
      }
      setText('safe-area-reset', t('settings.safeAreaReset'));
      setText('safe-area-cancel', t('common.cancel'));
      setText('safe-area-apply', t('common.apply'));
      if (dialog) {
        dialog.className = 'safe-area-dialog';
        dialog.setAttribute('aria-hidden', 'false');
      }
      target = node('safe-area-dialog');
      if (target) { target.setAttribute('data-safe-area-open', 'true'); }
      renderFocus();
    }

    function focusAction(index) {
      if (!state.open) { return false; }
      state.focus = clampFocus(index);
      state.editing = false;
      renderFocus();
      return true;
    }

    function moveEdge(direction) {
      var destinations = {
        up: [0, 0, 0, 0],
        down: [2, 2, 4, 2],
        left: [3, 3, 3, 3],
        right: [1, 1, 1, 1]
      };
      var next = destinations[direction] && destinations[direction][state.focus];
      if (next === undefined || next === state.focus) { return; }
      focusAction(next);
    }

    function emitChange() {
      call(state.callbacks.change, copyValues(state.values));
    }

    function adjust(direction) {
      var key;
      var current;
      var index;
      var next;
      if (state.focus >= EDGE_KEYS.length) { return; }
      key = EDGE_KEYS[state.focus];
      current = Number(state.values[key] || 0);
      index = insets.indexOf(current);
      if (index < 0) { index = 0; }
      next = Math.max(0, Math.min(insets.length - 1, index + direction));
      if (next === index) { return; }
      state.values[key] = Number(insets[next]);
      emitChange();
      render();
    }

    function reset() {
      var index;
      for (index = 0; index < EDGE_KEYS.length; index += 1) { state.values[EDGE_KEYS[index]] = 0; }
      emitChange();
      render();
    }

    function hide() {
      var dialog = node('safe-area-dialog');
      state.open = false;
      state.editing = false;
      state.callbacks = {};
      if (dialog) {
        dialog.className = 'safe-area-dialog is-hidden';
        dialog.setAttribute('aria-hidden', 'true');
        dialog.removeAttribute('data-safe-area-open');
      }
      renderFocus();
    }

    function cancel() {
      var callback;
      if (!state.open) { return false; }
      callback = state.callbacks.cancel;
      hide();
      call(callback, copyValues(state.values));
      return true;
    }

    function apply() {
      var callback;
      var result;
      if (!state.open) { return false; }
      callback = state.callbacks.apply;
      result = copyValues(state.values);
      hide();
      call(callback, result);
      return true;
    }

    function handleKey(event, direction) {
      var keyCode = Number(event && event.keyCode);
      if (!state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (keyCode === 27 || keyCode === 461) {
        if (state.editing) {
          state.editing = false;
          renderFocus();
        } else { cancel(); }
        return true;
      }
      if (state.focus < EDGE_KEYS.length) {
        if (state.editing) {
          if (keyCode === 37 || direction === 'left') { adjust(-1); }
          else if (keyCode === 39 || direction === 'right') { adjust(1); }
          else if (keyCode === 13) { state.editing = false; renderFocus(); }
        } else if (keyCode === 37 || direction === 'left') { moveEdge('left'); }
        else if (keyCode === 39 || direction === 'right') { moveEdge('right'); }
        else if (keyCode === 38 || direction === 'up') { moveEdge('up'); }
        else if (keyCode === 40 || direction === 'down') { moveEdge('down'); }
        else if (keyCode === 13) { state.editing = true; renderFocus(); }
      } else if (keyCode === 37 || direction === 'left') { focusAction(Math.max(EDGE_KEYS.length, state.focus - 1)); }
      else if (keyCode === 39 || direction === 'right') { focusAction(Math.min(EDGE_KEYS.length + ACTION_IDS.length - 1, state.focus + 1)); }
      else if (keyCode === 38 || direction === 'up') { focusAction(2); }
      else if (keyCode === 40 || direction === 'down') { return true; }
      else if (keyCode === 13) {
        if (state.focus === EDGE_KEYS.length) { reset(); }
        else if (state.focus === EDGE_KEYS.length + 1) { cancel(); }
        else { apply(); }
      }
      return true;
    }

    function open(initialValues, callbacks) {
      state.open = true;
      state.focus = 0;
      state.editing = false;
      state.values = copyValues(initialValues);
      state.callbacks = callbacks || {};
      render();
      return snapshot();
    }

    function dismiss() {
      if (!state.open) { return false; }
      hide();
      return true;
    }

    function snapshot() {
      return { open: state.open, focus: state.focus, editing: state.editing, values: copyValues(state.values) };
    }

    function destroy() { dismiss(); }

    return {
      open: open,
      render: render,
      focusAction: focusAction,
      handleKey: handleKey,
      cancel: cancel,
      apply: apply,
      dismiss: dismiss,
      snapshot: snapshot,
      destroy: destroy
    };
  }

  return { create: create };
}));

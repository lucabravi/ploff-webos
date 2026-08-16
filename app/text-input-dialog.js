(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./t9-input')); }
  else { root.PloffTextInputDialog = factory(root.PloffT9Input); }
}(this, function (DefaultT9Input) {
  'use strict';

  function create(options) {
    var values = options || {};
    var root = values.root;
    var document = values.document;
    var T9Input = values.T9Input || DefaultT9Input;
    var state = { open: false, focus: 0, value: '', preview: '', maximum: 80 };
    var applyCallback = null;
    var cancelCallback = null;
    var t9 = null;

    function node(id) { return document && document.getElementById ? document.getElementById(id) : null; }
    function clean(value) {
      // eslint-disable-next-line no-control-regex
      return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, state.maximum);
    }
    function isT9Enabled() { return typeof values.t9Enabled === 'function' ? values.t9Enabled() === true : values.t9Enabled === true; }
    function displayedValue() { return clean(state.value + state.preview); }
    function syncInput() {
      var input = node('text-input-dialog-field');
      if (input) { input.value = displayedValue(); }
    }
    function createT9() {
      if (!T9Input || !T9Input.create || !root) { return null; }
      return T9Input.create({
        root: root,
        delay: Number(values.t9Delay || 700),
        onPreview: function (character) { state.preview = character || ''; syncInput(); },
        onCommit: function (character) { state.value = clean(state.value + character); state.preview = ''; syncInput(); }
      });
    }
    function flushT9() { if (t9) { t9.flush(); } }
    function cancelT9(skipSync) { if (t9) { t9.cancel(); } state.preview = ''; if (!skipSync) { syncInput(); } }
    function setFocused(target, focused) {
      if (!target) { return; }
      target.className = String(target.className || '').replace(/\s*is-focused/g, '') + (focused ? ' is-focused' : '');
    }
    function renderFocus() {
      var input = node('text-input-dialog-field');
      var cancel = node('text-input-dialog-cancel');
      var apply = node('text-input-dialog-apply');
      setFocused(input, state.focus === 0);
      setFocused(cancel, state.focus === 1);
      setFocused(apply, state.focus === 2);
      if (state.focus === 0 && input && input.focus) { input.focus(); }
      else if (state.focus === 1 && cancel && cancel.focus) { cancel.focus(); }
      else if (state.focus === 2 && apply && apply.focus) { apply.focus(); }
    }
    function close(applied) {
      var dialog = node('text-input-dialog');
      var callback = applied ? applyCallback : cancelCallback;
      if (!state.open) { return false; }
      if (applied) { flushT9(); } else { cancelT9(); }
      state.value = clean(state.value);
      state.open = false;
      applyCallback = null;
      cancelCallback = null;
      if (dialog) { dialog.className = 'text-input-dialog is-hidden'; dialog.setAttribute('aria-hidden', 'true'); }
      if (typeof callback === 'function') { callback(state.value); }
      return true;
    }
    function open(openOptions) {
      var next = openOptions || {};
      var dialog = node('text-input-dialog');
      var input = node('text-input-dialog-field');
      state.open = true;
      state.focus = 0;
      state.maximum = Math.max(1, Number(next.maximum || 80));
      state.value = clean(next.value);
      state.preview = '';
      applyCallback = next.apply || null;
      cancelCallback = next.cancel || null;
      node('text-input-dialog-title').textContent = String(next.title || '');
      node('text-input-dialog-hint').textContent = String(next.hint || '');
      node('text-input-dialog-cancel').textContent = String(next.cancelLabel || 'Cancel');
      node('text-input-dialog-apply').textContent = String(next.applyLabel || 'Apply');
      input.value = state.value;
      input.maxLength = state.maximum;
      input.placeholder = String(next.placeholder || '');
      dialog.className = 'text-input-dialog';
      dialog.setAttribute('aria-hidden', 'false');
      renderFocus();
      return true;
    }
    function handleFieldKey(event, direction, code) {
      var input = node('text-input-dialog-field');
      if (direction === 'down') {
        flushT9();
        if (event && event.preventDefault) { event.preventDefault(); }
        state.focus = 2;
        renderFocus();
        return true;
      }
      if (direction === 'up') { if (event && event.preventDefault) { event.preventDefault(); } return true; }
      if (isT9Enabled() && t9 && ((code >= 48 && code <= 57) || (code >= 96 && code <= 105))) {
        if (event && event.preventDefault) { event.preventDefault(); }
        t9.inputKeyCode(code);
        return true;
      }
      if (code === 8) {
        if (event && event.preventDefault) { event.preventDefault(); }
        if (!t9 || !t9.backspace()) { state.value = clean(state.value.slice(0, -1)); state.preview = ''; syncInput(); }
        return true;
      }
      if (code === 13) {
        flushT9();
        if (input && input.focus) { input.focus(); }
        return true;
      }
      cancelT9(true);
      state.value = clean(input && input.value);
      return true;
    }
    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (!state.open) { return false; }
      if (code === 27 || code === 461) { if (event && event.preventDefault) { event.preventDefault(); } close(false); return true; }
      if (state.focus === 0) { return handleFieldKey(event, direction, code); }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (direction === 'up') { state.focus = 0; }
      else if (direction === 'left' || direction === 'right') { state.focus = state.focus === 1 ? 2 : 1; }
      else if (code === 13) { close(state.focus === 2); return true; }
      renderFocus();
      return true;
    }
    function focus(index) {
      if (!state.open) { return false; }
      flushT9();
      state.focus = Math.max(0, Math.min(2, Number(index || 0)));
      renderFocus();
      return true;
    }
    function snapshot() { return { open: state.open, focus: state.focus, value: state.value, preview: state.preview }; }
    function destroy() { if (state.open) { close(false); } else { cancelT9(); } }

    t9 = createT9();
    var input = node('text-input-dialog-field');
    var cancel = node('text-input-dialog-cancel');
    var apply = node('text-input-dialog-apply');
    if (input) {
      input.oninput = function () {
        var typed = clean(input.value);
        cancelT9(true);
        state.value = typed;
        syncInput();
      };
      input.onclick = function () { focus(0); };
    }
    if (cancel) { cancel.onclick = function () { focus(1); close(false); }; }
    if (apply) { apply.onclick = function () { focus(2); close(true); }; }
    return { open: open, close: close, focus: focus, handleKey: handleKey, snapshot: snapshot, destroy: destroy };
  }
  return { create: create };
}));

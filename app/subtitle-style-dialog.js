(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSubtitleStyleDialog = factory(); }
}(this, function () {
  'use strict';

  var KEYS = ['subtitleBackground', 'subtitlePosition', 'subtitleEdge'];
  var IDS = ['background', 'position', 'edge'];

  function copy(source) {
    var value = source || {};
    return {
      subtitleBackground: String(value.subtitleBackground || 'off'),
      subtitlePosition: Number(value.subtitlePosition || 7),
      subtitleEdge: String(value.subtitleEdge || 'shadow')
    };
  }

  function create(options) {
    var values = options || {};
    var document = values.document;
    var t = values.t || function (key) { return key; };
    var choices = {
      subtitleBackground: values.backgrounds || ['off', 'low', 'medium', 'high', 'opaque'],
      subtitlePosition: values.positions || [5, 7, 10, 13, 16],
      subtitleEdge: values.edges || ['shadow', 'outline', 'both']
    };
    var defaults = copy(values.defaults);
    var state = { open: false, focus: 0, values: copy(null), callbacks: {} };

    function call(callback, arg) { return typeof callback === 'function' ? callback(arg) : undefined; }
    function node(id) { return document && document.getElementById ? document.getElementById(id) : null; }
    function focusNodes() { return document && document.querySelectorAll ? document.querySelectorAll('[data-subtitle-style-index]') : []; }
    function setText(id, text) { var target = node(id); if (target) { target.textContent = String(text === undefined ? '' : text); } }
    function css(target, name, value) {
      if (!target || !target.style) { return; }
      if (target.style.setProperty) { target.style.setProperty(name, value); }
      else { target.style[name] = value; }
    }
    function backgroundOpacity(value) { return { off: 0, low: 0.25, medium: 0.5, high: 0.75, opaque: 1 }[value] || 0; }
    function edgeShadow(value) {
      if (value === 'outline') { return '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000'; }
      if (value === 'both') { return '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 4px 7px #000'; }
      return '0 3px 7px #000,0 0 4px #000';
    }
    function label(key, value) {
      if (key === 'subtitlePosition') { return value + '%'; }
      return t('settings.' + (key === 'subtitleBackground' ? 'subtitleBackground.' : 'subtitleEdge.') + value);
    }
    function renderFocus() {
      var buttons = focusNodes();
      var index;
      if (values.clearFocus) { values.clearFocus(); }
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = String(buttons[index].className || '').replace(/\s?is-focused/g, '') + (index === state.focus ? ' is-focused' : '');
      }
      if (buttons[state.focus] && !call(values.pointerActive) && buttons[state.focus].focus) { buttons[state.focus].focus(); }
    }
    function render() {
      var dialog = node('subtitle-style-dialog');
      var preview = node('subtitle-style-dialog-preview');
      var index;
      if (!state.open) { return; }
      setText('subtitle-style-dialog-title', t('settings.subtitleAppearance'));
      setText('subtitle-style-dialog-preview-text', t('settings.subtitlePreviewText'));
      for (index = 0; index < KEYS.length; index += 1) {
        setText('subtitle-style-' + IDS[index] + '-label', t('settings.' + KEYS[index]));
        setText('subtitle-style-' + IDS[index] + '-value', label(KEYS[index], state.values[KEYS[index]]));
      }
      setText('subtitle-style-reset', t('settings.safeAreaReset'));
      setText('subtitle-style-cancel', t('common.cancel'));
      setText('subtitle-style-apply', t('common.apply'));
      css(preview, '--subtitle-position', state.values.subtitlePosition + '%');
      css(preview, '--subtitle-background', 'rgba(0,0,0,' + backgroundOpacity(state.values.subtitleBackground) + ')');
      css(preview, '--subtitle-shadow', edgeShadow(state.values.subtitleEdge));
      if (dialog) { dialog.className = 'subtitle-style-dialog'; dialog.setAttribute('aria-hidden', 'false'); }
      renderFocus();
    }
    function focusAction(index) {
      if (!state.open) { return false; }
      state.focus = Math.max(0, Math.min(5, Number(index) || 0));
      renderFocus();
      return true;
    }
    function cycle(direction) {
      var key = KEYS[state.focus];
      var list = choices[key];
      var index;
      if (!key || !list || !list.length) { return; }
      index = list.indexOf(state.values[key]);
      if (index < 0) { index = 0; }
      index = Math.max(0, Math.min(list.length - 1, index + direction));
      state.values[key] = list[index];
      render();
    }
    function hide() {
      var dialog = node('subtitle-style-dialog');
      state.open = false;
      state.callbacks = {};
      if (dialog) { dialog.className = 'subtitle-style-dialog is-hidden'; dialog.setAttribute('aria-hidden', 'true'); }
    }
    function close(apply) {
      var callback;
      var result;
      if (!state.open) { return false; }
      callback = apply ? state.callbacks.apply : state.callbacks.cancel;
      result = copy(state.values);
      hide();
      call(callback, result);
      return true;
    }
    function reset() { state.values = copy(defaults); render(); }
    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      if (!state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (code === 27 || code === 461) { return close(false); }
      if (state.focus < 3) {
        if (direction === 'left' || code === 37) { cycle(-1); }
        else if (direction === 'right' || code === 39) { cycle(1); }
        else if (direction === 'up' || code === 38) { focusAction(state.focus - 1); }
        else if (direction === 'down' || code === 40) { focusAction(state.focus + 1); }
        else if (code === 13) { focusAction(5); }
      } else if (direction === 'left' || code === 37) { focusAction(state.focus - 1); }
      else if (direction === 'right' || code === 39) { focusAction(state.focus + 1); }
      else if (direction === 'up' || code === 38) { focusAction(2); }
      else if (code === 13) {
        if (state.focus === 3) { reset(); }
        else { close(state.focus === 5); }
      }
      return true;
    }
    function open(current, callbacks) {
      state.open = true;
      state.focus = 0;
      state.values = copy(current);
      state.callbacks = callbacks || {};
      render();
      return snapshot();
    }
    function snapshot() { return { open: state.open, focus: state.focus, values: copy(state.values) }; }
    function destroy() { hide(); }
    return { open: open, close: close, handleKey: handleKey, focusAction: focusAction, render: render, snapshot: snapshot, destroy: destroy };
  }

  return { create: create };
}));

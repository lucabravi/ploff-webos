(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./t9-input'), require('./search-model')); }
  else { root.PloffTextInputDialog = factory(root.PloffT9Input, root.PloffSearchModel); }
}(this, function (DefaultT9Input, DefaultKeyboardModel) {
  'use strict';

  function create(options) {
    var values = options || {};
    var root = values.root;
    var document = values.document;
    var T9Input = values.T9Input || DefaultT9Input;
    var KeyboardModel = values.KeyboardModel || DefaultKeyboardModel;
    var state = {
      open: false, focus: 0, value: '', preview: '', maximum: 80,
      keyboard: false, forceT9: false, symbolMode: false, uppercase: false, keyboardRow: 0, keyboardColumn: 0
    };
    var applyCallback = null;
    var cancelCallback = null;
    var t9 = null;
    var keyboardNodesByPosition = {};
    var keyboardFocusTarget = null;
    var ploffLetterRows = null;

    function node(id) { return document && document.getElementById ? document.getElementById(id) : null; }
    function text(key) { return typeof values.t === 'function' ? values.t(key) : key; }
    function clean(value) {
      // eslint-disable-next-line no-control-regex
      return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, state.maximum);
    }
    function isT9Enabled() {
      if (state.forceT9) { return true; }
      return typeof values.t9Enabled === 'function' ? values.t9Enabled() === true : values.t9Enabled === true;
    }
    function isPloffKeyboard() { return state.keyboard === true; }
    function displayedValue() { return clean(state.value + state.preview); }
    function syncInput() {
      var input = node('text-input-dialog-field');
      if (input) { input.value = displayedValue(); }
      renderT9Legend();
    }
    function createT9() {
      if (!T9Input || !T9Input.create || !root) { return null; }
      return T9Input.create({
        root: root,
        delay: Number(values.t9Delay || 700),
        onPreview: function (character) {
          state.preview = isPloffKeyboard() && !state.symbolMode && state.uppercase ? String(character || '').toUpperCase() : (character || '');
          syncInput();
        },
        onCommit: function (character) {
          var next = isPloffKeyboard() && !state.symbolMode && state.uppercase ? String(character || '').toUpperCase() : character;
          state.value = clean(state.value + next);
          state.preview = '';
          syncInput();
        }
      });
    }
    function flushT9() { if (t9) { t9.flush(); } }
    function cancelT9(skipSync) {
      if (t9) { t9.cancel(); }
      state.preview = '';
      if (!skipSync) { syncInput(); }
      else { renderT9Legend(); }
    }
    function setFocused(target, focused) {
      if (!target) { return; }
      target.className = String(target.className || '').replace(/\s*is-focused/g, '') + (focused ? ' is-focused' : '');
    }
    function ploffRows() {
      var source;
      var rows = [];
      var index;
      if (ploffLetterRows) { return ploffLetterRows; }
      source = KeyboardModel && KeyboardModel.letterRows || [];
      for (index = 0; index < source.length; index += 1) { rows.push(source[index].slice()); }
      if (rows.length) { rows[rows.length - 1].push('symbols'); }
      ploffLetterRows = rows;
      return rows;
    }
    function keyboardRows() {
      if (!KeyboardModel) { return []; }
      if (state.symbolMode) { return KeyboardModel.symbolRows || []; }
      return isPloffKeyboard() ? ploffRows() : (KeyboardModel.letterRows || []);
    }
    function keyLabel(key) {
      if (key === 'shift') {
        if (isPloffKeyboard()) { return state.symbolMode ? text('search.letters') : text('textInput.shift'); }
        return state.symbolMode ? text('search.letters') : text('search.symbols');
      }
      if (key === 'symbols') { return text('search.symbols'); }
      if (key === 'space') { return text('search.space'); }
      if (key === 'backspace') { return text('search.backspace'); }
      if (key === 'clear') { return text('search.clear'); }
      if (isPloffKeyboard() && !state.symbolMode && state.uppercase && key.length === 1) { return key.toUpperCase(); }
      return key;
    }
    function createElement(tagName, className, content) {
      var item = document && document.createElement ? document.createElement(tagName) : null;
      var textNode;
      if (!item) { return null; }
      item.className = className || '';
      if (content !== undefined) {
        textNode = document && document.createTextNode ? document.createTextNode(String(content)) : null;
        if (textNode && item.appendChild) { item.appendChild(textNode); }
        else { item.textContent = String(content); }
      }
      return item;
    }
    function clampKeyboardPosition() {
      var rows = keyboardRows();
      if (!rows.length) { state.keyboardRow = 0; state.keyboardColumn = 0; return; }
      state.keyboardRow = Math.max(0, Math.min(rows.length - 1, Number(state.keyboardRow || 0)));
      state.keyboardColumn = Math.max(0, Math.min(rows[state.keyboardRow].length - 1, Number(state.keyboardColumn || 0)));
    }
    function renderT9Legend() {
      var container = node('text-input-dialog-t9-legend');
      var keys = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '']];
      var active = t9 ? t9.snapshot().digit : '';
      var map = T9Input && T9Input.MAP || {};
      var rowIndex;
      var column;
      var key;
      var row;
      var item;
      if (!container) { return; }
      if (!state.open || !isPloffKeyboard() || !isT9Enabled()) {
        container.className = 'search-t9-legend text-input-dialog-t9-legend is-hidden';
        container.setAttribute('aria-hidden', 'true');
        return;
      }
      container.innerHTML = '';
      container.className = 'search-t9-legend text-input-dialog-t9-legend';
      container.setAttribute('aria-hidden', 'false');
      for (rowIndex = 0; rowIndex < keys.length; rowIndex += 1) {
        row = createElement('div', 'search-t9-legend-row');
        for (column = 0; column < keys[rowIndex].length; column += 1) {
          key = keys[rowIndex][column];
          item = createElement('span', 'search-t9-legend-key' + (key === active ? ' is-active' : ''));
          if (key) {
            item.appendChild(createElement('strong', '', key));
            item.appendChild(document.createTextNode(key === '0' ? text('search.space') : map[key] || ''));
          } else { item.style.visibility = 'hidden'; }
          row.appendChild(item);
        }
        container.appendChild(row);
      }
    }
    function renderKeyboard() {
      var container = node('text-input-dialog-keyboard');
      var rows = keyboardRows();
      var rowIndex;
      var column;
      var row;
      var button;
      var key;
      if (!container) { return; }
      container.innerHTML = '';
      keyboardNodesByPosition = {};
      keyboardFocusTarget = null;
      if (!isPloffKeyboard()) {
        container.className = 'search-keyboard text-input-dialog-keyboard is-hidden';
        container.setAttribute('aria-hidden', 'true');
        return;
      }
      container.className = 'search-keyboard text-input-dialog-keyboard';
      container.setAttribute('aria-hidden', 'false');
      clampKeyboardPosition();
      for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        row = createElement('div', 'search-keyboard-row');
        if (!row) { continue; }
        for (column = 0; column < rows[rowIndex].length; column += 1) {
          key = rows[rowIndex][column];
          button = createElement(
            'button',
            'search-key' + (key === 'space' ? ' is-space' : (key.length > 1 ? ' is-wide' : '')) +
              ((key === 'backspace' || key === 'clear') ? ' is-destructive' : '') +
              (key === 'shift' && isPloffKeyboard() && !state.symbolMode && state.uppercase ? ' is-active' : ''),
            keyLabel(key)
          );
          if (!button) { continue; }
          button.type = 'button';
          button.setAttribute('data-text-input-key', key);
          button.setAttribute('data-text-input-row', rowIndex);
          button.setAttribute('data-text-input-column', column);
          (function (nextRow, nextColumn) {
            button.onclick = function () {
              state.focus = 0;
              state.keyboardRow = nextRow;
              state.keyboardColumn = nextColumn;
              activateKeyboardKey();
              renderFocus();
            };
          }(rowIndex, column));
          keyboardNodesByPosition[rowIndex + ':' + column] = button;
          row.appendChild(button);
        }
        container.appendChild(row);
      }
    }
    function renderFocus() {
      var input = node('text-input-dialog-field');
      var cancel = node('text-input-dialog-cancel');
      var apply = node('text-input-dialog-apply');
      var target;
      setFocused(input, !isPloffKeyboard() && state.focus === 0);
      setFocused(cancel, state.focus === 1);
      setFocused(apply, state.focus === 2);
      if (keyboardFocusTarget) { setFocused(keyboardFocusTarget, false); keyboardFocusTarget = null; }
      if (isPloffKeyboard() && state.focus === 0) {
        clampKeyboardPosition();
        target = keyboardNodesByPosition[state.keyboardRow + ':' + state.keyboardColumn] || null;
        if (target) { setFocused(target, true); keyboardFocusTarget = target; if (target.focus) { target.focus(); } }
      } else if (state.focus === 0 && input && input.focus) { input.focus(); }
      else if (state.focus === 1 && cancel && cancel.focus) { cancel.focus(); }
      else if (state.focus === 2 && apply && apply.focus) { apply.focus(); }
    }
    function close(applied) {
      var dialog = node('text-input-dialog');
      var keyboard = node('text-input-dialog-keyboard');
      var legend = node('text-input-dialog-t9-legend');
      var callback = applied ? applyCallback : cancelCallback;
      if (!state.open) { return false; }
      if (applied) { flushT9(); } else { cancelT9(); }
      state.value = clean(state.value);
      state.open = false;
      applyCallback = null;
      cancelCallback = null;
      if (dialog) { dialog.className = 'text-input-dialog is-hidden'; dialog.setAttribute('aria-hidden', 'true'); }
      if (keyboard) { keyboard.className = 'search-keyboard text-input-dialog-keyboard is-hidden'; keyboard.setAttribute('aria-hidden', 'true'); }
      if (legend) { legend.className = 'search-t9-legend text-input-dialog-t9-legend is-hidden'; legend.setAttribute('aria-hidden', 'true'); }
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
      state.keyboard = next.keyboard === 'ploff';
      state.forceT9 = next.t9 === true;
      state.symbolMode = false;
      state.uppercase = false;
      state.keyboardRow = 0;
      state.keyboardColumn = 0;
      applyCallback = next.apply || null;
      cancelCallback = next.cancel || null;
      node('text-input-dialog-title').textContent = String(next.title || '');
      node('text-input-dialog-hint').textContent = String(next.hint || '');
      node('text-input-dialog-cancel').textContent = String(next.cancelLabel || 'Cancel');
      node('text-input-dialog-apply').textContent = String(next.applyLabel || 'Apply');
      input.value = state.value;
      input.maxLength = state.maximum;
      input.placeholder = String(next.placeholder || '');
      input.readOnly = isPloffKeyboard() || next.nativeKeyboard === false;
      dialog.className = 'text-input-dialog' + (isPloffKeyboard() ? ' has-keyboard' : '');
      dialog.setAttribute('aria-hidden', 'false');
      renderKeyboard();
      renderT9Legend();
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
    function activateKeyboardKey() {
      var rows = keyboardRows();
      var key;
      flushT9();
      clampKeyboardPosition();
      if (!rows.length || !rows[state.keyboardRow]) { return false; }
      key = rows[state.keyboardRow][state.keyboardColumn];
      if (key === 'shift') {
        if (isPloffKeyboard()) {
          if (state.symbolMode) {
            state.symbolMode = false;
            state.keyboardRow = 3;
          } else {
            state.uppercase = !state.uppercase;
          }
        } else {
          state.symbolMode = !state.symbolMode;
          state.keyboardRow = state.symbolMode ? 2 : 3;
        }
        state.keyboardColumn = 0;
        renderKeyboard();
      } else if (key === 'symbols') {
        state.symbolMode = true;
        state.keyboardRow = 2;
        state.keyboardColumn = 0;
        renderKeyboard();
      } else if (key === 'backspace') {
        state.value = clean(state.value.slice(0, -1));
      } else if (key === 'clear') {
        state.value = '';
      } else if (key === 'space') {
        state.value = clean(state.value + ' ');
      } else {
        state.value = clean(state.value + (isPloffKeyboard() && !state.symbolMode && state.uppercase ? key.toUpperCase() : key));
      }
      state.preview = '';
      syncInput();
      return true;
    }
    function handleKeyboardKey(event, direction, code) {
      var rows = keyboardRows();
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
      if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') {
        flushT9();
        if (event && event.preventDefault) { event.preventDefault(); }
        clampKeyboardPosition();
        if (direction === 'left') { state.keyboardColumn = Math.max(0, state.keyboardColumn - 1); }
        else if (direction === 'right') { state.keyboardColumn = Math.min(rows[state.keyboardRow].length - 1, state.keyboardColumn + 1); }
        else if (direction === 'up' && state.keyboardRow > 0) {
          state.keyboardRow -= 1;
          state.keyboardColumn = Math.min(state.keyboardColumn, rows[state.keyboardRow].length - 1);
        } else if (direction === 'down') {
          if (state.keyboardRow < rows.length - 1) {
            state.keyboardRow += 1;
            state.keyboardColumn = Math.min(state.keyboardColumn, rows[state.keyboardRow].length - 1);
          } else {
            state.focus = state.keyboardColumn > 0 ? 2 : 1;
          }
        }
        renderFocus();
        return true;
      }
      if (code === 13) {
        if (event && event.preventDefault) { event.preventDefault(); }
        activateKeyboardKey();
        renderFocus();
        return true;
      }
      return true;
    }
    function handleKey(event, direction) {
      var code = Number(event && event.keyCode || 0);
      var previousFocus;
      if (!state.open) { return false; }
      if (code === 27 || code === 461) { if (event && event.preventDefault) { event.preventDefault(); } close(false); return true; }
      if (state.focus === 0) {
        return isPloffKeyboard() ? handleKeyboardKey(event, direction, code) : handleFieldKey(event, direction, code);
      }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (direction === 'up') {
        previousFocus = state.focus;
        state.focus = 0;
        if (isPloffKeyboard()) {
          state.keyboardRow = Math.max(0, keyboardRows().length - 1);
          state.keyboardColumn = previousFocus === 1 ? 0 : 1;
          clampKeyboardPosition();
        }
      } else if (direction === 'left' || direction === 'right') { state.focus = state.focus === 1 ? 2 : 1; }
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
    function snapshot() {
      return {
        open: state.open, focus: state.focus, value: state.value, preview: state.preview,
        keyboard: state.keyboard, symbolMode: state.symbolMode, uppercase: state.uppercase,
        keyboardRow: state.keyboardRow, keyboardColumn: state.keyboardColumn
      };
    }
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

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffChoiceDialogView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { open: false, index: 0, selectedIndex: -1, title: '', choices: [], variant: '' };
    function node(id) { return documentRef.getElementById(id); }
    function snapshot() { return { open: state.open, index: state.index, title: state.title, choices: state.choices.slice(), variant: state.variant }; }
    function setFocused(target, focused) {
      var className;
      if (!target) { return; }
      className = (' ' + target.className + ' ').replace(/\sis-focused\s/g, ' ').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
      target.className = className + (focused ? (className ? ' ' : '') + 'is-focused' : '');
    }
    function updateFocus() {
      var list = node('choice-dialog-list');
      var index;
      for (index = 0; index < list.children.length; index += 1) {
        setFocused(list.children[index], index === state.index);
      }
      setFocused(node('choice-dialog-cancel'), state.index === state.choices.length);
    }
    function render() {
      var list = node('choice-dialog-list');
      var button;
      var swatch;
      var label;
      var index;
      var cancel = node('choice-dialog-cancel');
      var dialog = node('choice-dialog');
      node('choice-dialog-title').textContent = state.title;
      list.setAttribute('role', 'listbox');
      list.innerHTML = '';
      for (index = 0; index < state.choices.length; index += 1) {
        button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'choice-dialog-option' +
          (index === state.selectedIndex ? ' is-selected' : '') +
          (index === state.index ? ' is-focused' : '');
        button.setAttribute('data-choice-index', index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === state.selectedIndex ? 'true' : 'false');
        if (state.choices[index].color) {
          swatch = documentRef.createElement('span');
          swatch.className = 'choice-dialog-swatch';
          swatch.style = swatch.style || {};
          swatch.style.backgroundColor = state.choices[index].color;
          swatch.setAttribute('aria-hidden', 'true');
          label = documentRef.createElement('span');
          label.className = 'choice-dialog-label';
          label.textContent = state.choices[index].label;
          button.appendChild(swatch);
          button.appendChild(label);
        } else {
          button.textContent = state.choices[index].label;
        }
        list.appendChild(button);
      }
      cancel.textContent = values.t ? values.t('common.cancel') : 'Cancel';
      cancel.setAttribute('data-choice-index', state.choices.length);
      cancel.className = state.index === state.choices.length ? 'is-focused' : '';
      dialog.className = state.open ? 'choice-dialog' + (state.variant ? ' is-' + state.variant : '') : 'choice-dialog is-hidden';
      dialog.setAttribute('aria-hidden', state.open ? 'false' : 'true');
      button = state.index === state.choices.length ? cancel : list.children[state.index];
      if (button) { button.focus(); if (button.scrollIntoView) { button.scrollIntoView(false); } }
    }
    function open(title, choices, selectedValue, variant) {
      var index;
      state.open = true;
      state.title = String(title || '');
      state.choices = (choices || []).slice();
      state.variant = String(variant || '');
      state.index = 0;
      state.selectedIndex = -1;
      for (index = 0; index < state.choices.length; index += 1) {
        if (String(state.choices[index].value) === String(selectedValue)) {
          state.index = index;
          state.selectedIndex = index;
          break;
        }
      }
      render();
      return snapshot();
    }
    function close() {
      state.open = false;
      state.variant = '';
      node('choice-dialog').className = 'choice-dialog is-hidden';
      node('choice-dialog').setAttribute('aria-hidden', 'true');
    }
    function move(direction) {
      if (!state.open || !state.choices.length) { return snapshot(); }
      state.index = Math.max(0, Math.min(state.choices.length, state.index + direction));
      render();
      return snapshot();
    }
    function focus(index) {
      if (!state.open || index < 0 || index > state.choices.length) { return snapshot(); }
      state.index = index;
      updateFocus();
      return snapshot();
    }
    function selected() { return state.choices[state.index] || null; }
    return { open: open, close: close, move: move, focus: focus, selected: selected, snapshot: snapshot };
  }
  return { create: create };
}));

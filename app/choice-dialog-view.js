(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffChoiceDialogView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = { open: false, index: 0, title: '', choices: [] };
    function node(id) { return documentRef.getElementById(id); }
    function snapshot() { return { open: state.open, index: state.index, title: state.title, choices: state.choices.slice() }; }
    function render() {
      var list = node('choice-dialog-list');
      var button;
      var swatch;
      var label;
      var index;
      node('choice-dialog-title').textContent = state.title;
      list.innerHTML = '';
      for (index = 0; index < state.choices.length; index += 1) {
        button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'choice-dialog-option' + (index === state.index ? ' is-focused' : '');
        button.setAttribute('data-choice-index', index);
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
      node('choice-dialog').className = state.open ? 'choice-dialog' : 'choice-dialog is-hidden';
      button = list.children[state.index];
      if (button) { button.focus(); button.scrollIntoView(false); }
    }
    function open(title, choices, selectedValue) {
      var index;
      state.open = true;
      state.title = String(title || '');
      state.choices = (choices || []).slice();
      state.index = 0;
      for (index = 0; index < state.choices.length; index += 1) {
        if (String(state.choices[index].value) === String(selectedValue)) { state.index = index; break; }
      }
      render();
      return snapshot();
    }
    function close() {
      state.open = false;
      node('choice-dialog').className = 'choice-dialog is-hidden';
    }
    function move(direction) {
      if (!state.open || !state.choices.length) { return snapshot(); }
      state.index = Math.max(0, Math.min(state.choices.length - 1, state.index + direction));
      render();
      return snapshot();
    }
    function focus(index) {
      if (!state.open || index < 0 || index >= state.choices.length) { return snapshot(); }
      state.index = index;
      render();
      return snapshot();
    }
    function selected() { return state.choices[state.index] || null; }
    return { open: open, close: close, move: move, focus: focus, selected: selected, snapshot: snapshot };
  }
  return { create: create };
}));

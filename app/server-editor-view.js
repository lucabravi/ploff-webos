(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffServerEditorView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var viewState = { open: false, index: 0 };
    function snapshot() { return { open: viewState.open, index: viewState.index }; }
    function open() { viewState.open = true; viewState.index = 0; return snapshot(); }
    function close() { viewState.open = false; viewState.index = 0; return snapshot(); }
    function focus(index, count) {
      var limit = Math.max(0, Number(count) || 0);
      viewState.index = limit ? Math.max(0, Math.min(limit - 1, Number(index) || 0)) : 0;
      return snapshot();
    }
    function row(label, className, index, action) {
      var button = values.element('button', className, label);
      button.type = 'button';
      button.setAttribute('data-server-index', index);
      if (action) { button.setAttribute('data-server-action', action); }
      return button;
    }
    function render(state) {
      var list = values.document.getElementById('server-editor-list');
      var servers = state.servers || [];
      var index;
      var server;
      var button;
      if (!list) { return; }
      list.innerHTML = '';
      button = row(values.t('settings.findServers'), 'server-editor-row' + (state.index === 0 ? ' is-focused' : ''), 0);
      list.appendChild(button);
      button = row(values.t('setup.manualAddress'), 'server-editor-row' + (state.index === 1 ? ' is-focused' : ''), 1, 'manual');
      list.appendChild(button);
      for (index = 0; index < servers.length; index += 1) {
        server = servers[index];
        button = row((state.activeUri === server.uri ? '\u2713 ' : '') + server.name, 'server-editor-row' + (state.index === index + 2 ? ' is-focused' : ''), index + 2);
        values.appendAddresses(button, state.addressesFor(server));
        list.appendChild(button);
      }
      if (!values.isPointerSelectionActive() && state.open && list.children[state.index]) {
        list.children[state.index].focus();
        values.keepFocusVisible(list, list.children[state.index]);
      }
    }
    return { open: open, close: close, focus: focus, snapshot: snapshot, render: render };
  }
  return { create: create };
}));

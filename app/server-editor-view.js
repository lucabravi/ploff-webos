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
    function setFocused(target, focused) {
      var className;
      if (!target) { return; }
      className = (' ' + String(target.className || '') + ' ').replace(/\sis-focused\s/g, ' ').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
      target.className = className + (focused ? (className ? ' ' : '') + 'is-focused' : '');
    }
    function updateFocus() {
      var list = values.document.getElementById('server-editor-list');
      var editor;
      var parentRow;
      var index;
      if (!list) { return snapshot(); }
      editor = list.parentNode;
      parentRow = editor && editor.previousSibling;
      /* The parent setting is replaced by the inline editor while it is
       * open. Keep one logical focus ring: the active server row. */
      setFocused(parentRow, false);
      for (index = 0; index < list.children.length; index += 1) {
        setFocused(list.children[index], index === viewState.index);
      }
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
      var viewState;
      if (!list) { return; }
      if (state && state.index !== undefined) { focus(state.index, servers.length + 2); }
      viewState = snapshot();
      list.innerHTML = '';
      button = row(values.t('settings.findServers'), 'server-editor-row' + (viewState.index === 0 ? ' is-focused' : ''), 0);
      button.disabled = state.resolving === true;
      list.appendChild(button);
      button = row(values.t('setup.manualAddress'), 'server-editor-row' + (viewState.index === 1 ? ' is-focused' : ''), 1, 'manual');
      button.disabled = state.resolving === true;
      list.appendChild(button);
      for (index = 0; index < servers.length; index += 1) {
        server = servers[index];
        var routeLabel = typeof values.serverRouteLabel === 'function' ? values.serverRouteLabel(server) : '';
        var serverLabel = (state.activeUri === server.uri ? '\u2713 ' : '') + server.name;
        if (routeLabel) { serverLabel += ' \u00b7 ' + routeLabel; }
        button = row(serverLabel,
          'server-editor-row' + (viewState.index === index + 2 ? ' is-focused' : '') +
          (state.resolving && viewState.index === index + 2 ? ' is-loading' : ''), index + 2);
        values.appendAddresses(button, state.addressesFor(server));
        if (state.resolving && viewState.index === index + 2) {
          button.appendChild(values.element('span', 'server-editor-loading', state.loadingLabel));
        }
        button.disabled = state.resolving === true;
        list.appendChild(button);
      }
      updateFocus();
      if (!values.isPointerSelectionActive() && viewState.open && list.children[viewState.index]) {
        list.children[viewState.index].focus();
        values.keepFocusVisible(list, list.children[viewState.index]);
      }
    }
    return { open: open, close: close, focus: focus, updateFocus: updateFocus, snapshot: snapshot, render: render };
  }
  return { create: create };
}));

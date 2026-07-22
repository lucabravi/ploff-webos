  function switchServer(server) {
    if (!server || (activeServer && activeServer.uri === server.uri)) { closeServerEditor(); return; }
    applyServer(server);
    serverEditorView.close();
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('content').style.display = 'block';
    document.body.className = document.body.className.indexOf('is-booting') === -1 ? document.body.className + ' is-booting' : document.body.className;
    appView = 'home';
    loadPlex();
  }

  function activateServerEditorRow() {
    var index = serverEditorView.snapshot().index;
    if (index === 0) { discoverLocalServers(); return; }
    if (index === 1) { openManualServerSetup(); return; }
    switchServer(serverState.servers[index - 2]);
  }

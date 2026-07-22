  function closeLanguageEditor() {
    settingsView.closeLanguages();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    renderAppSettings();
  }

  function toggleEditorLanguage() {
    var viewState = settingsView.snapshot();
    var code = orderedEditorLanguages()[viewState.languageIndex];
    var enabled = appSettings[viewState.languageKind];
    var position = enabled.indexOf(code);
    if (position === -1) { enabled.push(code); }
    else { enabled.splice(position, 1); }
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function moveEditorLanguage(direction) {
    var viewState = settingsView.snapshot();
    var code = orderedEditorLanguages()[viewState.languageIndex];
    var enabled = appSettings[viewState.languageKind];
    var position = enabled.indexOf(code);
    var next = position + direction;
    if (position === -1 || next < 0 || next >= enabled.length) { return; }
    enabled.splice(position, 1);
    enabled.splice(next, 0, code);
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function openAppSettings(keepNavigationFocus) {
    appView = 'settings';
    settingsView.open(keepNavigationFocus);
    serverEditorView.close();
    backgroundAudio.stop();
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('diagnostics-view').className = 'diagnostics-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view';
    renderNavigation();
    renderAppSettings();
  }

  function leaveAppSettings() {
    settingsView.close();
    serverEditorView.close();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
  }

  function closeAppSettings() {
    leaveAppSettings();
    revealHome({ focus: 'nav' });
  }

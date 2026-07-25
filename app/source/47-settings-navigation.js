  function closeLanguageEditor() {
    settingsView.closeLanguages();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    renderAppSettings();
  }

  function toggleEditorLanguage() {
    var viewState = settingsView.snapshot();
    if (viewState.languageKind === 'videoVersionPriorities' || editorItemDisabled(orderedEditorLanguages()[viewState.languageIndex])) { return; }
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
    if (position === -1 || next < 0 || next >= enabled.length || editorItemDisabled(code)) { return; }
    while (next >= 0 && next < enabled.length && editorItemDisabled(enabled[next])) { next += direction; }
    if (next < 0 || next >= enabled.length) { return; }
    if (viewState.languageKind === 'videoVersionPriorities') {
      enabled[position] = enabled[next];
      enabled[next] = code;
      saveAppSettings();
      renderLanguageEditor(code);
      return;
    }
    enabled.splice(position, 1);
    enabled.splice(next, 0, code);
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function moveEditorFocus(direction) {
    var viewState = settingsView.snapshot();
    var items = orderedEditorLanguages();
    var next = viewState.languageIndex + direction;
    while (next >= 0 && next < items.length && editorItemDisabled(items[next])) { next += direction; }
    if (next < 0 || next >= items.length) { return; }
    settingsView.focusLanguage(next, items.length);
    renderLanguageEditor();
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
    if (privacyDialogOpen) {
      privacyDialogOpen = false;
      document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
    }
    settingsView.close();
    serverEditorView.close();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
  }

  function closeAppSettings() {
    transitionToHome('nav');
  }

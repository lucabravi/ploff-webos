  // Application settings, server state, profiles, and Plex activities.
  function setText(id, value) {
    var node = document.getElementById(id);
    node.innerHTML = '';
    node.appendChild(document.createTextNode(value || ''));
  }

  function cycleValue(values, current, direction) {
    var index = values.indexOf(current);
    index = index < 0 ? 0 : index;
    index = (index + direction + values.length) % values.length;
    return values[index];
  }

  function videoQualityLabel(value) {
    return value === 'original' ? t('settings.original') : (Number(value) / 1000) + ' Mbps';
  }

  function activeConnectionRoute() {
    var uri = ServerStore.normalizeUri(config.apiBaseUrl);
    var routes = activeServer && activeServer.connectionRoutes || [];
    var index;
    for (index = 0; index < routes.length; index += 1) {
      if (ServerStore.normalizeUri(routes[index].uri) !== uri) { continue; }
      if (routes[index].relay === true) { return 'relay'; }
      if (routes[index].local === true) { return 'lan'; }
      return 'remote';
    }
    if (/^https:\/\/[^/]+\.plex\.direct(?::443)?$/i.test(uri) && (!String(uri).match(/:\d+$/) || /:443$/i.test(uri))) {
      return 'relay';
    }
    return ServerDiscovery.isLocalCandidate(uri) ? 'lan' : 'remote';
  }

  function connectionRouteLabel(route) {
    return t('connection.' + (route || activeConnectionRoute()));
  }

  function activeVideoQuality() {
    return activeConnectionRoute() === 'lan' ? appSettings.lanVideoQuality : appSettings.remoteVideoQuality;
  }

  function activeServerSettingsLabel() {
    var label = activeServer ? activeServer.name : (config.serverName || config.apiBaseUrl || t('settings.notConfigured'));
    return config.apiBaseUrl ? label + ' \u00b7 ' + connectionRouteLabel() : label;
  }

  function networkStatusLabel(snapshot) {
    var status = String((snapshot || networkSnapshot || {}).status || 'unknown');
    return t('network.' + (/^(online|local-only|offline|unknown)$/.test(status) ? status : 'unknown'));
  }

  function networkStatusClass(snapshot) {
    var status = String((snapshot || networkSnapshot || {}).status || 'unknown');
    return 'is-network-' + (/^(online|local-only|offline|unknown)$/.test(status) ? status : 'unknown');
  }

  function playbackPreferenceLabel(value) {
    if (value === 'transcode') { return t('settings.forceTranscode'); }
    if (value === 'direct') { return t('settings.directOnly'); }
    return t('settings.auto');
  }

  function accentColorLabel(value) {
    var normalized = String(value || 'cyan');
    return t('settings.color' + normalized.charAt(0).toUpperCase() + normalized.slice(1));
  }

  function applyAccentColor() {
    var value = accentColorValues[appSettings.accentColor] || accentColorValues.cyan;
    document.documentElement.style.setProperty('--accent', value);
  }

  function applyAnimationPreference() {
    var className = document.body.className.replace(/\s*animations-disabled/g, '');
    document.body.className = className + (appSettings.interfaceAnimations ? '' : ' animations-disabled');
  }

  function interfaceAnimationDuration(milliseconds) {
    return appSettings.interfaceAnimations ? milliseconds : 0;
  }

  var settingsCatalog = SettingsCatalog.create({
    t: t,
    languageName: function (language, code) { return I18n.languageName(language, code); },
    nativeLanguageName: I18n.nativeLanguageName,
    activeServerLabel: activeServerSettingsLabel,
    activeProfileTitle: activeProfileTitle,
    networkStatusLabel: networkStatusLabel,
    plexConnected: function () { return !!authState.ownerToken; },
    videoQualityLabel: videoQualityLabel,
    playbackPreferenceLabel: playbackPreferenceLabel,
    accentColorLabel: accentColorLabel,
    supportedUiLanguages: Settings.supportedUiLanguages,
    cardScales: CardLayout.SCALES,
    accentColors: Settings.ACCENT_COLORS,
    accentValues: accentColorValues
  });

  var settingsView = SettingsView.create({
    document: document,
    element: element,
    setText: setText,
    t: t,
    accentColors: Settings.ACCENT_COLORS,
    accentValues: accentColorValues,
    renderServerEditor: renderServerEditor,
    clearFocus: clearLogicalFocus,
    navTarget: function (navIndex) { return document.querySelector(selectorForNavIndex(navIndex)); },
    keepFocusVisible: keepPanelFocusVisible,
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  function settingsRows() { return settingsCatalog.rows(appSettings); }

  function settingsSectionLabel(section) { return settingsCatalog.sectionLabel(section); }

  function saveAppSettings() {
    appSettings = Settings.save(root.localStorage, appSettings);
    document.documentElement.lang = appSettings.uiLanguage;
    applyCardScale();
    applyAccentColor();
    applyAnimationPreference();
    translateStaticUi();
  }

  function keepPanelFocusVisible(container, target) {
    var top;
    var bottom;
    if (!container || !target) { return; }
    top = target.offsetTop;
    bottom = top + target.offsetHeight;
    if (top < container.scrollTop) { container.scrollTop = top; }
    else if (bottom > container.scrollTop + container.clientHeight) { container.scrollTop = bottom - container.clientHeight; }
  }

  function renderAppSettings() {
    var viewState = settingsView.snapshot();
    var serverViewState = serverEditorView.snapshot();
    if (viewState.zone === 'list') {
      settingsView.focusList(viewState.index, settingsRows());
      viewState = settingsView.snapshot();
    }
    settingsView.render({
      title: t('settings.title'), notice: t('settings.globalNotice'), rows: settingsRows(),
      sectionLabel: settingsSectionLabel, zone: viewState.zone, index: viewState.index,
      navIndex: state.navIndex, serverEditorOpen: serverViewState.open,
      serverDiscoveryActive: serverDiscoveryActive, accentColor: appSettings.accentColor,
      credit: t('settings.createdBy', { name: 'Rhapsodos93' })
    });
  }

  function updateSettingsFocus() {
    var viewState = settingsView.snapshot();
    settingsView.focus({ zone: viewState.zone, index: viewState.index, navIndex: state.navIndex });
  }

  function appendPrivacyParagraph(container, key) {
    container.appendChild(element('p', '', t(key)));
  }

  function openPrivacyPolicy() {
    var content = document.getElementById('privacy-dialog-content');
    privacyDialogOpen = true;
    setText('privacy-dialog-title', t('settings.privacyPolicy'));
    content.innerHTML = '';
    content.scrollTop = 0;
    appendPrivacyParagraph(content, 'privacy.summary');
    appendPrivacyParagraph(content, 'privacy.storage');
    appendPrivacyParagraph(content, 'privacy.transmission');
    appendPrivacyParagraph(content, 'privacy.controls');
    appendPrivacyParagraph(content, 'privacy.contact');
    setText('privacy-dialog-close', t('state.back'));
    document.getElementById('privacy-dialog').className = 'privacy-dialog';
    document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close is-focused';
    if (!pointerSelectionActive) { document.getElementById('privacy-dialog-close').focus(); }
  }

  function closePrivacyPolicy() {
    privacyDialogOpen = false;
    document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
    document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close';
    updateSettingsFocus();
  }

  function scrollPrivacyPolicy(direction) {
    var content = document.getElementById('privacy-dialog-content');
    content.scrollTop += direction * 120;
  }

  function reloadApplication() {
    if (root.location && typeof root.location.reload === 'function') { root.location.reload(); }
  }

  function reloadAfterCredentialWrite() {
    if (root.PloffCredentialVault) {
      root.PloffCredentialVault.whenIdle(reloadApplication);
      return;
    }
    reloadApplication();
  }

  function disconnectPlexAccount() {
    authState = AuthStore.save(credentialStorage, AuthStore.disconnect(authState));
    reloadAfterCredentialWrite();
  }

  function deleteAllLocalData() {
    if (LocalData) { LocalData.clear(root.localStorage); }
    if (credentialStorage && credentialStorage.removeItem) { credentialStorage.removeItem(AuthStore.STORAGE_KEY); }
    reloadAfterCredentialWrite();
  }

  function activateSettingsAction(row) {
    if (row.key === 'diagnostics') { openDiagnostics(); return true; }
    if (row.key === 'privacy') { openPrivacyPolicy(); return true; }
    if (row.key === 'disconnectPlex') {
      if (!authState.ownerToken) {
        openChoiceDialog(t('setup.disconnectPlex'), [{ value: 'cancel', label: t('settings.notConnected') }], 'cancel', null, function () { updateSettingsFocus(); });
        return true;
      }
      openChoiceDialog(t('settings.disconnectConfirm'), [
        { value: 'cancel', label: t('common.cancel') },
        { value: 'disconnect', label: t('setup.disconnectPlex') }
      ], 'cancel', function (choice) {
        if (choice.value === 'disconnect') { disconnectPlexAccount(); }
      }, function () { updateSettingsFocus(); });
      return true;
    }
    if (row.key === 'deleteLocalData') {
      openChoiceDialog(t('settings.deleteLocalDataConfirm'), [
        { value: 'cancel', label: t('common.cancel') },
        { value: 'delete', label: t('settings.deleteLocalData') }
      ], 'cancel', function (choice) {
        if (choice.value === 'delete') { deleteAllLocalData(); }
      }, function () { updateSettingsFocus(); });
      return true;
    }
    return false;
  }

  function afterSettingChange(row) {
    saveAppSettings();
    if (row.key === 'cardScale') {
      if (appView === 'home') { renderRows(); updateFocus(); }
      else if (appView === 'search') { renderSearchResults(); updateSearchFocus(); }
      else if (appView === 'library') { renderLibraryGrid(); updateLibraryFocus(); }
      else if (appView === 'watchlist') { renderWatchlistGrid(); updateWatchlistFocus(); }
    }
    if (row.key === 'showWatchlist' || row.key === 'showPlaylists') { applyNavigationVisibility(); }
    renderNavigation();
    renderAppSettings();
  }

  function applySettingValue(row, value) {
    appSettings[row.key] = value;
    if (row.key === 'uiLanguage') { appSettings.uiLanguageExplicit = true; homeDomDirty = true; }
    if (row.key === 'subtitleMode') { appSettings.subtitleModeExplicit = true; }
    afterSettingChange(row);
  }

  function changeSetting(direction) {
    var row = settingsRows()[settingsView.snapshot().index];
    if (row.action) { activateSettingsAction(row); return; }
    if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
    if (row.serverEditor) { openServerEditor(); return; }
    if (row.profileEditor) { openProfileManager(); return; }
    if (row.choices && row.choices.length) {
      applySettingValue(row, cycleValue(row.choices.map(function (choice) { return choice.value; }), appSettings[row.key], direction));
    }
  }

  function openAppSettingChoice() {
    var row = settingsRows()[settingsView.snapshot().index];
    if (row.action) { activateSettingsAction(row); return; }
    if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
    if (row.serverEditor) { openServerEditor(); return; }
    if (row.profileEditor) { openProfileManager(); return; }
    if (!row.choices || !row.choices.length) { return; }
    openChoiceDialog(row.label, row.choices, appSettings[row.key], function (choice) {
      applySettingValue(row, choice.value);
    }, function () { updateSettingsFocus(); });
  }

  function selectAccentColor(color) {
    if (Settings.ACCENT_COLORS.indexOf(color) === -1) { return; }
    appSettings.accentColor = color;
    saveAppSettings();
    renderNavigation();
    renderAppSettings();
  }

  function orderedEditorLanguages() {
    var enabled = appSettings[settingsView.snapshot().languageKind] || [];
    if (settingsView.snapshot().languageKind === 'videoVersionPriorities') { return enabled.slice(); }
    return enabled.concat(languageCatalog.filter(function (code) { return enabled.indexOf(code) === -1; }));
  }

  function editorItemDisabled(code) {
    return settingsView.snapshot().languageKind === 'videoVersionPriorities' &&
      !VersionSelection.isPrioritySupported(code, playbackCapabilities);
  }

  function renderLanguageEditor(selectedCode) {
    var viewState = settingsView.snapshot();
    var languages = orderedEditorLanguages();
    var enabled = appSettings[viewState.languageKind];
    var index;
    var rank;
    var rendered = [];
    if (selectedCode) {
      settingsView.focusLanguage(Math.max(0, languages.indexOf(selectedCode)), languages.length);
      viewState = settingsView.snapshot();
    }
    for (index = 0; index < languages.length; index += 1) {
      rank = enabled.indexOf(languages[index]);
      rendered.push({
        code: languages[index],
        label: viewState.languageKind === 'videoVersionPriorities'
          ? t('settings.versionPriority.' + languages[index])
          : I18n.languageName(appSettings.uiLanguage, languages[index]),
        rank: rank === -1 ? 0 : rank + 1,
        disabled: editorItemDisabled(languages[index])
      });
    }
    if (rendered[viewState.languageIndex] && rendered[viewState.languageIndex].disabled) {
      for (index = 0; index < rendered.length; index += 1) {
        if (!rendered[index].disabled) {
          settingsView.focusLanguage(index, rendered.length);
          viewState = settingsView.snapshot();
          break;
        }
      }
    }
    settingsView.renderLanguages({
      title: settingsRows()[viewState.index].label,
      hint: t(viewState.languageKind === 'videoVersionPriorities' ? 'settings.priorityEditorHint' : 'settings.languageEditorHint'),
      index: viewState.languageIndex, languages: rendered
    });
  }

  function openLanguageEditor(kind) {
    settingsView.openLanguages(kind);
    document.getElementById('language-editor').className = 'language-editor';
    renderLanguageEditor();
  }

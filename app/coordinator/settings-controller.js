(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSettingsController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var presentation = values.presentation || {};
    var shell = values.shell || {};
    var server = values.server || {};
    var account = values.account || {};
    var dialogs = values.dialogs || {};
    var environment = values.environment || {};
    var root = platform.root || {};
    var document = platform.document;
    var settings = shell.getSettings ? shell.getSettings() : (values.settings || {});
    var catalogSnapshot = null;
    var destroyed = false;
    var privacyOpen = false;
    var updateOpen = false;
    var updateFocus = 0;
    var t = presentation.t || function (key) { return key; };
    var accentValues = environment.accentColorValues || {};
    var languageCatalog = environment.languageCatalog || [];
    var settingsCatalog;
    var view;
    var upNextLayout;
    var safeAreaDialog;
    var subtitleStyleDialog;
    var textInputDialog;
    var safeAreaOriginal = null;
    var playbackCompatibilityOpen = false;
    var playbackCompatibilityFocus = 0;
    var choicePreviewGeneration = 0;

    function noop() {}
    function handled(value) { return { handled: value !== false }; }
    function call(callback, _arg1, _arg2, _arg3, _arg4, _arg5, _arg6, _arg7, _arg8) {
      if (typeof callback === 'function') {
        return callback.apply(null, Array.prototype.slice.call(arguments, 1));
      }
      return undefined;
    }
    function currentConfig() { return call(server.config) || {}; }
    function currentServer() { return call(server.active) || null; }
    function currentNetwork() { return call(environment.networkSnapshot) || {}; }
    function currentCapabilities() { return call(environment.playbackCapabilities) || {}; }
    function playbackCompatibilitySnapshot() {
      return call(environment.playbackCompatibility) || { formatRuleCount: 0, fileExceptionCount: 0, fileExceptionTtlDays: 30 };
    }
    function navigationIndex() { return Number(call(shell.navigationIndex) || 0); }
    function pointerActive() { return call(presentation.pointerActive) === true; }
    function releaseSnapshot() { return call(environment.releaseStatusSnapshot) || {}; }
    function updateStatusLabel() {
      var release = releaseSnapshot();
      var status = String(release.status || 'unknown');
      if (status === 'available' && release.latestVersion) { return t('updates.status.available', { version: release.latestVersion }); }
      return t('updates.status.' + (/^(checking|current|offline|error)$/.test(status) ? status : 'unknown'));
    }
    function updateRowStatusLabel() {
      var release = releaseSnapshot();
      if (release.status === 'available' && release.latestVersion) { return updateStatusLabel(); }
      if (release.status === 'checking') { return t('updates.status.checking'); }
      return '';
    }
    function updateTimeLabel(value) {
      var timestamp = Number(value || 0);
      if (!timestamp) { return t('updates.never'); }
      try { return new Date(timestamp).toLocaleString(settings.uiLanguage || 'en'); }
      catch (_error) { return new Date(timestamp).toISOString(); }
    }
    function setText(id, value) {
      if (presentation.setText) { presentation.setText(id, value); return; }
      if (!document || !document.getElementById) { return; }
      document.getElementById(id).textContent = value || '';
    }
    function element(tag, className, text) {
      return presentation.element ? presentation.element(tag, className, text) : null;
    }

    function cycleValue(items, current, direction) {
      var index = items.indexOf(current);
      index = index < 0 ? 0 : index;
      index = (index + direction + items.length) % items.length;
      return items[index];
    }

    function videoQualityLabel(value) {
      return value === 'original' ? t('settings.original') : (Number(value) / 1000) + ' Mbps';
    }

    function activeConnectionRoute() {
      var config = currentConfig();
      var activeServer = currentServer();
      var normalize = modules.ServerStore && modules.ServerStore.normalizeUri || function (uri) { return String(uri || ''); };
      var uri = normalize(config.apiBaseUrl);
      var routes = activeServer && activeServer.connectionRoutes || [];
      var index;
      for (index = 0; index < routes.length; index += 1) {
        if (normalize(routes[index].uri) !== uri) { continue; }
        if (routes[index].relay === true) { return 'relay'; }
        if (routes[index].local === true) { return 'lan'; }
        return 'remote';
      }
      if (/^https:\/\/[^/]+\.plex\.direct(?::443)?$/i.test(uri) && (!String(uri).match(/:\d+$/) || /:443$/i.test(uri))) {
        return 'relay';
      }
      return modules.ServerDiscovery && modules.ServerDiscovery.isLocalCandidate(uri) ? 'lan' : 'remote';
    }

    function connectionRouteLabel(route) {
      return t('connection.' + (route || activeConnectionRoute()));
    }

    function activeVideoQuality() {
      return activeConnectionRoute() === 'lan' ? settings.lanVideoQuality : settings.remoteVideoQuality;
    }

    function activeServerSettingsLabel() {
      var config = currentConfig();
      var activeServer = currentServer();
      var label = activeServer ? activeServer.name : (config.serverName || config.apiBaseUrl || t('settings.notConfigured'));
      return config.apiBaseUrl ? label + ' \u00b7 ' + connectionRouteLabel() : label;
    }

    function networkStatusLabel(snapshot) {
      var status = String((snapshot || currentNetwork()).status || 'unknown');
      return t('network.' + (/^(online|local-only|offline|unknown)$/.test(status) ? status : 'unknown'));
    }

    function networkStatusClass(snapshot) {
      var status = String((snapshot || currentNetwork()).status || 'unknown');
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

    function visualThemeLabel(value) {
      var definition = modules.Settings.visualThemeDefinition(value);
      return t(definition.labelKey);
    }

    function applyAccentColor() {
      var color = accentValues[settings.accentColor] || accentValues.cyan;
      if (document && document.documentElement && document.documentElement.style && document.documentElement.style.setProperty) {
        document.documentElement.style.setProperty('--accent', color);
      }
    }

    function applyAnimationPreference() {
      var body;
      var className;
      if (!document || !document.body) { return; }
      body = document.body;
      className = String(body.className || '').replace(/\s*animations-disabled/g, '');
      body.className = className + (settings.interfaceAnimations ? '' : ' animations-disabled');
    }

    function applyVisualTheme() {
      var body;
      var definition;
      var themeClasses;
      var classNames;
      var nextClasses = [];
      var index;
      if (!document || !document.body) { return; }
      body = document.body;
      definition = modules.Settings.visualThemeDefinition(settings.visualTheme);
      themeClasses = modules.Settings.visualThemeClassNames();
      classNames = String(body.className || '').split(/\s+/);
      for (index = 0; index < classNames.length; index += 1) {
        if (classNames[index] && themeClasses.indexOf(classNames[index]) === -1) { nextClasses.push(classNames[index]); }
      }
      nextClasses.push(definition.className);
      body.className = nextClasses.join(' ');
    }

    function applyAccessibilityPreferences() {
      var rootElement = document && document.documentElement;
      var body = document && document.body;
      var backgroundOpacity = { off: 0, low: 0.28, medium: 0.52, high: 0.74, opaque: 0.94 };
      var edgeShadow = {
        shadow: '0 2px 5px #000, 0 0 3px #000',
        outline: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
        both: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px #000'
      };
      var className;
      if (rootElement && rootElement.style && rootElement.style.setProperty) {
        rootElement.style.setProperty('--safe-top', Number(settings.safeAreaTop || 0) + '%');
        rootElement.style.setProperty('--safe-right', Number(settings.safeAreaRight || 0) + '%');
        rootElement.style.setProperty('--safe-bottom', Number(settings.safeAreaBottom || 0) + '%');
        rootElement.style.setProperty('--safe-left', Number(settings.safeAreaLeft || 0) + '%');
        rootElement.style.setProperty('--subtitle-position', Number(settings.subtitlePosition || 7) + '%');
        rootElement.style.setProperty('--subtitle-background', 'rgba(0,0,0,' + String(backgroundOpacity[settings.subtitleBackground] === undefined ? 0 : backgroundOpacity[settings.subtitleBackground]) + ')');
        rootElement.style.setProperty('--subtitle-shadow', edgeShadow[settings.subtitleEdge] || edgeShadow.shadow);
        rootElement.style.setProperty('--focus-shadow', settings.strongFocus ? '0 0 0 8px var(--focus-color)' : '0 0 0 5px var(--focus-color)');
        rootElement.style.setProperty('--focus-shadow-inset', settings.strongFocus ? 'inset 0 0 0 8px var(--focus-color)' : 'inset 0 0 0 5px var(--focus-color)');
      }
      if (!body) { return; }
      className = String(body.className || '').replace(/\s*(?:high-contrast|strong-focus)/g, '');
      if (settings.highContrast) { className += ' high-contrast'; }
      if (settings.strongFocus) { className += ' strong-focus'; }
      body.className = className;
    }

    function interfaceAnimationDuration(milliseconds) {
      return settings.interfaceAnimations ? milliseconds : 0;
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

    settingsCatalog = modules.SettingsCatalog.create({
      t: t,
      languageName: function (language, code) { return modules.I18n.languageName(language, code); },
      nativeLanguageName: modules.I18n.nativeLanguageName,
      activeServerLabel: activeServerSettingsLabel,
      activeProfileTitle: account.activeProfileTitle || function () { return ''; },
      networkStatusLabel: networkStatusLabel,
      plexConnected: account.connected || function () { return false; },
      videoQualityLabel: videoQualityLabel,
      playbackPreferenceLabel: playbackPreferenceLabel,
      accentColorLabel: accentColorLabel,
      visualThemeLabel: visualThemeLabel,
      supportedUiLanguages: modules.Settings.supportedUiLanguages,
      accentValues: accentValues,
      appVersion: String(environment.appVersion || releaseSnapshot().installedVersion || ''),
      updateStatusLabel: updateRowStatusLabel
    });

    view = modules.SettingsView.create({
      document: document,
      element: element,
      setText: setText,
      t: t,
      accentValues: accentValues,
      renderServerEditor: server.renderEditor || noop,
      clearFocus: presentation.clearFocus || noop,
      navTarget: shell.navigationTarget || function () { return null; },
      keepFocusVisible: keepPanelFocusVisible,
      isPointerSelectionActive: pointerActive
    });

    upNextLayout = modules.UpNextLayoutDialog.create();
    safeAreaDialog = modules.SafeAreaDialog.create({
      document: document,
      t: t,
      insets: modules.Settings.SAFE_AREA_INSETS,
      pointerActive: pointerActive,
      clearFocus: presentation.clearFocus || noop
    });
    subtitleStyleDialog = modules.SubtitleStyleDialog.create({
      document: document,
      t: t,
      backgrounds: modules.Settings.SUBTITLE_BACKGROUNDS,
      positions: modules.Settings.SUBTITLE_POSITIONS,
      edges: modules.Settings.SUBTITLE_EDGES,
      defaults: { subtitleBackground: 'off', subtitlePosition: 7, subtitleEdge: 'shadow' },
      pointerActive: pointerActive,
      clearFocus: presentation.clearFocus || noop
    });
    textInputDialog = modules.TextInputDialog && modules.TextInputDialog.create ? modules.TextInputDialog.create({
      root: root,
      document: document,
      t9Enabled: function () { return settings.searchT9Input === true; }
    }) : null;

    function currentCatalog() {
      if (!catalogSnapshot && typeof settingsCatalog.snapshot === 'function') {
        catalogSnapshot = settingsCatalog.snapshot(settings);
      }
      return catalogSnapshot;
    }

    function invalidateCatalog() {
      catalogSnapshot = null;
    }

    function categories() {
      var catalog = currentCatalog();
      if (catalog) { return catalog.categories || []; }
      return typeof settingsCatalog.categories === 'function' ? settingsCatalog.categories(settings) : [];
    }
    function versionRow() {
      var catalog = currentCatalog();
      if (catalog) { return catalog.versionRow || null; }
      return typeof settingsCatalog.versionRow === 'function' ? settingsCatalog.versionRow(settings) : null;
    }
    function categoryRootRows() {
      var result = categories().map(function (category) {
        return { key: 'category:' + category.id, categoryId: category.id, category: true, label: category.label, value: '\u203a' };
      });
      var version = versionRow();
      if (version) { result.push(version); }
      return result;
    }
    function rows() {
      var viewState = view && view.snapshot ? view.snapshot() : { level: 'categories' };
      var catalog = currentCatalog();
      var list;
      var index;
      if (catalog) {
        if (viewState.level !== 'category') { return categoryRootRows(); }
        list = catalog.categories || [];
        for (index = 0; index < list.length; index += 1) {
          if (list[index].id === viewState.categoryId) { return list[index].rows; }
        }
        return [];
      }
      if (!categories().length) { return settingsCatalog.rows(settings); }
      if (viewState.level !== 'category') { return categoryRootRows(); }
      list = categories();
      for (index = 0; index < list.length; index += 1) {
        if (list[index].id === viewState.categoryId) { return list[index].rows; }
      }
      return [];
    }
    function sectionLabel(section) { return settingsCatalog.sectionLabel(section); }

    function publishSettings() {
      call(shell.setSettings, settings);
      return settings;
    }

    function save() {
      settings = modules.Settings.save(root.localStorage, settings);
      invalidateCatalog();
      publishSettings();
      if (document && document.documentElement) { document.documentElement.lang = settings.uiLanguage; }
      call(shell.applyCardScale);
      applyAccentColor();
      applyVisualTheme();
      applyAnimationPreference();
      applyAccessibilityPreferences();
      call(shell.translateStaticUi);
      return settings;
    }

    function setSetupLanguage(language, explicit) {
      var next = String(language || '');
      if (!next) { return settings; }
      settings.uiLanguage = next;
      if (explicit === true) { settings.uiLanguageExplicit = true; }
      else if (explicit === false && settings.uiLanguageExplicit !== true) { settings.uiLanguageExplicit = false; }
      call(shell.markHomeDirty);
      return save();
    }

    function render() {
      var viewState = view.snapshot();
      var serverState = call(server.editorSnapshot) || { open: false };
      invalidateCatalog();
      if (viewState.zone === 'list') {
        view.focusList(viewState.index, rows());
        viewState = view.snapshot();
      }
      view.render({
        title: viewState.level === 'category' ? sectionLabel(viewState.categoryId) : t('settings.title'),
        notice: t('settings.globalNotice'), rows: rows(), level: viewState.level,
        sectionLabel: sectionLabel, zone: viewState.zone, index: viewState.index,
        navIndex: navigationIndex(), serverEditorOpen: serverState.open,
        serverDiscoveryActive: call(server.discoveryActive) === true,
        accentColor: settings.accentColor,
        credit: t('settings.createdBy', { name: 'Rhapsodos93' })
      });
    }

    function focus() {
      var viewState = view.snapshot();
      view.focus({ zone: viewState.zone, index: viewState.index, navIndex: navigationIndex() });
    }

    function appendPrivacyParagraph(container, key) {
      var paragraph = element('p', '', t(key));
      if (paragraph) { container.appendChild(paragraph); }
    }

    function openPrivacyPolicy() {
      var content = document.getElementById('privacy-dialog-content');
      privacyOpen = true;
      setText('privacy-dialog-title', t('settings.privacyPolicy'));
      content.innerHTML = '';
      content.scrollTop = 0;
      appendPrivacyParagraph(content, 'privacy.summary');
      appendPrivacyParagraph(content, 'privacy.storage');
      appendPrivacyParagraph(content, 'privacy.transmission');
      appendPrivacyParagraph(content, 'privacy.controls');
      appendPrivacyParagraph(content, 'privacy.contact');
      setText('privacy-dialog-close', t('common.close'));
      document.getElementById('privacy-dialog').className = 'privacy-dialog';
      document.getElementById('privacy-dialog').setAttribute('aria-hidden', 'false');
      document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close is-focused';
      if (!pointerActive()) { document.getElementById('privacy-dialog-close').focus(); }
    }

    function closePrivacyPolicy() {
      privacyOpen = false;
      document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
      document.getElementById('privacy-dialog').setAttribute('aria-hidden', 'true');
      document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close';
      focus();
    }

    function scrollPrivacyPolicy(direction) {
      document.getElementById('privacy-dialog-content').scrollTop += direction * 120;
    }

    function updateDialogButtons() {
      var buttons = document.querySelectorAll ? document.querySelectorAll('[data-update-index]') : [];
      var index;
      updateFocus = Math.max(0, Math.min(Math.max(0, buttons.length - 1), updateFocus));
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = (index === 0 ? 'is-primary' : '') + (index === updateFocus ? ' is-focused' : '');
      }
      if (!pointerActive() && buttons[updateFocus] && buttons[updateFocus].focus) { buttons[updateFocus].focus(); }
    }

    function renderUpdateDialog() {
      var release = releaseSnapshot();
      if (!updateOpen) { return; }
      setText('update-dialog-title', t('updates.title'));
      setText('update-installed-label', t('updates.installed'));
      setText('update-installed-value', String(release.installedVersion || environment.appVersion || ''));
      setText('update-latest-label', t('updates.latest'));
      setText('update-latest-value', release.latestVersion || t('updates.unknownVersion'));
      setText('update-last-check-label', t('updates.lastCheck'));
      setText('update-last-check-value', updateTimeLabel(release.checkedAt));
      setText('update-status', updateStatusLabel());
      setText('update-release-hint', t('updates.releaseHint'));
      setText('update-check', t(release.status === 'checking' ? 'updates.status.checking' : 'updates.checkNow'));
      setText('update-close', t('common.close'));
      updateDialogButtons();
    }

    function openUpdateDialog() {
      updateOpen = true;
      updateFocus = 0;
      document.getElementById('update-dialog').className = 'update-dialog';
      document.getElementById('update-dialog').setAttribute('aria-hidden', 'false');
      renderUpdateDialog();
    }

    function closeUpdateDialog() {
      updateOpen = false;
      document.getElementById('update-dialog').className = 'update-dialog is-hidden';
      document.getElementById('update-dialog').setAttribute('aria-hidden', 'true');
      focus();
    }

    function focusUpdate(index) {
      if (!updateOpen) { return false; }
      updateFocus = Math.max(0, Math.min(1, Number(index) || 0));
      updateDialogButtons();
      return true;
    }

    function activateUpdate() {
      var release = releaseSnapshot();
      if (updateFocus === 1) { closeUpdateDialog(); return; }
      if (release.status !== 'checking') { call(environment.checkForUpdates, true); }
      renderUpdateDialog();
    }

    function handleUpdateKey(event, direction) {
      if (!updateOpen) { return handled(false); }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event.keyCode === 27 || event.keyCode === 461) { closeUpdateDialog(); }
      else if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') {
        focusUpdate(updateFocus === 0 ? 1 : 0);
      } else if (event.keyCode === 13) { activateUpdate(); }
      return handled(true);
    }

    function playbackCompatibilityButtons() {
      return document && document.querySelectorAll ? document.querySelectorAll('[data-playback-compatibility-index]') : [];
    }

    function renderPlaybackCompatibility() {
      var state;
      var buttons;
      var index;
      if (!playbackCompatibilityOpen) { return; }
      state = playbackCompatibilitySnapshot();
      buttons = playbackCompatibilityButtons();
      setText('playback-compatibility-title', t('settings.playbackCompatibilityTitle'));
      setText('playback-compatibility-notice', t('settings.playbackCompatibilityNotice'));
      setText('playback-compatibility-status', String(Number(state.formatRuleCount || 0)) + ' / ' + String(Number(state.fileExceptionCount || 0)));
      setText('playback-compatibility-enabled-label', t('settings.playbackCompatibilityEnabled'));
      setText('playback-compatibility-enabled-value', t(settings.adaptivePlaybackMemory ? 'settings.enabled' : 'settings.disabled'));
      setText('playback-compatibility-formats-label', t('settings.playbackCompatibilityFormats'));
      setText('playback-compatibility-formats-value', String(Number(state.formatRuleCount || 0)));
      setText('playback-compatibility-files-label', t('settings.playbackCompatibilityFiles'));
      setText('playback-compatibility-files-value', String(Number(state.fileExceptionCount || 0)) + ' · ' + String(Number(state.fileExceptionTtlDays || 30)) + 'd');
      setText('playback-compatibility-reset-label', t('settings.playbackCompatibilityReset'));
      setText('playback-compatibility-reset-value', t('settings.playbackCompatibilityClear'));
      setText('playback-compatibility-close', t('common.close'));
      playbackCompatibilityFocus = Math.max(0, Math.min(Math.max(0, buttons.length - 1), playbackCompatibilityFocus));
      for (index = 0; index < buttons.length; index += 1) {
        buttons[index].className = 'playback-compatibility-option' + (index === playbackCompatibilityFocus ? ' is-focused' : '');
      }
      if (!pointerActive() && buttons[playbackCompatibilityFocus] && buttons[playbackCompatibilityFocus].focus) { buttons[playbackCompatibilityFocus].focus(); }
    }

    function focusPlaybackCompatibility(index) {
      var buttons;
      if (!playbackCompatibilityOpen) { return false; }
      buttons = playbackCompatibilityButtons();
      playbackCompatibilityFocus = Math.max(0, Math.min(Math.max(0, buttons.length - 1), Number(index) || 0));
      renderPlaybackCompatibility();
      return true;
    }

    function closePlaybackCompatibility() {
      var dialog;
      var buttons;
      var index;
      if (!playbackCompatibilityOpen) { return false; }
      playbackCompatibilityOpen = false;
      dialog = document && document.getElementById ? document.getElementById('playback-compatibility-dialog') : null;
      if (dialog) {
        dialog.className = 'playback-compatibility-dialog is-hidden';
        dialog.setAttribute('aria-hidden', 'true');
      }
      buttons = playbackCompatibilityButtons();
      for (index = 0; index < buttons.length; index += 1) { buttons[index].className = 'playback-compatibility-option'; }
      focus();
      return true;
    }

    function clearPlaybackCompatibility(kind) {
      var callback;
      var title;
      var clear;
      if (kind === 'formats') {
        title = t('settings.playbackCompatibilityClearFormatsConfirm');
        clear = environment.clearPlaybackCompatibilityFormats;
      } else if (kind === 'files') {
        title = t('settings.playbackCompatibilityClearFilesConfirm');
        clear = environment.clearPlaybackCompatibilityFiles;
      } else {
        title = t('settings.playbackCompatibilityResetConfirm');
        clear = environment.clearPlaybackCompatibility;
      }
      callback = function (choice) {
        if (choice && choice.value === 'confirm') { call(clear); }
        renderPlaybackCompatibility();
      };
      call(dialogs.openChoice, title, [
        { value: 'cancel', label: t('common.cancel') },
        { value: 'confirm', label: t('settings.playbackCompatibilityClear') }
      ], 'cancel', callback, function () { renderPlaybackCompatibility(); });
    }

    function activatePlaybackCompatibility() {
      if (playbackCompatibilityFocus === 0) {
        settings.adaptivePlaybackMemory = !settings.adaptivePlaybackMemory;
        save();
        renderPlaybackCompatibility();
      } else if (playbackCompatibilityFocus === 1) {
        clearPlaybackCompatibility('formats');
      } else if (playbackCompatibilityFocus === 2) {
        clearPlaybackCompatibility('files');
      } else if (playbackCompatibilityFocus === 3) {
        clearPlaybackCompatibility('all');
      } else {
        closePlaybackCompatibility();
      }
    }

    function openPlaybackCompatibility() {
      var dialog;
      if (!document || !document.getElementById) { return false; }
      playbackCompatibilityOpen = true;
      playbackCompatibilityFocus = 0;
      dialog = document.getElementById('playback-compatibility-dialog');
      if (dialog) {
        dialog.className = 'playback-compatibility-dialog';
        dialog.setAttribute('aria-hidden', 'false');
      }
      renderPlaybackCompatibility();
      return true;
    }

    function handlePlaybackCompatibilityKey(event, direction) {
      if (!playbackCompatibilityOpen) { return handled(false); }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event.keyCode === 27 || event.keyCode === 461) { closePlaybackCompatibility(); }
      else if (event.keyCode === 38 || direction === 'up') { focusPlaybackCompatibility(playbackCompatibilityFocus - 1); }
      else if (event.keyCode === 40 || direction === 'down') { focusPlaybackCompatibility(playbackCompatibilityFocus + 1); }
      else if (event.keyCode === 37 || event.keyCode === 39 || direction === 'left' || direction === 'right') {
        if (playbackCompatibilityFocus === 0) { activatePlaybackCompatibility(); }
      } else if (event.keyCode === 13) { activatePlaybackCompatibility(); }
      return handled(true);
    }

    function safeAreaValues() {
      return {
        safeAreaTop: Number(settings.safeAreaTop || 0),
        safeAreaRight: Number(settings.safeAreaRight || 0),
        safeAreaBottom: Number(settings.safeAreaBottom || 0),
        safeAreaLeft: Number(settings.safeAreaLeft || 0)
      };
    }

    function applySafeAreaDraft(next) {
      var draft = next || {};
      settings.safeAreaTop = Number(draft.safeAreaTop || 0);
      settings.safeAreaRight = Number(draft.safeAreaRight || 0);
      settings.safeAreaBottom = Number(draft.safeAreaBottom || 0);
      settings.safeAreaLeft = Number(draft.safeAreaLeft || 0);
      applyAccessibilityPreferences();
    }

    function restoreSafeAreaOriginal() {
      if (safeAreaOriginal) { applySafeAreaDraft(safeAreaOriginal); }
      safeAreaOriginal = null;
    }

    function openSafeAreaCalibration() {
      safeAreaOriginal = safeAreaValues();
      safeAreaDialog.open(safeAreaOriginal, {
        change: applySafeAreaDraft,
        apply: function (next) {
          applySafeAreaDraft(next);
          safeAreaOriginal = null;
          afterChange({ key: 'safeAreaCalibration' });
        },
        cancel: function () {
          restoreSafeAreaOriginal();
          render();
          focus();
        }
      });
      return true;
    }

    function handleSafeAreaKey(event, direction) {
      if (!safeAreaDialog || !safeAreaDialog.snapshot().open) { return handled(false); }
      return handled(safeAreaDialog.handleKey(event, direction));
    }

    function subtitleStyleValues() {
      return {
        subtitleBackground: settings.subtitleBackground,
        subtitlePosition: settings.subtitlePosition,
        subtitleEdge: settings.subtitleEdge
      };
    }

    function openSubtitleStyleEditor() {
      subtitleStyleDialog.open(subtitleStyleValues(), {
        apply: function (next) {
          settings.subtitleBackground = next.subtitleBackground;
          settings.subtitlePosition = next.subtitlePosition;
          settings.subtitleEdge = next.subtitleEdge;
          afterChange({ key: 'subtitleAppearance' });
          applyAccessibilityPreferences();
        },
        cancel: function () { render(); focus(); }
      });
      return true;
    }

    function handleSubtitleStyleKey(event, direction) {
      if (!subtitleStyleDialog || !subtitleStyleDialog.snapshot().open) { return handled(false); }
      return handled(subtitleStyleDialog.handleKey(event, direction));
    }

    function backupSizeLabel(status) {
      var used = Math.max(0, Number(status && status.encodedBytes || 0));
      var limit = Math.max(1, Number(status && status.limitBytes || 12 * 1024));
      return (used / 1024).toFixed(1) + ' KB / ' + (limit / 1024).toFixed(0) + ' KB';
    }

    function showBackupResult(error, successKey) {
      call(shell.showMessage, t(error ? 'settings.backup.error' : successKey));
      render();
      focus();
    }

    function suggestedDeviceName() {
      var capabilities = currentCapabilities();
      return String(capabilities.modelName || capabilities.model || t('settings.backup.defaultDeviceName'));
    }

    function requestDeviceName(backup, callback) {
      if (!textInputDialog) { callback(new Error('Device name editor is unavailable')); return; }
      textInputDialog.open({
        title: t('settings.backup.deviceNameTitle'), hint: t('settings.backup.deviceNameHint'),
        value: suggestedDeviceName(), placeholder: t('settings.backup.deviceNamePlaceholder'),
        cancelLabel: t('common.cancel'), applyLabel: t('common.apply'), maximum: 80,
        apply: function (name) { backup.registerDevice(name, callback); },
        cancel: function () { render(); focus(); }
      });
    }

    function normalizedModel(value) {
      return String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    }

    function currentDeviceModel() {
      var capabilities = currentCapabilities();
      return normalizedModel(capabilities.modelName || capabilities.model);
    }

    function modelsKnownAndDifferent(profile) {
      var current = currentDeviceModel();
      var saved = normalizedModel(profile && profile.model);
      return !!current && !!saved && current !== saved;
    }

    function profileLabel(profile) {
      var detail = profile && profile.model && profile.model !== profile.name ? ' · ' + profile.model : '';
      return String(profile && profile.name || t('settings.backup.defaultDeviceName')) + detail;
    }

    function applyLoadedSettings(backup, error, loaded, callback) {
      if (!error && loaded && loaded.settings) {
        settings = loaded.settings;
        save();
        call(shell.markHomeDirty);
        call(shell.applyNavigationVisibility);
        call(shell.renderNavigation);
        if (settings.settingsBackupMode !== 'off') { backup.scheduleAutoSave(); }
      }
      call(callback, error || null, loaded || null, false);
    }

    function loadAsOtherDevice(backup, status, profile, callback) {
      var current = status && status.currentProfile;
      if (!textInputDialog) { call(callback, new Error('Device name editor is unavailable'), null, false); return; }
      textInputDialog.open({
        title: t('settings.backup.deviceNameTitle'), hint: t('settings.backup.loadOtherDeviceHint'),
        value: current && current.name ? current.name : suggestedDeviceName(),
        placeholder: t('settings.backup.deviceNamePlaceholder'),
        cancelLabel: t('common.cancel'), applyLabel: t('common.apply'), maximum: 80,
        apply: function (name) {
          backup.load(profile.id, { sameDevice: false, deviceName: name }, function (error, _nextStatus, loaded) {
            applyLoadedSettings(backup, error, loaded, callback);
          });
        },
        cancel: function () { call(callback, null, null, true); }
      });
    }

    function loadSelectedProfile(backup, status, profile, callback) {
      var current = status && status.currentProfile;
      if (current && current.id === profile.id) {
        backup.load(profile.id, { sameDevice: true }, function (error, _nextStatus, loaded) {
          applyLoadedSettings(backup, error, loaded, callback);
        });
        return;
      }
      if (modelsKnownAndDifferent(profile)) {
        loadAsOtherDevice(backup, status, profile, callback);
        return;
      }
      call(dialogs.openChoice, t('settings.backup.sameDeviceTitle'), [
        { value: 'same', label: t('settings.backup.sameDevice') },
        { value: 'other', label: t('settings.backup.otherDevice') }
      ], 'same', function (choice) {
        if (choice && choice.value === 'same') {
          backup.load(profile.id, { sameDevice: true }, function (error, _nextStatus, loaded) {
            applyLoadedSettings(backup, error, loaded, callback);
          });
        } else if (choice && choice.value === 'other') {
          loadAsOtherDevice(backup, status, profile, callback);
        }
      }, null, '', null, function (applied) {
        if (!applied) { call(callback, null, null, true); }
      });
    }

    function chooseSavedProfile(backup, status, callback) {
      var profiles = status && status.profiles || [];
      var choices;
      if (!profiles.length) { call(callback, new Error('No Ploff settings save was found'), null, false); return; }
      if (profiles.length === 1) { loadSelectedProfile(backup, status, profiles[0], callback); return; }
      choices = profiles.map(function (profile) { return { value: profile.id, label: profileLabel(profile) }; });
      call(dialogs.openChoice, t('settings.backup.chooseSave'), choices, choices[0].value, function (choice) {
        var selected = profiles.filter(function (profile) { return profile.id === String(choice && choice.value || ''); })[0];
        if (selected) { loadSelectedProfile(backup, status, selected, callback); }
      }, null, '', null, function (applied) {
        if (!applied) { call(callback, null, null, true); }
      });
    }

    function promptSettingsLoad(status, options, callback) {
      var backup = environment.settingsBackup;
      var values = options || {};
      var done = false;
      function complete(error, loaded, skipped) {
        if (done) { return; }
        done = true;
        call(callback, error || null, loaded || null, skipped === true);
      }
      function choose() { chooseSavedProfile(backup, status, complete); }
      if (!backup || !status || !status.exists) { complete(new Error('No Ploff settings save was found'), null, false); return false; }
      if (values.confirmFirst !== true) { choose(); return true; }
      call(dialogs.openChoice, t('settings.backup.loadPrompt'), [
        { value: 'skip', label: t('settings.backup.notNow') },
        { value: 'load', label: t('settings.backup.load') }
      ], 'skip', function (choice) {
        if (choice && choice.value === 'load') { choose(); }
        else { complete(null, null, true); }
      }, null, '', null, function (applied) {
        if (!applied) { complete(null, null, true); }
      });
      return true;
    }

    function saveBackup(backup) {
      backup.status(function (statusError, status) {
        if (statusError) { showBackupResult(statusError, 'settings.backup.saved'); return; }
        if (status && status.needsDeviceName) {
          requestDeviceName(backup, function (registerError) { showBackupResult(registerError, 'settings.backup.saved'); });
          return;
        }
        backup.save(function (error) { showBackupResult(error, 'settings.backup.saved'); });
      });
    }

    function restoreBackup(backup) {
      backup.status(function (statusError, status) {
        if (statusError || !status || !status.exists) { showBackupResult(statusError || new Error('not found'), 'settings.backup.loaded'); return; }
        promptSettingsLoad(status, { confirmFirst: false }, function (error, _loaded, skipped) {
          if (skipped) { render(); focus(); return; }
          showBackupResult(error, 'settings.backup.loaded');
        });
      });
    }

    function performBackupAction(choice) {
      var backup = environment.settingsBackup;
      if (!choice || !backup) { return; }
      if (choice.value === 'save') {
        saveBackup(backup);
      } else if (choice.value === 'restore') {
        restoreBackup(backup);
      } else if (choice.value === 'mode') {
        call(dialogs.openChoice, t('settings.backup.modeTitle'), [
          { value: 'off', label: t('settings.backup.mode.off') + ' · ' + t('settings.backup.modeOffHint') },
          { value: 'on', label: t('settings.backup.mode.on') + ' · ' + t('settings.backup.modeOnHint') }
        ], settings.settingsBackupMode, function (modeChoice) {
          var mode = String(modeChoice && modeChoice.value || 'off');
          function applyMode(error) {
            if (!error) {
              settings.settingsBackupMode = mode;
              save();
              if (mode !== 'off') { backup.scheduleAutoSave(); }
            }
            showBackupResult(error, 'settings.backup.modeChanged');
          }
          if (mode === 'off') { applyMode(null); return; }
          backup.status(function (statusError, status) {
            if (statusError) { applyMode(statusError); }
            else if (status && status.needsDeviceName) { requestDeviceName(backup, applyMode); }
            else { applyMode(null); }
          });
        }, focus);
      } else if (choice.value === 'delete') {
        call(dialogs.openChoice, t('settings.backup.deleteConfirm'), [
          { value: 'cancel', label: t('common.cancel') },
          { value: 'delete', label: t('settings.backup.delete') }
        ], 'cancel', function (confirmation) {
          if (confirmation && confirmation.value === 'delete') {
            backup.remove(function (error) { showBackupResult(error, 'settings.backup.deleted'); });
          }
        }, focus);
      } else { openSettingsBackup(); }
    }

    function openSettingsBackup() {
      var backup = environment.settingsBackup;
      if (!backup) { showBackupResult(new Error('unavailable')); return false; }
      backup.status(function (error, status) {
        var exists = !error && status && status.exists;
        var settingsStatus = !error && status && status.settingsMatch === true ? 'matched' : 'unmatched';
        call(dialogs.openChoice, t('settings.backup.title'), [
          { value: 'save', label: t('settings.backup.save'), status: settingsStatus },
          { value: 'restore', label: t('settings.backup.load') + (exists ? '' : ' · ' + t('settings.backup.notFound')) },
          { value: 'mode', label: t('settings.backup.autosave') + ': ' + t('settings.backup.mode.' + settings.settingsBackupMode) },
          { value: 'delete', label: t('settings.backup.delete') },
          { value: 'space', label: t('settings.backup.space') + ': ' + backupSizeLabel(status) }
        ], 'save', performBackupAction, focus);
      });
      return true;
    }

    function activateAction(row) {
      if (row.key === 'settingsBackup') { openSettingsBackup(); return true; }
      if (row.key === 'appVersion') { openUpdateDialog(); return true; }
      if (row.key === 'diagnostics') { call(dialogs.openDiagnostics); return true; }
      if (row.key === 'privacy') { openPrivacyPolicy(); return true; }
      if (row.key === 'playbackCompatibility') { openPlaybackCompatibility(); return true; }
      if (row.key === 'safeAreaCalibration') { openSafeAreaCalibration(); return true; }
      if (row.key === 'subtitleAppearance') { openSubtitleStyleEditor(); return true; }
      if (row.key === 'disconnectPlex') {
        if (!call(account.connected)) {
          call(dialogs.openChoice, t('setup.disconnectPlex'), [{ value: 'cancel', label: t('settings.notConnected') }], 'cancel', null, focus);
          return true;
        }
        call(dialogs.openChoice, t('settings.disconnectConfirm'), [
          { value: 'cancel', label: t('common.cancel') },
          { value: 'disconnect', label: t('setup.disconnectPlex') }
        ], 'cancel', function (choice) {
          if (choice.value === 'disconnect') { call(account.disconnect); }
        }, focus);
        return true;
      }
      if (row.key === 'deleteLocalData') {
        call(dialogs.openChoice, t('settings.deleteLocalDataConfirm'), [
          { value: 'cancel', label: t('common.cancel') },
          { value: 'delete', label: t('settings.deleteLocalData') }
        ], 'cancel', function (choice) {
          if (choice.value === 'delete') { call(account.deleteLocalData); }
        }, focus);
        return true;
      }
      return false;
    }

    function afterChange(row) {
      save();
      if (environment.settingsBackup) { environment.settingsBackup.scheduleAutoSave(); }
      if (row.key === 'cardScale') { call(shell.refreshCardsForCurrentView); }
      if (row.key === 'artworkQuality') {
        call(shell.markHomeDirty);
        call(shell.refreshCardsForCurrentView);
      }
      if (row.key === 'backdropQuality') { call(shell.clearBackdrop); }
      if (row.key === 'visualTheme') { call(shell.refreshCardsForCurrentView); }
      if (row.key === 'showWatchlist' || row.key === 'showPlaylists') { call(shell.applyNavigationVisibility); }
      call(shell.renderNavigation);
      render();
    }

    function applyValue(row, value) {
      settings[row.key] = value;
      if (row.key === 'uiLanguage') {
        settings.uiLanguageExplicit = true;
        call(shell.markHomeDirty);
      }
      if (row.key === 'subtitleMode') { settings.subtitleModeExplicit = true; }
      afterChange(row);
    }

    function openLanguageEditor(kind) {
      view.openLanguages(kind);
      document.getElementById('language-editor').className = 'language-editor';
      document.getElementById('language-editor').setAttribute('aria-hidden', 'false');
      renderLanguageEditor();
    }

    function changeSetting(direction) {
      var row = rows()[view.snapshot().index];
      if (!row) { return; }
      if (row.category) { return; }
      if (row.action) { activateAction(row); return; }
      if (row.upNextLayoutEditor) { openUpNextLayoutEditor(); return; }
      if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
      if (row.serverEditor) { call(server.openEditor); return; }
      if (row.profileEditor) { call(dialogs.openProfileManager); return; }
      if (row.choices && row.choices.length) {
        applyValue(row, cycleValue(row.choices.map(function (choice) { return choice.value; }), settings[row.key], direction));
      }
    }

    function openSettingChoice(index) {
      var currentIndex = index === undefined ? view.snapshot().index : Math.max(0, Number(index) || 0);
      var row = rows()[currentIndex];
      var generation;
      function open(previewOptions) {
        call(dialogs.openChoice, row.label, row.choices, settings[row.key], function (choice) {
          applyValue(row, choice.value);
        }, focus, row.choiceVariant || '', previewOptions || { cardScale: settings.cardScale });
      }
      if (!row) { return; }
      if (row.category) {
        view.openCategory(row.categoryId, currentIndex);
        render();
        return;
      }
      if (row.action) { activateAction(row); return; }
      if (row.upNextLayoutEditor) { openUpNextLayoutEditor(); return; }
      if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
      if (row.serverEditor) { call(server.openEditor); return; }
      if (row.profileEditor) { call(dialogs.openProfileManager); return; }
      if (!row.choices || !row.choices.length) { return; }
      if (row.choiceVariant === 'backdrop-quality' && typeof shell.loadBackdropPreview === 'function') {
        generation = choicePreviewGeneration += 1;
        shell.loadBackdropPreview(function (_error, source) {
          if (destroyed || generation !== choicePreviewGeneration) { return; }
          open({ cardScale: settings.cardScale, backdropUrl: source || '' });
        });
        return;
      }
      choicePreviewGeneration += 1;
      open({ cardScale: settings.cardScale });
    }

    function renderUpNextLayoutEditor() {
      var state = upNextLayout.snapshot();
      var optionNodes = document.querySelectorAll('[data-up-next-layout]');
      var index;
      setText('up-next-layout-title', t('settings.upNextLayout'));
      setText('up-next-layout-compact-label', t('settings.upNextLayout.compact'));
      setText('up-next-layout-bottom-label', t('settings.upNextLayout.bottomPanel'));
      setText('up-next-preview-compact-heading', t('player.next'));
      setText('up-next-preview-bottom-heading', t('player.upNextIn', { seconds: 10 }));
      setText('up-next-preview-bottom-episode', 'S1 E5 · ' + t('player.next'));
      setText('up-next-layout-cancel', t('player.cancel'));
      setText('up-next-layout-apply', t('player.subtitleApply'));
      document.getElementById('up-next-layout-dialog').className = state.open ? 'up-next-layout-dialog' : 'up-next-layout-dialog is-hidden';
      document.getElementById('up-next-layout-dialog').setAttribute('aria-hidden', state.open ? 'false' : 'true');
      for (index = 0; index < optionNodes.length; index += 1) {
        optionNodes[index].className = 'up-next-layout-option' +
          (optionNodes[index].getAttribute('data-up-next-layout') === state.selected ? ' is-selected' : '') +
          (index === state.focus ? ' is-focused' : '');
      }
      document.getElementById('up-next-layout-cancel').className = state.focus === 2 ? 'is-focused' : '';
      document.getElementById('up-next-layout-apply').className = state.focus === 3 ? 'is-focused' : '';
    }

    function openUpNextLayoutEditor() {
      upNextLayout.open(settings.upNextLayout);
      renderUpNextLayoutEditor();
    }

    function closeUpNextLayoutEditor(apply) {
      if (apply) {
        settings.upNextLayout = upNextLayout.confirm();
        save();
        render();
      }
      upNextLayout.close();
      renderUpNextLayoutEditor();
      focus();
    }

    function selectAccentColor(color) {
      if (modules.Settings.ACCENT_COLORS.indexOf(color) === -1) { return; }
      settings.accentColor = color;
      save();
      call(shell.renderNavigation);
      render();
    }

    function orderedEditorLanguages() {
      var kind = view.snapshot().languageKind;
      var enabled = settings[kind] || [];
      if (kind === 'videoVersionPriorities') { return enabled.slice(); }
      return enabled.concat(languageCatalog.filter(function (code) { return enabled.indexOf(code) === -1; }));
    }

    function editorItemDisabled(code) {
      return view.snapshot().languageKind === 'videoVersionPriorities' &&
        !modules.VersionSelection.isPrioritySupported(code, currentCapabilities());
    }

    function renderLanguageEditor(selectedCode) {
      var viewState = view.snapshot();
      var languages = orderedEditorLanguages();
      var enabled = settings[viewState.languageKind] || [];
      var index;
      var rank;
      var rendered = [];
      if (selectedCode) {
        view.focusLanguage(Math.max(0, languages.indexOf(selectedCode)), languages.length);
        viewState = view.snapshot();
      }
      for (index = 0; index < languages.length; index += 1) {
        rank = enabled.indexOf(languages[index]);
        rendered.push({
          code: languages[index],
          label: viewState.languageKind === 'videoVersionPriorities'
            ? t('settings.versionPriority.' + languages[index])
            : modules.I18n.languageName(settings.uiLanguage, languages[index]),
          languageCode: viewState.languageKind === 'videoVersionPriorities' ? '' : languages[index],
          rank: rank === -1 ? 0 : rank + 1,
          disabled: editorItemDisabled(languages[index])
        });
      }
      if (rendered[viewState.languageIndex] && rendered[viewState.languageIndex].disabled) {
        for (index = 0; index < rendered.length; index += 1) {
          if (!rendered[index].disabled) {
            view.focusLanguage(index, rendered.length);
            viewState = view.snapshot();
            break;
          }
        }
      }
      view.renderLanguages({
        title: rows()[viewState.index].label,
        hint: t(viewState.languageKind === 'videoVersionPriorities' ? 'settings.priorityEditorHint' : 'settings.languageEditorHint'),
        backLabel: t('common.back'),
        index: viewState.languageIndex,
        languages: rendered
      });
    }

    function closeLanguageEditor() {
      view.closeLanguages();
      document.getElementById('language-editor').className = 'language-editor is-hidden';
      document.getElementById('language-editor').setAttribute('aria-hidden', 'true');
      render();
    }

    function toggleEditorLanguage() {
      var viewState = view.snapshot();
      var ordered = orderedEditorLanguages();
      var code = ordered[viewState.languageIndex];
      var enabled = settings[viewState.languageKind];
      var position;
      if (viewState.languageIndex >= ordered.length) { closeLanguageEditor(); return; }
      if (viewState.languageKind === 'videoVersionPriorities' || editorItemDisabled(code)) { return; }
      position = enabled.indexOf(code);
      if (position === -1) { enabled.push(code); }
      else { enabled.splice(position, 1); }
      save();
      renderLanguageEditor(code);
    }

    function moveEditorLanguage(direction) {
      var viewState = view.snapshot();
      var code = orderedEditorLanguages()[viewState.languageIndex];
      var enabled = settings[viewState.languageKind];
      var position = enabled.indexOf(code);
      var next = position + direction;
      if (viewState.languageIndex >= orderedEditorLanguages().length || position === -1 || next < 0 || next >= enabled.length || editorItemDisabled(code)) { return; }
      while (next >= 0 && next < enabled.length && editorItemDisabled(enabled[next])) { next += direction; }
      if (next < 0 || next >= enabled.length) { return; }
      if (viewState.languageKind === 'videoVersionPriorities') {
        enabled[position] = enabled[next];
        enabled[next] = code;
      } else {
        enabled.splice(position, 1);
        enabled.splice(next, 0, code);
      }
      save();
      renderLanguageEditor(code);
    }

    function moveEditorFocus(direction) {
      var viewState = view.snapshot();
      var items = orderedEditorLanguages();
      var count = items.length + 1;
      var next = viewState.languageIndex + direction;
      while (next >= 0 && next < items.length && editorItemDisabled(items[next])) { next += direction; }
      if (next < 0 || next >= count) { return; }
      view.focusLanguage(next, count);
      renderLanguageEditor();
    }

    function enter(options) {
      var enterOptions = options || {};
      if (destroyed) { return snapshot(); }
      call(shell.enterSettings);
      view.open(enterOptions.keepNavigationFocus === true);
      call(server.closeEditor);
      call(shell.stopBackgroundAudio);
      call(shell.renderNavigation);
      render();
      return snapshot();
    }

    function leave() {
      if (safeAreaDialog && safeAreaDialog.snapshot().open) {
        safeAreaDialog.dismiss();
        restoreSafeAreaOriginal();
      }
      if (subtitleStyleDialog && subtitleStyleDialog.snapshot().open) { subtitleStyleDialog.close(false); }
      if (updateOpen) {
        updateOpen = false;
        document.getElementById('update-dialog').className = 'update-dialog is-hidden';
        document.getElementById('update-dialog').setAttribute('aria-hidden', 'true');
      }
      if (privacyOpen) {
        privacyOpen = false;
        document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
        document.getElementById('privacy-dialog').setAttribute('aria-hidden', 'true');
      }
      if (playbackCompatibilityOpen) { closePlaybackCompatibility(); }
      view.close();
      call(server.closeEditor);
      document.getElementById('language-editor').className = 'language-editor is-hidden';
      document.getElementById('language-editor').setAttribute('aria-hidden', 'true');
      call(shell.leaveSettings);
      return snapshot();
    }

    function close() { call(shell.transitionHome, 'nav'); }

    function handleKey(event, direction) {
      var state;
      var editorState;
      var nextIndex;
      if (destroyed) { return handled(false); }
      if (safeAreaDialog && safeAreaDialog.snapshot().open) { return handleSafeAreaKey(event, direction); }
      if (subtitleStyleDialog && subtitleStyleDialog.snapshot().open) { return handleSubtitleStyleKey(event, direction); }
      if (playbackCompatibilityOpen) { return handlePlaybackCompatibilityKey(event, direction); }
      if (updateOpen) { return handleUpdateKey(event, direction); }
      state = view.snapshot();
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event.keyCode === 27 || event.keyCode === 461) {
        editorState = call(server.editorSnapshot) || { open: false };
        if (editorState.open) { call(server.closeEditor); }
        else if (state.languageKind) { closeLanguageEditor(); }
        else if (state.level === 'category') {
          call(server.closeEditor);
          view.closeCategory();
          render();
        } else if (state.zone !== 'nav') {
          view.focusNavigation();
          call(shell.renderNavigation);
          focus();
        } else { close(); }
        return handled(true);
      }
      if (state.zone === 'nav') {
        if (direction === 'left' || direction === 'right') {
          nextIndex = Math.max(0, Math.min(Number(call(shell.navigationCount) || 1) - 1,
            navigationIndex() + (direction === 'left' ? -1 : 1)));
          call(shell.setNavigationIndex, nextIndex);
          call(shell.renderNavigation);
          focus();
          call(shell.scheduleNavigationPreview, nextIndex);
        } else if (direction === 'down') {
          view.focusList(state.index, rows());
          render();
        } else if (event.keyCode === 13) {
          call(shell.activateNavigation);
        }
        return handled(true);
      }
      editorState = call(server.editorSnapshot) || { open: false, index: 0 };
      if (editorState.open) {
        if (event.keyCode === 38 && editorState.index === 0) { call(server.closeEditor); }
        else if (event.keyCode === 38) { call(server.focusEditor, editorState.index - 1); call(server.renderEditor); }
        else if (event.keyCode === 40) { call(server.focusEditor, editorState.index + 1); call(server.renderEditor); }
        else if (event.keyCode === 13) { call(server.activateEditor); }
        return handled(true);
      }
      if (state.languageKind) {
        if (event.keyCode === 38) { moveEditorFocus(-1); }
        else if (event.keyCode === 40) { moveEditorFocus(1); }
        else if (event.keyCode === 37) { moveEditorLanguage(-1); }
        else if (event.keyCode === 39) { moveEditorLanguage(1); }
        else if (event.keyCode === 13) { toggleEditorLanguage(); }
        return handled(true);
      }
      if (event.keyCode === 38 && state.index === 0) {
        view.focusNavigation();
        call(shell.renderNavigation);
        focus();
      } else if (event.keyCode === 38) {
        view.focusList(state.index - 1, rows(), -1); render();
      } else if (event.keyCode === 40) {
        view.focusList(state.index + 1, rows(), 1); render();
      } else if (event.keyCode === 37) { changeSetting(-1); }
      else if (event.keyCode === 39) { changeSetting(1); }
      else if (event.keyCode === 13) { openSettingChoice(); }
      return handled(true);
    }

    function handleUpNextKey(event) {
      var state;
      if (destroyed || !upNextLayout.snapshot().open) { return handled(false); }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event.keyCode === 37) { upNextLayout.moveHorizontal(-1); renderUpNextLayoutEditor(); }
      else if (event.keyCode === 39) { upNextLayout.moveHorizontal(1); renderUpNextLayoutEditor(); }
      else if (event.keyCode === 38) { upNextLayout.moveVertical(-1); renderUpNextLayoutEditor(); }
      else if (event.keyCode === 40) { upNextLayout.moveVertical(1); renderUpNextLayoutEditor(); }
      else if (event.keyCode === 13) {
        state = upNextLayout.snapshot();
        if (state.focus < 2) { upNextLayout.choose(state.focus === 0 ? 'compact' : 'bottom-panel'); renderUpNextLayoutEditor(); }
        else if (state.focus === 2) { closeUpNextLayoutEditor(false); }
        else { closeUpNextLayoutEditor(true); }
      } else if (event.keyCode === 27 || event.keyCode === 461) { closeUpNextLayoutEditor(false); }
      return handled(true);
    }

    function handlePrivacyKey(event) {
      if (destroyed || !privacyOpen) { return handled(false); }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event.keyCode === 38) { scrollPrivacyPolicy(-1); }
      else if (event.keyCode === 40) { scrollPrivacyPolicy(1); }
      else if (event.keyCode === 13 || event.keyCode === 27 || event.keyCode === 461) { closePrivacyPolicy(); }
      return handled(true);
    }

    function snapshot() {
      var state = view.snapshot();
      return {
        open: state.open,
        zone: state.zone,
        level: state.level,
        categoryIndex: state.categoryIndex,
        categoryId: state.categoryId,
        index: state.index,
        languageKind: state.languageKind,
        languageIndex: state.languageIndex,
        privacyOpen: privacyOpen,
        updateOpen: updateOpen,
        updateFocus: updateFocus,
        compatibilityOpen: playbackCompatibilityOpen,
        compatibilityFocus: playbackCompatibilityFocus,
        safeAreaOpen: safeAreaDialog && safeAreaDialog.snapshot().open === true,
        safeArea: safeAreaDialog ? safeAreaDialog.snapshot() : { open: false, focus: 0, values: safeAreaValues() },
        subtitleStyleOpen: subtitleStyleDialog && subtitleStyleDialog.snapshot().open === true,
        subtitleStyle: subtitleStyleDialog ? subtitleStyleDialog.snapshot() : { open: false, focus: 0, values: subtitleStyleValues() },
        textInputOpen: textInputDialog && textInputDialog.snapshot().open === true,
        upNext: upNextLayout.snapshot(),
        settings: settings
      };
    }

    function refresh() {
      render();
      if (updateOpen) { renderUpdateDialog(); }
      if (playbackCompatibilityOpen) { renderPlaybackCompatibility(); }
      if (safeAreaDialog && safeAreaDialog.snapshot().open) { safeAreaDialog.render(); }
      if (subtitleStyleDialog && subtitleStyleDialog.snapshot().open) { subtitleStyleDialog.render(); }
      return snapshot();
    }
    function focusNavigation() { view.focusNavigation(); return snapshot(); }
    function focusList(index, rowsOrCount, direction) { view.focusList(index, rowsOrCount || rows(), direction); return snapshot(); }
    function focusLanguage(index, count, updateOnly) {
      view.focusLanguage(index, count);
      if (updateOnly && view.updateLanguageFocus) { view.updateLanguageFocus(); }
      return snapshot();
    }
    function chooseUpNext(value) { upNextLayout.choose(value); return snapshot(); }
    function moveUpNextHorizontal(direction) { upNextLayout.moveHorizontal(direction); return snapshot(); }
    function moveUpNextVertical(direction) { upNextLayout.moveVertical(direction); return snapshot(); }

    function destroy() {
      var node;
      if (destroyed) { return; }
      choicePreviewGeneration += 1;
      privacyOpen = false;
      updateOpen = false;
      playbackCompatibilityOpen = false;
      upNextLayout.close();
      if (safeAreaDialog) { safeAreaDialog.destroy(); }
      if (subtitleStyleDialog) { subtitleStyleDialog.destroy(); }
      if (textInputDialog) { textInputDialog.destroy(); }
      safeAreaOriginal = null;
      call(server.closeEditor);
      view.close();
      if (document && document.getElementById) {
        node = document.getElementById('update-dialog');
        if (node) { node.className = 'update-dialog is-hidden'; node.setAttribute('aria-hidden', 'true'); }
        node = document.getElementById('privacy-dialog');
        if (node) { node.className = 'privacy-dialog is-hidden'; node.setAttribute('aria-hidden', 'true'); }
        node = document.getElementById('privacy-dialog-close');
        if (node) { node.className = 'privacy-dialog-close'; }
        node = document.getElementById('language-editor');
        if (node) { node.className = 'language-editor is-hidden'; node.setAttribute('aria-hidden', 'true'); }
        node = document.getElementById('up-next-layout-dialog');
        if (node) { node.className = 'up-next-layout-dialog is-hidden'; node.setAttribute('aria-hidden', 'true'); }
        node = document.getElementById('playback-compatibility-dialog');
        if (node) { node.className = 'playback-compatibility-dialog is-hidden'; node.setAttribute('aria-hidden', 'true'); }
      }
      destroyed = true;
    }

    return {
      enter: enter,
      leave: leave,
      refresh: refresh,
      handleKey: handleKey,
      snapshot: snapshot,
      destroy: destroy,
      close: close,
      rows: rows,
      sectionLabel: sectionLabel,
      save: save,
      promptSettingsLoad: promptSettingsLoad,
      setSetupLanguage: setSetupLanguage,
      render: render,
      focus: focus,
      focusNavigation: focusNavigation,
      focusList: focusList,
      focusLanguage: focusLanguage,
      focusUpdate: focusUpdate,
      openLanguages: openLanguageEditor,
      closeLanguages: closeLanguageEditor,
      toggleLanguage: toggleEditorLanguage,
      moveLanguage: moveEditorLanguage,
      moveLanguageFocus: moveEditorFocus,
      orderedLanguages: orderedEditorLanguages,
      languageDisabled: editorItemDisabled,
      renderLanguages: renderLanguageEditor,
      changeSetting: changeSetting,
      openSettingChoice: openSettingChoice,
      selectAccentColor: selectAccentColor,
      openPrivacy: openPrivacyPolicy,
      closePrivacy: closePrivacyPolicy,
      scrollPrivacy: scrollPrivacyPolicy,
      openUpNext: openUpNextLayoutEditor,
      closeUpNext: closeUpNextLayoutEditor,
      renderUpNext: renderUpNextLayoutEditor,
      chooseUpNext: chooseUpNext,
      moveUpNextHorizontal: moveUpNextHorizontal,
      moveUpNextVertical: moveUpNextVertical,
      handleUpNextKey: handleUpNextKey,
      handlePrivacyKey: handlePrivacyKey,
      openPlaybackCompatibility: openPlaybackCompatibility,
      closePlaybackCompatibility: closePlaybackCompatibility,
      focusPlaybackCompatibility: focusPlaybackCompatibility,
      handlePlaybackCompatibilityKey: handlePlaybackCompatibilityKey,
      handleSafeAreaKey: handleSafeAreaKey,
      handleSubtitleStyleKey: handleSubtitleStyleKey,
      handleTextInputKey: function (event, direction) { return textInputDialog && textInputDialog.handleKey(event, direction); },
      focusTextInput: function (index) { return textInputDialog && textInputDialog.focus(index); },
      focusSafeArea: function (index) { return safeAreaDialog && safeAreaDialog.focusAction(index); },
      focusSubtitleStyle: function (index) { return subtitleStyleDialog && subtitleStyleDialog.focusAction(index); },
      videoQualityLabel: videoQualityLabel,
      activeConnectionRoute: activeConnectionRoute,
      connectionRouteLabel: connectionRouteLabel,
      activeVideoQuality: activeVideoQuality,
      networkStatusLabel: networkStatusLabel,
      networkStatusClass: networkStatusClass,
      playbackPreferenceLabel: playbackPreferenceLabel,
      accentColorLabel: accentColorLabel,
      applyAccentColor: applyAccentColor,
      applyVisualTheme: applyVisualTheme,
      applyAccessibilityPreferences: applyAccessibilityPreferences,
      applyAnimationPreference: applyAnimationPreference,
      interfaceAnimationDuration: interfaceAnimationDuration,
      keepFocusVisible: keepPanelFocusVisible
    };
  }

  return { create: create };
}));

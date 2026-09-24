(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryTabsEditor = factory(); }
}(this, function () {
  'use strict';

  var DEFAULT_ICONS = ['movie', 'tv', 'anime', 'documentary', 'kids', 'music', 'folder', 'star'];

  function create(options) {
    var values = options || {};
    var document = values.document || null;
    var element = values.element || null;
    var t = values.t || function (key) { return key; };
    var sources = values.librarySources || {};
    var dialogs = values.dialogs || {};
    var pointerActive = values.pointerActive || function () { return false; };
    var iconChoices = values.icons || DEFAULT_ICONS;
    var state = { open: false, index: 0, mode: 'customize', nestedOrder: false, reorderMotion: null };
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function preferenceState() {
      return call(sources.preferenceState) || { displayMode: 'text', home: { icon: 'home' }, serverAliases: [], items: [] };
    }
    function liveSources() { return call(sources.sources) || []; }
    function knownServers() { return call(sources.servers) || []; }

    function preferenceMap() {
      var result = {};
      (preferenceState().items || []).forEach(function (item) {
        if (item && item.sourceId) { result[String(item.sourceId)] = item; }
      });
      return result;
    }

    function aliasMap() {
      var result = {};
      (preferenceState().serverAliases || []).forEach(function (entry) {
        if (entry && entry.serverMachineIdentifier) { result[String(entry.serverMachineIdentifier)] = String(entry.alias || ''); }
      });
      return result;
    }

    function sourceMap() {
      var result = {};
      liveSources().forEach(function (source) { if (source && source.id) { result[String(source.id)] = source; } });
      return result;
    }

    function serverLabel(source, aliases) {
      var machineIdentifier = String(source && source.serverMachineIdentifier || '');
      return String(aliases[machineIdentifier] || source && source.serverName || 'Plex');
    }

    function libraryLabel(source, preference) {
      return String(preference && preference.alias || source && source.sectionTitle || source && source.defaultTitle || '');
    }

    function customizeRows() {
      var preferences = preferenceMap();
      var aliases = aliasMap();
      var result = [];
      var grouped = {};
      var order = [];
      liveSources().forEach(function (source) {
        var machineIdentifier;
        if (!source || !source.id) { return; }
        machineIdentifier = String(source.serverMachineIdentifier || '');
        if (!grouped[machineIdentifier]) { grouped[machineIdentifier] = []; order.push(machineIdentifier); }
        grouped[machineIdentifier].push(source);
      });
      knownServers().forEach(function (server) {
        var machineIdentifier = String(server && server.machineIdentifier || '');
        if (!machineIdentifier || grouped[machineIdentifier]) { return; }
        grouped[machineIdentifier] = [{
          serverMachineIdentifier: machineIdentifier,
          serverName: String(server.name || 'Plex'),
          owned: server.owned !== false,
          offline: true
        }];
        order.push(machineIdentifier);
      });
      order.forEach(function (machineIdentifier, groupIndex) {
        var group = grouped[machineIdentifier] || [];
        var first = group[0] || {};
        var shared = first.owned === false;
        var serverEnabled = typeof sources.serverEnabled === 'function' ? sources.serverEnabled(machineIdentifier) !== false : true;
        if (machineIdentifier) {
          result.push({
            id: machineIdentifier,
            kind: 'server',
            title: serverLabel(first, aliases),
            originalTitle: String(first.serverName || 'Plex'),
            shared: shared,
            offline: first.offline === true,
            aliasEditable: true,
            enabled: serverEnabled,
            spacerBefore: groupIndex > 0,
            serverMachineIdentifier: machineIdentifier
          });
        }
        if (!serverEnabled) { return; }
        group.forEach(function (source) {
          var preference = preferences[String(source.id || '')];
          if (!preference) { return; }
          result.push({
            id: String(source.id),
            kind: 'library',
            title: libraryLabel(source, preference),
            sectionTitle: String(source.sectionTitle || ''),
            serverName: serverLabel(source, aliases),
            shared: source.owned === false,
            enabled: preference.enabled !== false,
            alias: String(preference.alias || ''),
            mergeGroup: String(preference.mergeGroup || ''),
            icon: String(preference.icon || 'folder')
          });
        });
      });
      result.push({ id: 'order', kind: 'action', title: t('settings.libraryOrder'), spacerBefore: true });
      return result;
    }

    function recentRows() {
      var preferences = preferenceState().items || [];
      var live = sourceMap();
      var aliases = aliasMap();
      var result = [];
      preferences.forEach(function (preference) {
        var source = live[String(preference.sourceId || '')];
        var title;
        if (!source) { return; }
        title = libraryLabel(source, preference);
        if (source.primary === false) { title += ' · ' + serverLabel(source, aliases); }
        result.push({
          id: String(source.id), kind: 'library', title: title,
          serverName: serverLabel(source, aliases), secondary: source.primary === false, shared: source.owned === false,
          enabled: preference.enabled !== false, homeRecentEnabled: preference.homeRecentEnabled !== false,
          alias: String(preference.alias || ''), icon: String(preference.icon || 'folder')
        });
      });
      return result;
    }

    function orderRows() {
      var preferences = preferenceState().items || [];
      var live = sourceMap();
      var aliases = aliasMap();
      var result = [];
      preferences.forEach(function (preference) {
        var source = live[String(preference.sourceId || '')];
        var title;
        if (!source || preference.enabled === false || (typeof sources.serverEnabled === 'function' && sources.serverEnabled(source.serverMachineIdentifier) === false)) { return; }
        title = libraryLabel(source, preference);
        if (source.primary === false) { title += ' \u00b7 ' + serverLabel(source, aliases); }
        result.push({
          id: String(source.id), kind: 'library', title: title,
          serverName: serverLabel(source, aliases), secondary: source.primary === false, shared: source.owned === false,
          enabled: true, alias: String(preference.alias || ''), icon: String(preference.icon || 'folder')
        });
      });
      return result;
    }

    function rows() { return state.mode === 'order' ? orderRows() : (state.mode === 'recent' ? recentRows() : customizeRows()); }

    function clampIndex(index) {
      var maximum = Math.max(0, rows().length);
      return Math.max(0, Math.min(maximum, Number(index) || 0));
    }

    function rowSummary(row, index) {
      if (state.mode === 'order') { return String(index + 1); }
      if (state.mode === 'recent') { return t(row.homeRecentEnabled ? 'settings.enabled' : 'settings.disabled'); }
      if (row.kind === 'server') {
        return (row.offline ? t('common.offline') + ' \u00b7 ' : '') + t(row.enabled ? 'settings.enabled' : 'settings.disabled');
      }
      if (row.kind === 'action') { return ''; }
      return t(row.enabled ? 'settings.enabled' : 'settings.disabled') + ' \u00b7 ' + t('settings.libraryTabs.icon.' + row.icon);
    }

    function rowMeta(row) {
      if (state.mode === 'order') { return row.secondary ? row.serverName : ''; }
      if (row.kind === 'server') {
        if (!row.aliasEditable || row.title === row.originalTitle) { return ''; }
        return row.originalTitle;
      }
      if (row.kind === 'action') { return ''; }
      return '';
    }

    function rowClass(row, index, motionClass) {
      var className = 'library-tabs-editor-row';
      if (row.kind === 'server') {
        className += ' is-server';
        if (row.enabled === false) { className += ' is-disabled'; }
        if (row.spacerBefore) { className += ' is-server-group'; }
      } else if (row.kind === 'library' && state.mode === 'customize') {
        className += ' is-library';
      } else if (row.kind === 'action' && row.spacerBefore) {
        className += ' is-order-action';
      }
      if (index === state.index) { className += ' is-focused'; }
      return className + (motionClass || '');
    }

    function render() {
      var panel;
      var list;
      var currentRows;
      var index;
      var button;
      var identity;
      var title;
      var meta;
      var summary;
      var motionClass;
      var backButton;
      if (!document || !document.getElementById) { return state; }
      panel = document.getElementById('library-tabs-editor');
      list = document.getElementById('library-tabs-editor-list');
      if (!panel || !list) { return state; }
      panel.className = state.open ? 'library-tabs-editor' : 'library-tabs-editor is-hidden';
      panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
      if (!state.open) { return state; }
      if (document.getElementById('library-tabs-editor-title')) {
        document.getElementById('library-tabs-editor-title').textContent = t(state.mode === 'order' ? 'settings.libraryOrder' : (state.mode === 'recent' ? 'settings.homeRow.recent' : 'settings.libraryTabs.title'));
      }
      if (document.getElementById('library-tabs-editor-hint')) {
        document.getElementById('library-tabs-editor-hint').textContent = t(state.mode === 'order' ? 'settings.libraryOrderHint' : (state.mode === 'recent' ? 'settings.homeRowsEditorHint' : 'settings.libraryTabs.hint'));
      }
      list.innerHTML = '';
      currentRows = rows();
      state.index = clampIndex(state.index);
      for (index = 0; index < currentRows.length; index += 1) {
        motionClass = '';
        if (state.reorderMotion && currentRows[index].id === state.reorderMotion.movedId) {
          motionClass = state.reorderMotion.direction > 0 ? ' is-reorder-from-above is-reorder-primary' : ' is-reorder-from-below is-reorder-primary';
        } else if (state.reorderMotion && currentRows[index].id === state.reorderMotion.displacedId) {
          motionClass = state.reorderMotion.direction > 0 ? ' is-reorder-from-below' : ' is-reorder-from-above';
        }
        button = element ? element('button', rowClass(currentRows[index], index, motionClass)) : document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-library-tabs-index', index);
        identity = element ? element('span', 'library-tabs-editor-identity') : document.createElement('span');
        title = element ? element('strong', 'library-tabs-editor-name', currentRows[index].title) : document.createElement('strong');
        meta = element ? element('span', 'library-tabs-editor-meta', rowMeta(currentRows[index])) : document.createElement('span');
        summary = element ? element('span', 'library-tabs-editor-summary', rowSummary(currentRows[index], index)) : document.createElement('span');
        if (!element) {
          title.className = 'library-tabs-editor-name'; title.textContent = currentRows[index].title;
          meta.className = 'library-tabs-editor-meta'; meta.textContent = rowMeta(currentRows[index]);
          summary.className = 'library-tabs-editor-summary'; summary.textContent = rowSummary(currentRows[index], index);
          identity.className = 'library-tabs-editor-identity';
          button.className = rowClass(currentRows[index], index, motionClass);
        }
        identity.appendChild(title);
        if (rowMeta(currentRows[index])) { identity.appendChild(meta); }
        button.appendChild(identity);
        button.appendChild(summary);
        list.appendChild(button);
      }
      backButton = document.getElementById('library-tabs-editor-back');
      if (backButton) {
        backButton.textContent = t('common.back');
        backButton.setAttribute('data-library-tabs-index', currentRows.length);
        backButton.className = state.index === currentRows.length ? 'is-focused' : '';
      }
      if (!pointerActive()) {
        if (state.index === currentRows.length && backButton && backButton.focus) { backButton.focus(); }
        else if (list.children && list.children[state.index] && list.children[state.index].focus) {
          list.children[state.index].focus();
          call(values.keepFocusVisible, list, list.children[state.index]);
        }
      }
      return state;
    }

    function focus(index) { state.index = clampIndex(index); render(); return snapshot(); }
    function restoreFocus() { render(); }
    function updateTab(sourceId, changes) { call(sources.updateTab, sourceId, changes || {}); render(); }
    function updateServerAlias(machineIdentifier, alias) { call(sources.updateServerAlias, machineIdentifier, alias); render(); }
    function updateServerEnabled(machineIdentifier, enabled) { call(sources.updateServerEnabled, machineIdentifier, enabled); call(values.onRecentChange); render(); }

    function iconItems(items) {
      return (items || []).map(function (value) { return { value: value, label: t('settings.libraryTabs.icon.' + value) }; });
    }

    function editIcon(row) {
      call(dialogs.openChoice, t('settings.libraryTabs.iconTitle'), iconItems(iconChoices), row.icon, function (choice) {
        if (!choice) { return; }
        updateTab(row.id, { icon: choice.value });
        call(values.onRecentChange);
      }, restoreFocus);
    }

    function editAlias(row, group) {
      var serverRow = row.kind === 'server';
      var field = serverRow ? 'serverAlias' : group ? 'mergeGroup' : 'alias';
      call(dialogs.openText, {
        title: t('settings.libraryTabs.' + field + (group ? '' : 'Title')), hint: t('settings.libraryTabs.' + field + 'Hint'),
        value: serverRow ? (row.title === row.originalTitle ? '' : row.title) : row[field] || '', placeholder: row.originalTitle || row.sectionTitle || row.title,
        cancelLabel: t('common.cancel'), applyLabel: t('common.apply'), maximum: 80,
        keyboard: 'ploff', nativeKeyboard: false, t9: true,
        apply: function (value) {
          var changes = {}; changes[field] = value;
          if (serverRow) { updateServerAlias(row.serverMachineIdentifier, value); }
          else { updateTab(row.id, changes); }
          call(values.onRecentChange);
        }, cancel: restoreFocus
      });
    }

    function editServerAlias(row) {
      if (!row.aliasEditable) { return false; }
      editAlias(row);
      return true;
    }

    function move(direction) {
      var currentRows = orderRows();
      var index = clampIndex(state.index);
      var target = index + (direction < 0 ? -1 : 1);
      var ids;
      var current;
      var displaced;
      if (target < 0 || target >= currentRows.length) { return false; }
      ids = currentRows.map(function (row) { return row.id; });
      current = ids[index]; displaced = ids[target]; ids[index] = displaced; ids[target] = current;
      call(sources.reorder, ids);
      call(values.onRecentChange);
      state.index = target;
      state.reorderMotion = { movedId: current, displacedId: displaced, direction: direction < 0 ? -1 : 1 };
      render();
      state.reorderMotion = null;
      return true;
    }

    function activate() {
      var currentRows = rows();
      if (state.open && state.index === currentRows.length) { return back(); }
      var row = currentRows[clampIndex(state.index)];
      var actions;
      if (!state.open || !row) { return false; }
      if (state.mode === 'order') { return true; }
      if (state.mode === 'recent') {
        updateTab(row.id, { homeRecentEnabled: !row.homeRecentEnabled });
        call(values.onRecentChange, row.id, !row.homeRecentEnabled);
        return true;
      }
      if (row.kind === 'action' && row.id === 'order') {
        state.mode = 'order'; state.nestedOrder = true; state.index = 0; render(); return true;
      }
      if (row.kind === 'server') {
        actions = [];
        if (!row.enabled || typeof sources.canDisableServer !== 'function' || sources.canDisableServer(row.serverMachineIdentifier) === true) {
          actions.push({ value: 'toggle', label: t(row.enabled ? 'settings.libraryTabs.disableServer' : 'settings.libraryTabs.enableServer') });
        }
        actions.push({ value: 'alias', label: t('settings.libraryTabs.alias') });
        call(dialogs.openChoice, row.title, actions, '', function (choice) {
          if (!choice) { return; }
          if (choice.value === 'toggle') { updateServerEnabled(row.serverMachineIdentifier, !row.enabled); }
          else if (choice.value === 'alias') { editServerAlias(row); }
        }, restoreFocus);
        return true;
      }
      actions = [
        { value: 'toggle', label: t(row.enabled ? 'settings.libraryTabs.hide' : 'settings.libraryTabs.show') },
        { value: 'alias', label: t('settings.libraryTabs.alias') },
        { value: 'mergeGroup', label: t('settings.libraryTabs.mergeGroup') },
        { value: 'icon', label: t('settings.libraryTabs.iconTitle') }
      ];
      call(dialogs.openChoice, row.title, actions, '', function (choice) {
        if (!choice) { return; }
        if (choice.value === 'toggle') { updateTab(row.id, { enabled: !row.enabled }); call(values.onRecentChange); }
        else if (choice.value === 'alias') { editAlias(row); }
        else if (choice.value === 'mergeGroup') { editAlias(row, true); }
        else if (choice.value === 'icon') { editIcon(row); }
      }, restoreFocus);
      return true;
    }

    function openMode(mode) {
      if (destroyed) { return snapshot(); }
      state.open = true; state.mode = mode === 'order' ? 'order' : (mode === 'recent' ? 'recent' : 'customize'); state.nestedOrder = false; state.index = 0; render(); return snapshot();
    }
    function openCustomize() { return openMode('customize'); }
    function openRecent() { return openMode('recent'); }
    function open() { return openCustomize(); }
    function close() { state.open = false; render(); call(values.onClose); return snapshot(); }
    function back() {
      if (state.mode === 'order' && state.nestedOrder) {
        state.mode = 'customize'; state.nestedOrder = false; state.index = Math.max(0, rows().length - 1); render(); return true;
      }
      close(); return true;
    }
    function handleKey(event) {
      var code = Number(event && event.keyCode || 0);
      if (!state.open) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (code === 27 || code === 461) { return back(); }
      if (code === 38) { focus(state.index - 1); return true; }
      if (code === 40) { focus(state.index + 1); return true; }
      if (state.mode === 'order' && code === 37) { move(-1); return true; }
      if (state.mode === 'order' && code === 39) { move(1); return true; }
      if (state.mode === 'recent' && (code === 37 || code === 39)) { return activate(); }
      if (code === 13) { return activate(); }
      return true;
    }
    function snapshot() { return { open: state.open, index: state.index, mode: state.mode, rows: rows() }; }
    function destroy() { if (destroyed) { return; } destroyed = true; state.open = false; render(); }

    return {
      activate: activate, close: close, destroy: destroy, focus: focus, handleKey: handleKey,
      open: open, openCustomize: openCustomize, openRecent: openRecent, render: render, rows: rows, snapshot: snapshot
    };
  }

  return { create: create };
}));

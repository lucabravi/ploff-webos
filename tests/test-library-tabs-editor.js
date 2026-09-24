'use strict';

var assert = require('assert');
var LibraryTabsEditor = require('../app/library-tabs-editor');

var preferenceState = {
  displayMode: 'text',
  home: { icon: 'home' },
  serverAliases: [{ serverMachineIdentifier: 'server-b', alias: 'Marco' }],
  serverStates: [],
  homeOrder: [],
  items: [
    { sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', enabled: true, homeRecentEnabled: true, alias: '', icon: 'movie', order: 0 },
    { sourceId: 'server-b|2', serverMachineIdentifier: 'server-b', enabled: true, homeRecentEnabled: true, alias: 'Anime', icon: 'anime', order: 1 }
  ]
};
var liveSources = [
  { id: 'server-a|1', serverMachineIdentifier: 'server-a', serverName: 'PloffNAS', primary: true, owned: true, sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film' },
  { id: 'server-b|2', serverMachineIdentifier: 'server-b', serverName: 'PLEX-SERVER-8492', primary: false, owned: false, sectionKey: '2', sectionTitle: 'Anime', sectionType: 'show', defaultTitle: 'Anime \u00b7 PLEX-SERVER-8492' }
];
var knownServers = [
  { machineIdentifier: 'server-a', name: 'PloffNAS', owned: true },
  { machineIdentifier: 'server-b', name: 'PLEX-SERVER-8492', owned: false },
  { machineIdentifier: 'server-offline', name: 'Studio offline', owned: true }
];
var updates = [];
var serverAliasUpdates = [];
var serverEnabledUpdates = [];
var reorderCalls = [];
var homeReorderCalls = [];
var choices = [];
var textOptions = null;
var preferenceNotifications = 0;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function updatePreference(sourceId, changes) {
  preferenceState.items.forEach(function (item) {
    if (item.sourceId !== sourceId) { return; }
    Object.keys(changes).forEach(function (key) { item[key] = changes[key]; });
  });
  updates.push({ sourceId: sourceId, changes: clone(changes) });
}

var editor = LibraryTabsEditor.create({
  t: function (key) { return key; },
  librarySources: {
    sources: function () { return liveSources; },
    servers: function () { return knownServers; },
    preferenceState: function () { return clone(preferenceState); },
    updateTab: updatePreference,
    updateServerAlias: function (machineIdentifier, alias) {
      serverAliasUpdates.push({ machineIdentifier: machineIdentifier, alias: alias });
      preferenceState.serverAliases = preferenceState.serverAliases.filter(function (entry) { return entry.serverMachineIdentifier !== machineIdentifier; });
      if (alias) { preferenceState.serverAliases.push({ serverMachineIdentifier: machineIdentifier, alias: alias }); }
    },
    updateServerEnabled: function (machineIdentifier, enabled) {
      serverEnabledUpdates.push({ machineIdentifier: machineIdentifier, enabled: enabled });
      preferenceState.serverStates = preferenceState.serverStates.filter(function (entry) { return entry.serverMachineIdentifier !== machineIdentifier; });
      if (enabled === false) { preferenceState.serverStates.push({ serverMachineIdentifier: machineIdentifier, enabled: false }); }
    },
    serverEnabled: function (machineIdentifier) {
      return !preferenceState.serverStates.some(function (entry) { return entry.serverMachineIdentifier === machineIdentifier && entry.enabled === false; });
    },
    canDisableServer: function (machineIdentifier) {
      var seen = {};
      var enabled = [];
      knownServers.forEach(function (server) {
        var id = String(server.machineIdentifier || '');
        if (!id || seen[id]) { return; }
        seen[id] = true;
        if (!preferenceState.serverStates.some(function (entry) { return entry.serverMachineIdentifier === id && entry.enabled === false; })) { enabled.push(id); }
      });
      return enabled.length > 1 && enabled.indexOf(String(machineIdentifier || '')) !== -1;
    },
    reorder: function (ids) { reorderCalls.push(ids.slice()); },
    reorderHome: function (ids) { homeReorderCalls.push(ids.slice()); preferenceState.homeOrder = ids.slice(); }
  },
  dialogs: {
    openChoice: function (title, items, selected, apply, returnFocus) {
      choices.push({ title: title, items: items, selected: selected, apply: apply, returnFocus: returnFocus });
    },
    openText: function (options) { textOptions = options; }
  },
  onRecentChange: function () { preferenceNotifications += 1; }
});

editor.openCustomize();
assert.strictEqual(editor.snapshot().open, true, 'customizer must become active when opened');
assert.strictEqual(editor.snapshot().mode, 'customize', 'customization must be an explicit editor mode');
assert.deepStrictEqual(editor.rows().map(function (row) { return row.kind + ':' + row.id; }), [
  'server:server-a', 'library:server-a|1', 'server:server-b', 'library:server-b|2', 'server:server-offline', 'action:order'
], 'Libraries must keep customization together and expose ordering as one final dedicated action');
assert.strictEqual(editor.rows()[2].title, 'Marco', 'saved server names must label shared PMS groups');
assert.strictEqual(editor.rows()[4].title, 'Studio offline', 'known PMSes must remain manageable when their libraries cannot be loaded');
assert.strictEqual(editor.rows()[4].offline, true, 'a known PMS without live libraries must be identified as offline');
assert.strictEqual(editor.rows()[5].title, 'settings.libraryOrder', 'Libraries must expose ordering inside the same surface');
assert.strictEqual(editor.rows()[2].aliasEditable, true, 'shared PMS names must be aliasable');
assert.strictEqual(editor.rows()[2].spacerBefore, true, 'each server after the first must be visually separated from the previous server group');
assert.strictEqual(editor.rows()[5].spacerBefore, true, 'Order libraries must be visually separated from the server/library groups');
assert.strictEqual(editor.rows()[3].title, 'Anime', 'library rows inside a server group must not repeat the server name in their title');

editor.focus(2);
editor.activate();
var serverActions = choices.pop();
assert.deepStrictEqual(serverActions.items.map(function (item) { return item.value; }), ['toggle', 'alias'], 'server customization must expose only Disable/Enable and Name');
assert.strictEqual(serverActions.items[0].label, 'settings.libraryTabs.disableServer', 'enabled servers must expose the Disable action');
assert.strictEqual(serverActions.items[1].label, 'settings.libraryTabs.alias', 'server rename action must use the same concise Name copy as libraries');
serverActions.apply({ value: 'alias' });
assert.ok(textOptions, 'server Name must open the alias editor only after choosing the action');
assert.strictEqual(textOptions.value, 'Marco', 'server name editor must start from the saved name');
assert.strictEqual(textOptions.keyboard, 'ploff', 'server names must use the Ploff keyboard instead of the native LG keyboard');
assert.strictEqual(textOptions.nativeKeyboard, false, 'server names must not summon the native LG keyboard');
assert.strictEqual(textOptions.t9, true, 'server name T9 must not depend on the Search-only T9 preference');
textOptions.apply('Marco Plex');
assert.deepStrictEqual(serverAliasUpdates.pop(), { machineIdentifier: 'server-b', alias: 'Marco Plex' }, 'server name edits must persist once per PMS');
assert.strictEqual(preferenceNotifications, 1, 'server name edits must schedule settings backup like other Library customizations');
editor.activate();
serverActions = choices.pop();
serverActions.apply({ value: 'toggle' });
assert.deepStrictEqual(serverEnabledUpdates.pop(), { machineIdentifier: 'server-b', enabled: false }, 'Disable must persist at server level instead of mutating every child library');
assert.strictEqual(preferenceNotifications, 2, 'server enable changes must notify Library preference owners exactly once');
assert.strictEqual(editor.rows()[2].enabled, false, 'disabled server rows must immediately reflect their state');
assert.deepStrictEqual(editor.rows().map(function (row) { return row.kind + ':' + row.id; }), [
  'server:server-a', 'library:server-a|1', 'server:server-b', 'server:server-offline', 'action:order'
], 'disabled server groups must keep the server row visible while hiding their child libraries');
editor.focus(0);
editor.activate();
serverActions = choices.pop();
assert.deepStrictEqual(serverActions.items.map(function (item) { return item.value; }), ['toggle', 'alias'], 'a live server remains disableable while another known PMS is still active');
editor.openCustomize();
editor.focus(editor.rows().length - 1);
editor.activate();
assert.deepStrictEqual(editor.rows().map(function (row) { return row.id; }), ['server-a|1'], 'Order libraries must omit libraries belonging to a disabled server');
editor.openCustomize();
preferenceState.serverStates = [];
editor.openCustomize();

editor.focus(3);
editor.activate();
var libraryActions = choices.pop();
assert.deepStrictEqual(libraryActions.items.map(function (item) { return item.value; }), ['toggle', 'alias', 'mergeGroup', 'icon'], 'library customization must expose visibility, alias, merge group and icon');
assert.strictEqual(libraryActions.selected, '', 'action menu must not show a bogus checked first row');
libraryActions.apply({ value: 'toggle' });
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { enabled: false } }, 'visibility action must persist through the source-aware preference store');
assert.strictEqual(preferenceNotifications, 3, 'library visibility changes must schedule settings backup');

editor.activate();
libraryActions = choices.pop();
libraryActions.apply({ value: 'alias' });
assert.ok(textOptions, 'library alias editing must reuse the text input dialog');
assert.strictEqual(textOptions.value, 'Anime', 'library alias editor must start from the saved alias');
assert.strictEqual(textOptions.keyboard, 'ploff', 'library aliases must use the Ploff keyboard instead of the native LG keyboard');
assert.strictEqual(textOptions.nativeKeyboard, false, 'library aliases must not summon the native LG keyboard');
assert.strictEqual(textOptions.t9, true, 'library alias T9 must not depend on the Search-only T9 preference');
textOptions.apply('Anime JP');
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { alias: 'Anime JP' } }, 'library alias edits must remain independent from server alias');
assert.strictEqual(preferenceNotifications, 4,
  'library alias edits must invalidate Home presentation and schedule settings backup just like other library preference changes');

editor.activate();
libraryActions = choices.pop();
libraryActions.apply({ value: 'icon' });
var iconActions = choices.pop();
iconActions.apply({ value: 'movie' });
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { icon: 'movie' } }, 'library icon edits must persist through the source-aware preference store');
assert.strictEqual(preferenceNotifications, 5, 'library icon edits must schedule settings backup');

preferenceState.items[1].enabled = true;
editor.focus(5);
editor.activate();
assert.strictEqual(editor.snapshot().mode, 'order', 'Order libraries must open as a nested mode from Libraries');
assert.deepStrictEqual(editor.rows().map(function (row) { return row.id; }), ['server-a|1', 'server-b|2'], 'order editor must list only active libraries and no server header/Home row');
assert.strictEqual(choices.length, 0, 'order editor must not open action menus');
editor.focus(1);
editor.handleKey({ keyCode: 37, preventDefault: function () {} });
assert.deepStrictEqual(reorderCalls.pop(), ['server-b|2', 'server-a|1'], 'left/right ordering must use stable source ids directly, like the Home ordering editor');

editor.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(editor.snapshot().open, true, 'Back from ordering must return to Libraries instead of leaving the editor');
assert.strictEqual(editor.snapshot().mode, 'customize', 'Back from ordering must restore the Libraries customization surface');
editor.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(editor.snapshot().open, false, 'a second Back must close Libraries without leaving Settings');

preferenceState.items.push({ sourceId: 'server-c|3', serverMachineIdentifier: 'server-c', enabled: true, alias: '', icon: 'movie', order: 2 });
liveSources.push({ id: 'server-c|3', serverMachineIdentifier: 'server-c', serverName: 'Studio', primary: false, owned: true, sectionKey: '3', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film \u00b7 Studio' });
editor.openCustomize();
editor.focus(editor.rows().length - 1);
editor.activate();
var ownedSecondaryRow = editor.rows().filter(function (row) { return row.id === 'server-c|3'; })[0];
assert.strictEqual(ownedSecondaryRow.title, 'Film \u00b7 Studio', 'order editor must distinguish libraries from an owned secondary PMS');
assert.strictEqual(ownedSecondaryRow.serverName, 'Studio', 'order editor must retain the secondary PMS label for context');

(function ownedServersAreAliasableRegardlessOfPrimarySelection() {
  var aliasText = null;
  var aliasUpdates = [];
  var ownedEditor = LibraryTabsEditor.create({
    t: function (key) { return key; },
    librarySources: {
      sources: function () { return [
        { id: 'luca-nuc|1', serverMachineIdentifier: 'luca-nuc', serverName: 'LUCA-NUC', primary: true, owned: true, sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film' },
        { id: 'mac-m4|2', serverMachineIdentifier: 'mac-m4', serverName: 'Mac M4', primary: false, owned: true, sectionKey: '2', sectionTitle: 'Anime', sectionType: 'show', defaultTitle: 'Anime \u00b7 Mac M4' }
      ]; },
      preferenceState: function () { return {
        displayMode: 'text', home: { icon: 'home' }, serverAliases: [],
        items: [
          { sourceId: 'luca-nuc|1', serverMachineIdentifier: 'luca-nuc', enabled: true, alias: '', icon: 'movie', order: 0 },
          { sourceId: 'mac-m4|2', serverMachineIdentifier: 'mac-m4', enabled: true, alias: '', icon: 'anime', order: 1 }
        ]
      }; },
      updateServerAlias: function (machineIdentifier, alias) { aliasUpdates.push({ machineIdentifier: machineIdentifier, alias: alias }); }
    },
    dialogs: {
      openChoice: function (_title, items, _selected, apply) { apply(items.filter(function (item) { return item.value === 'alias'; })[0]); },
      openText: function (options) { aliasText = options; }
    }
  });
  ownedEditor.openCustomize();
  assert.deepStrictEqual(ownedEditor.rows().filter(function (row) { return row.kind === 'server'; }).map(function (row) { return row.id; }), ['luca-nuc', 'mac-m4'],
    'every distinct PMS must expose an editable server-name row, including owned primary and owned secondary servers');
  ownedEditor.focus(ownedEditor.rows().map(function (row) { return row.id; }).indexOf('mac-m4'));
  ownedEditor.activate();
  assert.ok(aliasText, 'an owned secondary PMS must expose the same server-name editor as a shared PMS after choosing Name');
  aliasText.apply('Mac Studio');
  assert.deepStrictEqual(aliasUpdates.pop(), { machineIdentifier: 'mac-m4', alias: 'Mac Studio' },
    'renaming an owned secondary PMS must persist by machine identifier independently from the selected primary server');
  aliasText = null;
  ownedEditor.focus(ownedEditor.rows().map(function (row) { return row.id; }).indexOf('luca-nuc'));
  ownedEditor.activate();
  assert.ok(aliasText, 'the currently selected primary PMS must also expose the same server-name editor');
  aliasText.apply('Casa');
  assert.deepStrictEqual(aliasUpdates.pop(), { machineIdentifier: 'luca-nuc', alias: 'Casa' },
    'renaming the selected primary PMS must persist by machine identifier too');
}());

function domNode(tagName, className, text) {
  var value = {
    tagName: tagName || '', className: className || '', textContent: text || '', children: [], attributes: {},
    appendChild: function (child) { this.children.push(child); return child; },
    setAttribute: function (key, item) { this.attributes[key] = String(item); },
    focus: function () { this.focused = true; }
  };
  Object.defineProperty(value, 'innerHTML', { set: function () { this.children = []; } });
  return value;
}

var animationNodes = {
  'library-tabs-editor': domNode('div'),
  'library-tabs-editor-list': domNode('div'),
  'library-tabs-editor-title': domNode('h2'),
  'library-tabs-editor-hint': domNode('p'),
  'library-tabs-editor-back': domNode('button')
};
(function offlineServerSummaryUsesActiveLocale() {
  var localizedNodes = {
    'library-tabs-editor': domNode('div'),
    'library-tabs-editor-list': domNode('div'),
    'library-tabs-editor-title': domNode('h2'),
    'library-tabs-editor-hint': domNode('p'),
    'library-tabs-editor-back': domNode('button')
  };
  var localizedEditor = LibraryTabsEditor.create({
    document: {
      createElement: function (tagName) { return domNode(tagName); },
      getElementById: function (id) { return localizedNodes[id]; }
    },
    element: domNode,
    t: function (key) {
      if (key === 'common.offline') { return 'Sin conexi\u00f3n'; }
      if (key === 'settings.enabled') { return 'Activado'; }
      return key;
    },
    librarySources: {
      sources: function () { return []; },
      servers: function () { return [{ machineIdentifier: 'offline-server', name: 'Servidor', owned: true }]; },
      preferenceState: function () { return { serverAliases: [], items: [] }; },
      serverEnabled: function () { return true; },
      canDisableServer: function () { return false; }
    }
  });
  localizedEditor.openCustomize();
  assert.strictEqual(localizedNodes['library-tabs-editor-list'].children[0].children[1].textContent, 'Sin conexi\u00f3n \u00b7 Activado',
    'offline server summaries must use the active locale instead of a hardcoded English label');
}());

var animatedPreferences = clone(preferenceState);
animatedPreferences.items = animatedPreferences.items.slice(0, 2);
var homeInvalidations = 0;
var keptVisible = null;
var animatedEditor = LibraryTabsEditor.create({
  onRecentChange: function () { homeInvalidations += 1; },
  document: {
    createElement: function (tagName) { return domNode(tagName); },
    getElementById: function (id) { return animationNodes[id]; }
  },
  element: domNode,
  t: function (key) { return key; },
  pointerActive: function () { return false; },
  keepFocusVisible: function (container, target) { keptVisible = { container: container, target: target }; },
  librarySources: {
    sources: function () { return liveSources.slice(0, 2); },
    preferenceState: function () { return clone(animatedPreferences); },
    reorder: function (ids) {
      animatedPreferences.items = ids.map(function (id, index) {
        var item = animatedPreferences.items.filter(function (entry) { return entry.sourceId === id; })[0];
        item.order = index;
        return item;
      });
    }
  }
});
animatedEditor.openCustomize();
animatedEditor.focus(animatedEditor.rows().length - 1);
animatedEditor.activate();
assert.strictEqual(keptVisible.container, animationNodes['library-tabs-editor-list'], 'opening Libraries must keep its focused row inside the scrolling list');
assert.strictEqual(keptVisible.target, animationNodes['library-tabs-editor-list'].children[0], 'Libraries scrolling must follow the actual focused row');
assert.strictEqual(animationNodes['library-tabs-editor-back'].textContent, 'common.back', 'Libraries must expose a visible localized Back action');
animatedEditor.focus(0);
animatedEditor.handleKey({ keyCode: 39, preventDefault: function () {} });
assert.strictEqual(homeInvalidations, 1, 'library reorder must invalidate Home ordering');
assert.ok(/is-reorder-from-below/.test(animationNodes['library-tabs-editor-list'].children[0].className), 'the displaced library must animate upward from its previous lower position');
assert.ok(/is-reorder-from-above/.test(animationNodes['library-tabs-editor-list'].children[1].className), 'the moved library must animate downward from its previous upper position');
assert.ok(/is-reorder-primary/.test(animationNodes['library-tabs-editor-list'].children[1].className), 'the moved library must keep the visually emphasized focus treatment');
assert.strictEqual(animationNodes['library-tabs-editor-list'].children[0].children[1].textContent, '1', 'library numbering must update immediately after the swap');
assert.strictEqual(animationNodes['library-tabs-editor-list'].children[1].children[1].textContent, '2', 'the moved library must expose its new number immediately');
animatedEditor.focus(animatedEditor.rows().length);
animatedEditor.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(animatedEditor.snapshot().open, true, 'Back from the nested Order editor must return to Libraries customization');
assert.strictEqual(animatedEditor.snapshot().mode, 'customize', 'Back from the nested Order editor must restore customization mode');
animatedEditor.focus(animatedEditor.rows().length);
animatedEditor.handleKey({ keyCode: 13, preventDefault: function () {} });
assert.strictEqual(animatedEditor.snapshot().open, false, 'activating Back from top-level Libraries customization must close the editor');

preferenceState.items[1].enabled = false;
editor.openRecent();
assert.strictEqual(editor.snapshot().mode, 'recent', 'Recently Added libraries must have a dedicated Settings editor mode');
assert.deepStrictEqual(editor.rows().map(function (row) { return row.id; }), ['server-a|1', 'server-b|2', 'server-c|3'], 'Recently Added settings must include primary, shared and owned-secondary libraries even when a navbar tab is hidden');
assert.strictEqual(editor.rows()[1].homeRecentEnabled, true, 'external libraries must be enabled in Home Recently Added by default');
editor.focus(1);
editor.activate();
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { homeRecentEnabled: false } }, 'Recently Added editor must persist per-library Home visibility independently');
assert.strictEqual(editor.rows()[1].homeRecentEnabled, false, 'Recently Added editor must reflect the persisted toggle immediately');
editor.handleKey({ keyCode: 37, preventDefault: function () {} });
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { homeRecentEnabled: true } }, 'left must toggle Recently Added visibility just like OK');
assert.strictEqual(editor.rows()[1].homeRecentEnabled, true, 'left toggle must update the Recently Added value immediately');
editor.handleKey({ keyCode: 39, preventDefault: function () {} });
assert.deepStrictEqual(updates.pop(), { sourceId: 'server-b|2', changes: { homeRecentEnabled: false } }, 'right must toggle Recently Added visibility just like OK');
assert.strictEqual(editor.rows()[1].homeRecentEnabled, false, 'right toggle must update the Recently Added value immediately');
editor.handleKey({ keyCode: 461, preventDefault: function () {} });
assert.strictEqual(editor.snapshot().open, false, 'Back must close the Recently Added libraries editor');

(function recentlyAddedStatusUsesStandardSettingsValueSize() {
  var fs = require('fs');
  var path = require('path');
  var styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles', 'core.css'), 'utf8');
  assert.ok(/\.library-tabs-editor-summary\s*\{[^}]*font-size\s*:\s*1\.25rem/i.test(styles),
    'Recently Added Attivo/Disattivo values must use the same readable value size as regular Settings rows');
}());

console.log('Library tabs editor checks passed');

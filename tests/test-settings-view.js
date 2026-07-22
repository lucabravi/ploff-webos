'use strict';

var assert = require('assert');
var SettingsView = require('../app/settings-view');

function node(tagName, className, text) {
  var value = {
    tagName: tagName || '', className: className || '', textContent: text || '', children: [], attributes: {},
    firstChild: null, scrollTop: 0, clientHeight: 300, offsetTop: 0, offsetHeight: 40,
    appendChild: function (child) { this.children.push(child); if (!this.firstChild) { this.firstChild = child; } return child; },
    insertBefore: function (child) { this.children.unshift(child); this.firstChild = child; },
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    focus: function () { this.focused = true; }
  };
  Object.defineProperty(value, 'innerHTML', { set: function () { this.children = []; this.firstChild = null; } });
  return value;
}

var nodes = {
  'app-settings-list': node('div'),
  'app-settings-title': node('h1'),
  'app-settings-notice': node('p'),
  'language-editor-list': node('div'),
  'language-editor-title': node('h2'),
  'language-editor-hint': node('p')
};
var serverRenders = 0;
var keptVisible = [];
var view = SettingsView.create({
  document: {
    getElementById: function (id) { return nodes[id]; },
    querySelector: function (selector) {
      var match = selector.match(/data-setting-index="(\d+)"/);
      return match ? nodes['app-settings-list'].children.filter(function (item) { return item.attributes['data-setting-index'] === match[1]; })[0] : null;
    }
  },
  element: node,
  setText: function (id, value) { nodes[id].textContent = value; },
  t: function (key) { return key; },
  accentColors: ['cyan', 'white'],
  accentValues: { cyan: '#00ffff', white: '#ffffff' },
  renderServerEditor: function () { serverRenders += 1; },
  clearFocus: function () {},
  navTarget: function () { return null; },
  keepFocusVisible: function (container, target) { keptVisible.push({ container: container, target: target }); },
  isPointerSelectionActive: function () { return false; }
});

view.open(true);
assert.deepStrictEqual(view.snapshot(), { open: true, zone: 'nav', index: 0, languageKind: '', languageIndex: 0 }, 'settings view must own its initial navigation state');
view.focusList(3, 2);
assert.strictEqual(view.snapshot().zone, 'list', 'focusing a settings row must leave navbar focus');
assert.strictEqual(view.snapshot().index, 1, 'settings row focus must clamp to the available row count');
view.openLanguages('audioLanguages');
view.focusLanguage(4, 2);
assert.strictEqual(view.snapshot().languageKind, 'audioLanguages', 'language editor ownership must remain inside the settings view');
assert.strictEqual(view.snapshot().languageIndex, 1, 'language focus must clamp to its available values');
view.closeLanguages();
assert.strictEqual(view.snapshot().languageKind, '', 'closing the language editor must clear its private state');

view.render({
  title: 'Settings', notice: 'Global', zone: 'list', index: 1, serverEditorOpen: false,
  credit: 'Made by Rhapsodos93', accentColor: 'cyan',
  rows: [
    { key: 'plexServer', section: 'plex', label: 'Server', value: 'Plex', serverEditor: true },
    { key: 'accentColor', section: 'interface', label: 'Color', value: 'Cyan', palette: true }
  ],
  sectionLabel: function (section) { return section.toUpperCase(); }
});

assert.strictEqual(nodes['app-settings-title'].textContent, 'Settings', 'settings renderer must update its title');
assert.strictEqual(nodes['app-settings-list'].children.length, 5, 'settings renderer must include section labels, rows, and credit');
assert.strictEqual(nodes['app-settings-list'].children[2].className, 'app-settings-section', 'a new settings section must render before its first row');
assert.strictEqual(nodes['app-settings-list'].children[3].className, 'app-setting-row is-focused', 'settings focus must be derived from the supplied snapshot');
assert.strictEqual(nodes['app-settings-list'].children[3].children[1].children[0].children.length, 2, 'accent settings must render every configured color swatch');
assert.strictEqual(keptVisible.length, 1, 'remote focus must keep the selected setting visible');

view.render({
  title: 'Settings', notice: '', zone: 'list', index: 0, serverEditorOpen: true, serverDiscoveryActive: true,
  credit: '', accentColor: 'cyan', rows: [{ key: 'plexServer', section: 'plex', label: 'Server', value: 'Plex', serverEditor: true }],
  sectionLabel: function () { return 'PLEX'; }
});
assert.strictEqual(serverRenders, 1, 'an open inline server editor must delegate its body rendering');
assert.strictEqual(nodes['app-settings-list'].children[1].className, 'app-setting-row has-inline-editor', 'the server setting must expose its expanded state');

view.renderLanguages({
  title: 'Audio priority', hint: 'Choose', index: 1,
  languages: [{ code: 'ja', label: 'Japanese', rank: 1 }, { code: 'it', label: 'Italian', rank: 2 }]
});
assert.strictEqual(nodes['language-editor-list'].children.length, 2, 'language editor must render every language');
assert.strictEqual(nodes['language-editor-list'].children[1].className, 'language-editor-row is-focused', 'language editor focus must be snapshot-driven');
assert.strictEqual(nodes['language-editor-list'].children[1].children[1].textContent, '2', 'language priority rank must remain visible');

console.log('Settings view checks passed');

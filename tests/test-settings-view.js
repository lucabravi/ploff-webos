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
  'language-editor-hint': node('p'),
  'language-editor-back': node('button')
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
view.focusList(1, [{ key: 'server' }, { key: 'network', readOnly: true }, { key: 'language' }], 1);
assert.strictEqual(view.snapshot().index, 2, 'read-only settings rows must be skipped by keyboard focus');
view.openLanguages('audioLanguages');
view.focusLanguage(4, 2);
assert.strictEqual(view.snapshot().languageKind, 'audioLanguages', 'language editor ownership must remain inside the settings view');
assert.strictEqual(view.snapshot().languageIndex, 1, 'language focus must clamp to its available values');
view.closeLanguages();
assert.strictEqual(view.snapshot().languageKind, '', 'closing the language editor must clear its private state');

view.render({
  title: 'Settings', notice: 'Global', zone: 'list', index: 2, serverEditorOpen: false,
  credit: 'Made by Rhapsodos93', accentColor: 'cyan',
  rows: [
    { key: 'plexServer', section: 'plex', label: 'Server', value: 'Plex', serverEditor: true },
    { key: 'networkStatus', section: 'plex', label: 'Network', value: 'Online', readOnly: true },
    { key: 'accentColor', section: 'interface', label: 'Color', value: 'Cyan', palette: true }
  ],
  sectionLabel: function (section) { return section.toUpperCase(); }
});

assert.strictEqual(nodes['app-settings-title'].textContent, 'Settings', 'settings renderer must update its title');
assert.strictEqual(nodes['app-settings-list'].children.length, 6, 'settings renderer must include section labels, rows, and credit');
assert.strictEqual(nodes['app-settings-list'].children[3].className, 'app-settings-section', 'a new settings section must render before its first row');
assert.strictEqual(nodes['app-settings-list'].children[4].className, 'app-setting-row is-focused', 'settings focus must be derived from the supplied snapshot');
assert.strictEqual(nodes['app-settings-list'].children[2].tagName, 'div', 'read-only settings rows must not render as buttons');
assert.strictEqual(nodes['app-settings-list'].children[2].attributes['data-setting-index'], undefined, 'read-only settings rows must not enter pointer focus navigation');
assert.strictEqual(nodes['app-settings-list'].children[4].children[1].children[0].children.length, 2, 'accent settings must render every configured color swatch');
assert.strictEqual(keptVisible.length, 1, 'remote focus must keep the selected setting visible');

view.render({
  title: 'Settings', notice: '', zone: 'list', index: 0, serverEditorOpen: false,
  credit: '', accentColor: 'cyan',
  rows: [{
    key: 'artworkQuality', section: 'interface', label: 'Quality', value: '85%', currentValue: 85, stepper: true,
    choices: [{ value: 40, label: '40%' }, { value: 55, label: '55%' }, { value: 70, label: '70%' }, { value: 85, label: '85%' }, { value: 100, label: '100%' }]
  }],
  sectionLabel: function () { return 'INTERFACE'; }
});
var stepperRow = nodes['app-settings-list'].children[1];
var stepperValue = stepperRow.children[1];
var stepperTrack = stepperValue.children[0];
assert.strictEqual(stepperRow.attributes.role, 'slider', 'stepped settings must expose slider semantics');
assert.strictEqual(stepperRow.attributes['aria-valuenow'], '85', 'slider semantics must expose the exact current step');
assert.strictEqual(stepperRow.attributes['aria-valuetext'], '85%', 'slider semantics must retain the localized visible value');
assert.strictEqual(stepperTrack.children.length, 6, 'the step bar must contain one fill and one marker per value');
assert.strictEqual(stepperTrack.children[0].style.width, '75%', 'the fill must stop at the selected fourth of five steps');
assert.strictEqual(stepperValue.children[1].textContent, '85%', 'the current value must render to the right of the bar');

view.render({
  title: 'Settings', notice: '', zone: 'list', index: 0, serverEditorOpen: false,
  credit: '', accentColor: 'cyan',
  rows: [{
    key: 'lanVideoQuality', section: 'playback', label: 'LAN quality', value: 'Original', currentValue: 'original', stepper: true,
    choices: [{ value: '4000', label: '4 Mbps' }, { value: '8000', label: '8 Mbps' }, { value: '12000', label: '12 Mbps' }, { value: 'original', label: 'Original' }]
  }],
  sectionLabel: function () { return 'PLAYBACK'; }
});
stepperRow = nodes['app-settings-list'].children[1];
stepperValue = stepperRow.children[1];
stepperTrack = stepperValue.children[0];
assert.strictEqual(stepperRow.attributes['aria-valuemin'], '0', 'semantic step scales must expose an indexed numeric minimum');
assert.strictEqual(stepperRow.attributes['aria-valuemax'], '3', 'semantic step scales must expose an indexed numeric maximum');
assert.strictEqual(stepperRow.attributes['aria-valuenow'], '3', 'Original must expose the final indexed slider step');
assert.strictEqual(stepperRow.attributes['aria-valuetext'], 'Original', 'semantic sliders must retain their visible localized value');
assert.strictEqual(stepperTrack.children[0].style.width, '100%', 'Original must fill the stepped bar to its rightmost endpoint');
assert.strictEqual(stepperValue.children[1].textContent, 'Original', 'Original must render to the right of the bar');

view.render({
  title: 'Settings', notice: '', zone: 'list', index: 0, serverEditorOpen: false,
  credit: '', accentColor: 'cyan',
  rows: [{ key: 'appVersion', section: 'support', label: 'Ploff 1.0.5', value: 'Version 1.0.6 available', action: true, versionRow: true }],
  sectionLabel: function () { return 'SUPPORT'; }
});
assert.strictEqual(nodes['app-settings-list'].children[1].className, 'app-setting-row is-version is-focused', 'the final application version action must use its discreet shared treatment');
assert.strictEqual(nodes['app-settings-list'].children[1].children[0].textContent, 'Ploff 1.0.5', 'the application version must remain visible in the clickable row');
assert.strictEqual(nodes['app-settings-list'].children[1].children[1].textContent, 'Version 1.0.6 available', 'an available update must remain visible beside the installed version');

view.render({
  title: 'Settings', notice: '', zone: 'list', index: 0, serverEditorOpen: true, serverDiscoveryActive: true,
  credit: '', accentColor: 'cyan', rows: [{ key: 'plexServer', section: 'plex', label: 'Server', value: 'Plex', serverEditor: true }],
  sectionLabel: function () { return 'PLEX'; }
});
assert.strictEqual(serverRenders, 1, 'an open inline server editor must delegate its body rendering');
assert.strictEqual(nodes['app-settings-list'].children[1].className, 'app-setting-row has-inline-editor', 'the server setting must expose its expanded state');

view.renderLanguages({
  title: 'Audio priority', hint: 'Choose', backLabel: 'Back', index: 1,
  languages: [{ code: 'ja', label: 'Japanese', rank: 1 }, { code: 'it', label: 'Italian', rank: 2 }]
});
assert.strictEqual(nodes['language-editor-list'].children.length, 2, 'language editor must render every language');
assert.strictEqual(nodes['language-editor-list'].children[1].className, 'language-editor-row is-focused', 'language editor focus must be snapshot-driven');
assert.strictEqual(nodes['language-editor-list'].children[1].children[1].textContent, '2', 'language priority rank must remain visible');
assert.strictEqual(nodes['language-editor-back'].textContent, 'Back', 'language editor must expose a visible Back action');
assert.strictEqual(nodes['language-editor-back'].attributes['data-language-index'], '2', 'Back must participate in the same focus model as language rows');
var firstLanguageNode = nodes['language-editor-list'].children[0];
view.focusLanguage(0, 3);
view.updateLanguageFocus();
assert.strictEqual(nodes['language-editor-list'].children[0], firstLanguageNode, 'language pointer focus must preserve the existing row until click dispatch');
assert.strictEqual(firstLanguageNode.className, 'language-editor-row is-focused', 'language pointer focus must update classes on the existing row');

view.renderLanguages({
  title: 'Version priority', hint: 'Reorder', backLabel: 'Back', index: 0,
  languages: [
    { code: 'hdr', label: 'HDR', rank: 1, disabled: true },
    { code: 'resolution', label: 'Resolution', rank: 2, disabled: false }
  ]
});
assert.strictEqual(nodes['language-editor-list'].children[0].disabled, true, 'unsupported version criteria must render as non-selectable');
assert.ok(/is-disabled/.test(nodes['language-editor-list'].children[0].className), 'unsupported version criteria must expose their disabled visual state');

console.log('Settings view checks passed');

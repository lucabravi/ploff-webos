'use strict';

var assert = require('assert');
var Settings = require('../app/settings');
var Controller = require('../app/coordinator/settings-controller');
var ChoiceController = require('../app/coordinator/choice-dialog-controller');

// Only platform rendering and the asynchronous backup boundary are faked. The
// Settings controller, value validation, and both dialog lifecycles are real.
function fixture(model) {
  var stored = {};
  var writes = [];
  var effects = [];
  var nodes = {};
  var requests = [];
  var choices = [];
  var choiceIndex = 0;
  var current = Settings.validate({ uiLanguage: 'en', visualTheme: 'classic', settingsBackupMode: 'off' });
  var storage = {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = String(value); writes.push(key); },
    removeItem: function (key) { delete stored[key]; }
  };
  function node(id) {
    if (!nodes[id]) {
      nodes[id] = {
        id: id, className: '', value: '', attributes: {}, style: { setProperty: function () {} },
        setAttribute: function (key, value) { this.attributes[key] = String(value); },
        getAttribute: function (key) { return this.attributes[key] || ''; },
        focus: function () {}, appendChild: function () {}
      };
    }
    return nodes[id];
  }
  var styles = {};
  var document = {
    body: { className: 'visual-theme-classic' },
    documentElement: { lang: 'en', style: { setProperty: function (key, value) { styles[key] = value; } } },
    getElementById: node, querySelectorAll: function () { return []; }
  };
  var choice = ChoiceController.create({ ChoiceDialogView: { create: function () {
    return {
      open: function (_title, items, selected) {
        choices = items;
        choiceIndex = Math.max(0, items.findIndex(function (item) { return item.value === selected; }));
      },
      close: function () { choices = []; },
      focus: function (index) { choiceIndex = index; },
      snapshot: function () { return { index: choiceIndex }; },
      selected: function () { return choices[choiceIndex] || null; }
    };
  } } });
  var backup = {
    load: function (id, options, callback) { requests.push({ id: id, options: options, callback: callback }); },
    scheduleAutoSave: function () { effects.push('autosave'); }
  };
  var controller = Controller.create({
    platform: { root: { localStorage: storage, setTimeout: setTimeout, clearTimeout: clearTimeout }, document: document },
    modules: {
      InputCommandRouter: require('../app/coordinator/input-command-router'),
      Settings: Settings, SettingsCatalog: require('../app/settings-catalog'),
      SettingsView: require('../app/settings-view'),
      UpNextLayoutDialog: require('../app/up-next-layout-dialog'),
      SafeAreaDialog: require('../app/safe-area-dialog'),
      SubtitleStyleDialog: require('../app/subtitle-style-dialog'),
      TextInputDialog: require('../app/text-input-dialog'),
      I18n: { languageName: function (_language, code) { return code; }, nativeLanguageName: function (code) { return code; } }
    },
    shell: {
      getSettings: function () { return current; },
      setSettings: function (value) { current = value; effects.push('publish'); },
      applyCardScale: function () { effects.push('cards'); },
      translateStaticUi: function () { effects.push('translate'); },
      markHomeDirty: function () { effects.push('home'); },
      applyNavigationVisibility: function () { effects.push('visibility'); },
      renderNavigation: function () { effects.push('navigation'); }
    },
    dialogs: { openChoice: function (title, items, selected, apply, returnFocus, variant, previewOptions, onClose) {
      return choice.open({ title: title, choices: items, selectedValue: selected, apply: apply,
        returnFocus: returnFocus, variant: variant, previewOptions: previewOptions, onClose: onClose });
    } },
    environment: { settingsBackup: backup, playbackCapabilities: function () { return { modelName: model || 'OLED55' }; } }
  });
  return {
    controller: controller, choice: choice, requests: requests, writes: writes, effects: effects,
    styles: styles, document: document, current: function () { return current; },
    pick: function (value) {
      var index = choice.snapshot().choices.findIndex(function (item) { return item.value === value; });
      assert.ok(index >= 0, 'choice is available: ' + value);
      choice.pointerFocus(index); choice.close(true);
    },
    name: function (value) { node('text-input-dialog-field').value = value; node('text-input-dialog-field').oninput(); node('text-input-dialog-apply').onclick(); },
    cancelName: function () { node('text-input-dialog-cancel').onclick(); },
    destroy: function () { controller.destroy(); choice.destroy(); }
  };
}
function status(profiles, currentId) {
  return { exists: profiles.length > 0, profiles: profiles, currentProfile: currentId ? { id: currentId, name: 'Current' } : null };
}
function profile(id, model) { return { id: id || 'living', name: 'Living room', model: model || 'OLED55' }; }
function loaded(mode) { return { settings: Settings.validate({ uiLanguage: 'it', visualTheme: 'immersive', uiTextScale: 115, settingsBackupMode: mode || 'off' }) }; }
var failures = 0;
function test(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}

test('onboarding cancellation completes once without entering Settings or writing', function () {
  var f = fixture(); var completions = [];
  f.controller.promptSettingsLoad(status([profile()]), { confirmFirst: true }, function () { completions.push(Array.from(arguments)); });
  assert.strictEqual(f.controller.snapshot().open, false, 'onboarding does not need an open Settings view');
  f.choice.close(false); f.choice.close(false);
  assert.deepStrictEqual(completions, [[null, null, true]]);
  assert.strictEqual(f.requests.length, 0); assert.strictEqual(f.writes.length, 0);
  f.destroy();
});

test('profile picker cancellation never issues a restore', function () {
  var f = fixture(); var completions = [];
  f.controller.promptSettingsLoad(status([profile('one'), profile('two')]), {}, function () { completions.push(Array.from(arguments)); });
  assert.strictEqual(f.choice.snapshot().title, 'settings.backup.chooseSave');
  f.choice.close(false);
  assert.deepStrictEqual(completions, [[null, null, true]]);
  assert.strictEqual(f.requests.length, 0); f.destroy();
});

test('current identity loads directly and applies live settings before completion', function () {
  var f = fixture(); var calls = 0; var result = loaded('on');
  f.controller.promptSettingsLoad(status([profile()], 'living'), {}, function (error, value, skipped) {
    assert.ifError(error); assert.strictEqual(value, result); assert.strictEqual(skipped, false);
    assert.strictEqual(f.current().uiLanguage, 'it');
    assert.strictEqual(f.document.documentElement.lang, 'it');
    assert.ok(f.document.body.className.indexOf('visual-theme-immersive') >= 0);
    assert.strictEqual(f.styles['--ui-text-scale'], '18.4px');
    assert.deepStrictEqual(f.effects, ['publish', 'cards', 'translate', 'home', 'visibility', 'navigation', 'autosave']);
    calls += 1;
  });
  assert.strictEqual(f.choice.snapshot().open, false);
  assert.deepStrictEqual(f.requests[0].options, { sameDevice: true });
  f.requests[0].callback(null, {}, result);
  assert.strictEqual(calls, 1); assert.ok(f.writes.length > 0); f.destroy();
});

test('matching models ask about physical identity; same-device confirmation is preserved', function () {
  var f = fixture(' oled55 '); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()], 'another'), {}, function () { calls += 1; });
  assert.strictEqual(f.choice.snapshot().title, 'settings.backup.sameDeviceTitle');
  assert.strictEqual(f.requests.length, 0);
  f.pick('same'); assert.deepStrictEqual(f.requests[0].options, { sameDevice: true });
  f.requests[0].callback(null, {}, loaded());
  assert.strictEqual(calls, 1); assert.strictEqual(f.effects.indexOf('autosave'), -1); f.destroy();
});

test('other-device name cancellation does not restore or change identity', function () {
  var f = fixture('OLED42'); var completions = [];
  f.controller.promptSettingsLoad(status([profile()]), {}, function () { completions.push(Array.from(arguments)); });
  assert.strictEqual(f.choice.snapshot().open, false, 'different known models skip same-device confirmation');
  assert.strictEqual(f.controller.snapshot().textInputOpen, true);
  f.cancelName(); f.cancelName();
  assert.deepStrictEqual(completions, [[null, null, true]]);
  assert.strictEqual(f.requests.length, 0); assert.strictEqual(f.writes.length, 0); f.destroy();
});

test('other-device import retains the selected save and explicit new device name', function () {
  var f = fixture('OLED42'); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()]), {}, function (error) { assert.ifError(error); calls += 1; });
  f.name('Bedroom TV');
  assert.strictEqual(f.requests[0].id, 'living');
  assert.deepStrictEqual(f.requests[0].options, { sameDevice: false, deviceName: 'Bedroom TV' });
  f.requests[0].callback(null, {}, loaded());
  assert.strictEqual(calls, 1); assert.strictEqual(f.current().uiLanguage, 'it'); f.destroy();
});

test('load errors reach the caller without local save or presentation changes', function () {
  var f = fixture(); var completions = []; var error = new Error('offline');
  f.controller.promptSettingsLoad(status([profile()], 'living'), {}, function () { completions.push(Array.from(arguments)); });
  f.requests[0].callback(error);
  assert.deepStrictEqual(completions, [[error, null, false]]);
  assert.strictEqual(f.writes.length, 0); assert.strictEqual(f.effects.length, 0); f.destroy();
});

test('teardown suppresses real name-dialog cancellation callbacks', function () {
  var f = fixture('OLED42'); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()]), {}, function () { calls += 1; });
  assert.strictEqual(f.controller.snapshot().textInputOpen, true);
  f.destroy(); f.destroy();
  assert.strictEqual(calls, 0, 'destroy is not user cancellation and must not resume onboarding');
  assert.strictEqual(f.requests.length, 0);
});

test('late restore completion cannot save, publish, or resume a destroyed Settings owner', function () {
  var f = fixture(); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()], 'living'), {}, function () { calls += 1; });
  f.destroy();
  f.requests[0].callback(null, {}, loaded('on'));
  assert.strictEqual(f.writes.length, 0, 'late results must not write Settings');
  assert.strictEqual(f.effects.length, 0, 'late results must not publish or schedule autosave');
  assert.strictEqual(calls, 0);
});

test('destroyed Settings rejects new restore prompts', function () {
  var f = fixture(); var calls = 0;
  f.destroy();
  assert.strictEqual(f.controller.promptSettingsLoad(status([profile()], 'living'), {}, function () { calls += 1; }), false);
  assert.strictEqual(f.requests.length, 0); assert.strictEqual(calls, 0);
});

test('duplicate restore completions apply Settings and notify the caller only once', function () {
  var f = fixture(); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()], 'living'), {}, function () { calls += 1; });
  f.requests[0].callback(null, {}, loaded('on'));
  var writes = f.writes.length; var effects = f.effects.slice();
  f.requests[0].callback(null, {}, loaded('on'));
  assert.strictEqual(calls, 1); assert.strictEqual(f.writes.length, writes);
  assert.deepStrictEqual(f.effects, effects); f.destroy();
});

test('a retained same-device choice cannot start work after Settings teardown', function () {
  var f = fixture(); var calls = 0;
  f.controller.promptSettingsLoad(status([profile()], 'another'), {}, function () { calls += 1; });
  f.controller.destroy(); f.pick('same');
  assert.strictEqual(f.requests.length, 0); assert.strictEqual(calls, 0); f.destroy();
});

test('a retained saved-profile picker cannot reopen UI after Settings teardown', function () {
  var f = fixture('OLED42'); var calls = 0;
  f.controller.promptSettingsLoad(status([profile('one'), profile('two')]), {}, function () { calls += 1; });
  f.controller.destroy(); f.pick('one');
  assert.strictEqual(f.controller.snapshot().textInputOpen, false);
  assert.strictEqual(f.requests.length, 0); assert.strictEqual(calls, 0); f.destroy();
});

if (failures) { process.exitCode = 1; }
else { console.log('Settings backup interaction checks passed'); }

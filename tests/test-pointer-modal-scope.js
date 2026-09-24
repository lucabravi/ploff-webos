'use strict';

var assert = require('assert');
var PointerController = require('../app/coordinator/pointer-controller');

function node(tagName, className, attributes, parent) {
  var attrs = attributes || {};
  var current = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    className: className || '',
    parentNode: parent || null,
    children: [],
    disabled: false,
    onclick: null,
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    getAttribute: function (name) { return attrs[name]; },
    contains: function (target) {
      var item = target;
      while (item) {
        if (item === current) { return true; }
        item = item.parentNode;
      }
      return false;
    }
  };
  if (parent && parent.children) { parent.children.push(current); }
  return current;
}

function pointerEvent(target, calls) {
  return {
    target: target,
    preventDefault: function () { calls.push('prevent'); },
    stopPropagation: function () { calls.push('stop'); },
    stopImmediatePropagation: function () { calls.push('stop-immediate'); }
  };
}

var body = node('body');
var nav = node('button', 'nav-item', { 'data-nav-index': '2' }, body);
var choice = node('div', 'choice-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-hidden': 'false' }, body);
choice.zIndex = 140;
var choicePanel = node('div', 'choice-dialog-panel', {}, choice);
var choiceButton = node('button', 'choice-dialog-option', { 'data-choice-index': '0' }, choicePanel);
var playerSettings = node('div', 'player-settings', { role: 'dialog', 'aria-modal': 'true', 'aria-hidden': 'true' }, body);
playerSettings.zIndex = 20;
var playerSetting = node('button', 'setting-row', { 'data-setting': 'audio' }, playerSettings);
var dialogs = [choice, playerSettings];
var document = {
  querySelectorAll: function (selector) {
    return selector === '[role="dialog"][aria-modal="true"]' ? dialogs : [];
  },
  getElementById: function () { return null; }
};
var calls = [];
var keyCodes = [];
var pressCodes = [];
var focusCalls = [];
var controller = PointerController.create({
  root: {
    innerHeight: 1000,
    getComputedStyle: function (element) { return { zIndex: String(element.zIndex || 0) }; }
  },
  document: document,
  sessionSnapshot: function () { return { appView: 'settings', choiceDialogOpen: true, navigationHasFocus: false }; },
  inputKey: function (event) { keyCodes.push(event.keyCode); },
  inputPress: function (event) { pressCodes.push(event.keyCode); },
  capture: { click: function () { return false; }, focus: function () { return false; } },
  focus: {
    navigation: function (index) { focusCalls.push('nav:' + index); },
    choice: function (index) { focusCalls.push('choice:' + index); },
    player: function () { focusCalls.push('player'); }
  },
  contextMenu: {}, navigation: {}, page: {}, player: {}
});

assert.strictEqual(controller.syncFocus(nav), false, 'pointer focus must remain scoped to the active modal');
assert.deepStrictEqual(focusCalls, [], 'hover/focus outside the modal must not move logical focus behind it');
controller.handleClick(pointerEvent(nav, calls));
assert.deepStrictEqual(keyCodes, [461], 'clicking the navbar outside an open modal must route the same semantic Back key');
assert.deepStrictEqual(pressCodes, [], 'the click consumed by the modal must not activate the navbar');
assert.deepStrictEqual(focusCalls, [], 'the click consumed by the modal must not move logical focus behind it');
assert.ok(calls.indexOf('prevent') >= 0 && calls.indexOf('stop-immediate') >= 0, 'outside modal clicks must consume the native event before it reaches the background target');

calls.length = 0;
keyCodes.length = 0;
controller.handleClick(pointerEvent(choice, calls));
assert.deepStrictEqual(keyCodes, [461], 'clicking the full-screen modal backdrop must use Back semantics');
assert.deepStrictEqual(pressCodes, [], 'backdrop dismissal must not synthesize OK');

calls.length = 0;
keyCodes.length = 0;
controller.handleClick(pointerEvent(choiceButton, calls));
assert.deepStrictEqual(keyCodes, [], 'clicking inside modal content must not dismiss it');
assert.deepStrictEqual(pressCodes, [13], 'clicking a modal action must keep normal semantic OK activation');
assert.ok(focusCalls.indexOf('choice:0') >= 0, 'modal actions must retain their own focus routing');

choice.getAttribute = function (name) { return name === 'aria-hidden' ? 'true' : (name === 'aria-modal' ? 'true' : (name === 'role' ? 'dialog' : null)); };
choice.className = 'choice-dialog is-hidden';
controller.handleClick(pointerEvent(nav, calls));
assert.deepStrictEqual(pressCodes, [13, 13], 'when no modal is visible, navbar clicks must keep normal OK activation');
assert.ok(focusCalls.indexOf('nav:2') >= 0, 'when no modal is visible, navbar clicks must focus normally');

choice.className = 'choice-dialog';
choice.getAttribute = function (name) { return name === 'aria-hidden' ? 'false' : (name === 'aria-modal' ? 'true' : (name === 'role' ? 'dialog' : null)); };
playerSettings.className = 'player-settings';
playerSettings.getAttribute = function (name) { return name === 'aria-hidden' ? 'false' : (name === 'aria-modal' ? 'true' : (name === 'role' ? 'dialog' : null)); };
playerSettings.zIndex = 20;
keyCodes.length = 0;
var pressesBeforeUnderlying = pressCodes.length;
controller.handleClick(pointerEvent(playerSetting, calls));
assert.deepStrictEqual(keyCodes, [461], 'when modals overlap, a click on a lower modal must dismiss only the top modal through Back');
assert.strictEqual(pressCodes.length, pressesBeforeUnderlying, 'underlying modal controls must not activate through the top modal');

console.log('Pointer modal scope tests passed');

'use strict';

var assert = require('assert');
var SetupFocus = require('../app/setup-focus');
var buttons = [{ className: 'setup-action' }, { className: 'setup-action is-focused' }, { className: 'setup-action' }];
buttons.forEach(function (button) { button.focus = function () { this.focused = true; }; });
var focus = SetupFocus.create({
  buttons: function () { return buttons; },
  isPointerSelectionActive: function () { return false; }
});
assert.strictEqual(focus.apply(8), 2, 'focus must clamp to the final setup action');
assert.strictEqual(buttons[2].className, 'setup-action is-focused', 'the selected action must receive the standard focus class');
assert.strictEqual(buttons[2].focused, true, 'remote navigation must move DOM focus');
assert.strictEqual(focus.apply(-1), 0, 'focus must clamp to the first setup action');
console.log('Setup focus checks passed');

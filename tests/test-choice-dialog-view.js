'use strict';

var assert = require('assert');
var ChoiceDialogView = require('../app/choice-dialog-view');

function node() {
  var value = {
    className: '', textContent: '', children: [], attributes: {},
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    appendChild: function (child) { this.children.push(child); },
    focus: function () { this.focused = true; }, scrollIntoView: function () {}
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () { this.children = []; }
  });
  return value;
}
var nodes = { 'choice-dialog': node(), 'choice-dialog-title': node(), 'choice-dialog-list': node(), 'choice-dialog-cancel': node() };
var documentRef = {
  getElementById: function (id) { return nodes[id]; },
  createElement: function () { return node(); }
};
var view = ChoiceDialogView.create({ document: documentRef, t: function (key) { return key === 'common.cancel' ? 'Cancel' : key; } });
view.open('Audio', [{ value: 'a', label: 'English' }, { value: 'b', label: 'Japanese (AC3 5.1)', color: '#a66cff' }], 'b');
assert.strictEqual(view.snapshot().index, 1, 'opening the reusable picker must focus the current value');
assert.strictEqual(nodes['choice-dialog-list'].children[1].className, 'choice-dialog-option is-selected is-focused', 'the applied option must also receive the initial focus');
assert.strictEqual(nodes['choice-dialog-list'].children[1].attributes['aria-selected'], 'true', 'the applied option must expose its selected state');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].className, 'choice-dialog-swatch', 'color choices must render a reusable swatch icon');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].style.backgroundColor, '#a66cff', 'the picker swatch must use the choice color');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[1].textContent, 'Japanese (AC3 5.1)', 'swatch choices must retain their complete text label');
view.move(-1);
assert.strictEqual(view.selected().value, 'a', 'remote navigation must move through choices');
assert.strictEqual(nodes['choice-dialog-list'].children[0].className, 'choice-dialog-option is-focused', 'moving focus must not apply the highlighted option');
assert.strictEqual(nodes['choice-dialog-list'].children[1].className, 'choice-dialog-option is-selected', 'the applied option must remain marked while focus moves');
var pointerTarget = nodes['choice-dialog-list'].children[1];
view.focus(1);
assert.strictEqual(view.selected().value, 'b', 'pointer focus must select an option without applying it');
assert.strictEqual(nodes['choice-dialog-list'].children[1], pointerTarget, 'pointer focus must preserve the hovered DOM target until click completes');
assert.strictEqual(nodes['choice-dialog-list'].children[0].className, 'choice-dialog-option', 'pointer focus must clear the previous focus without rebuilding choices');
assert.strictEqual(pointerTarget.className, 'choice-dialog-option is-selected is-focused', 'pointer focus must update focus classes in place');
view.focus(2);
assert.strictEqual(view.selected(), null, 'the visible Cancel action must not expose an applied choice');
assert.strictEqual(nodes['choice-dialog-cancel'].className, 'is-focused', 'Cancel must participate in remote and pointer focus');
assert.strictEqual(nodes['choice-dialog-cancel'].textContent, 'Cancel', 'Cancel must be localized by the shared dialog');
view.close();
assert.ok(/is-hidden/.test(nodes['choice-dialog'].className), 'closing the picker must hide its shared dialog');
assert.strictEqual(nodes['choice-dialog'].attributes['aria-hidden'], 'true', 'closing the picker must hide it from accessibility APIs');
view.open('Exit Ploff', [{ value: 'exit', label: 'Exit' }], 'exit', 'full-screen');
assert.ok(/is-full-screen/.test(nodes['choice-dialog'].className), 'the exit confirmation must support the full-screen shared dialog presentation');
view.close();

console.log('Choice dialog view checks passed');

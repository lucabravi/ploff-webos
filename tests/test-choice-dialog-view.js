'use strict';

var assert = require('assert');
var ChoiceDialogView = require('../app/choice-dialog-view');

function node() {
  return {
    className: '', textContent: '', innerHTML: '', children: [], attributes: {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    appendChild: function (child) { this.children.push(child); },
    focus: function () { this.focused = true; }, scrollIntoView: function () {}
  };
}
var nodes = { 'choice-dialog': node(), 'choice-dialog-title': node(), 'choice-dialog-list': node() };
var documentRef = {
  getElementById: function (id) { return nodes[id]; },
  createElement: function () { return node(); }
};
var view = ChoiceDialogView.create({ document: documentRef });
view.open('Audio', [{ value: 'a', label: 'English' }, { value: 'b', label: 'Japanese (AC3 5.1)', color: '#a66cff' }], 'b');
assert.strictEqual(view.snapshot().index, 1, 'opening the reusable picker must focus the current value');
assert.strictEqual(nodes['choice-dialog-list'].children[1].className, 'choice-dialog-option is-focused', 'the selected option must have one visible focus target');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].className, 'choice-dialog-swatch', 'color choices must render a reusable swatch icon');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[0].style.backgroundColor, '#a66cff', 'the picker swatch must use the choice color');
assert.strictEqual(nodes['choice-dialog-list'].children[1].children[1].textContent, 'Japanese (AC3 5.1)', 'swatch choices must retain their complete text label');
view.move(-1);
assert.strictEqual(view.selected().value, 'a', 'remote navigation must move through choices');
view.focus(1);
assert.strictEqual(view.selected().value, 'b', 'pointer focus must select an option without applying it');
view.close();
assert.ok(/is-hidden/.test(nodes['choice-dialog'].className), 'closing the picker must hide its shared dialog');

console.log('Choice dialog view checks passed');

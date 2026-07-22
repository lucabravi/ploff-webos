'use strict';

var assert = require('assert');
var ServerEditorView = require('../app/server-editor-view');
var nodes = { list: { innerHTML: '', children: [], appendChild: function (node) { this.children.push(node); } } };
var view = ServerEditorView.create({
  document: { getElementById: function () { return nodes.list; } },
  t: function (key) { return key; },
  element: function (tag, className, text) { return { tagName: tag, className: className, textContent: text || '', children: [], setAttribute: function (key, value) { this[key] = value; }, appendChild: function (node) { this.children.push(node); }, focus: function () { this.focused = true; } }; },
  appendAddresses: function (row, addresses) { row.addresses = addresses; },
  keepFocusVisible: function () {},
  isPointerSelectionActive: function () { return false; }
});
view.open();
assert.deepStrictEqual(view.snapshot(), { open: true, index: 0 }, 'server editor must own its open and focus state');
view.focus(8, 4);
assert.strictEqual(view.snapshot().index, 3, 'server editor focus must clamp to its rendered row count');
view.close();
assert.deepStrictEqual(view.snapshot(), { open: false, index: 0 }, 'closing the server editor must reset its private focus');
view.open();
view.render({
  activeUri: 'http://one:32400', open: true, index: 2,
  servers: [{ name: 'One', uri: 'http://one:32400' }, { name: 'Two', uri: 'http://two:32400' }],
  addressesFor: function (server) { return [{ uri: server.uri }]; }
});
assert.strictEqual(nodes.list.children.length, 4, 'server editor must include scan, manual entry, and every saved server');
assert.strictEqual(nodes.list.children[2].textContent, '\u2713 One', 'active server must retain its checkmark');
assert.strictEqual(nodes.list.children[2].className, 'server-editor-row is-focused', 'stored server focus must remain index-based');
assert.strictEqual(nodes.list.children[3].addresses[0].uri, 'http://two:32400', 'each server must retain its rendered route list');

console.log('Server editor view checks passed');

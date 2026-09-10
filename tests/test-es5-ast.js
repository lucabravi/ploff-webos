'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var helper = path.join(__dirname, '../scripts/lib/es5-ast.js');
assert.ok(fs.existsSync(helper), 'architecture checkers must share their identical ES5 AST mechanics');
var Ast = require(helper);

var tree = Ast.parse('this.player["pause"](); var values = [null, { default: true }];', 'fixture.js');
assert.strictEqual(tree.loc.source, 'fixture.js', 'parser locations must retain the diagnostic filename');
assert.strictEqual(tree.loc.start.line, 1);
assert.throws(function () { Ast.parse('const value = 1;', 'modern.js'); }, SyntaxError,
  'shared parsing must continue to reject non-ES5 syntax');
assert.throws(function () { Ast.parse('var value = () => 1;', 'modern.js'); }, SyntaxError);

var visits = [];
Ast.walk(tree, null, function (node, parent) {
  visits.push([node.type, parent && parent.type]);
});
assert.deepStrictEqual(visits[0], ['Program', null]);
assert.deepStrictEqual(visits[1], ['ExpressionStatement', 'Program']);
assert.ok(visits.some(function (entry) { return entry[0] === 'Literal' && entry[1] === 'Property'; }),
  'walker must descend through object/array children while preserving parents');
Ast.walk(null, null, function () { assert.fail('null is not an AST node'); });

var member = tree.body[0].expression.callee;
assert.strictEqual(Ast.memberProperty(member), 'pause');
assert.deepStrictEqual(Ast.memberPath(member), ['this', 'player', 'pause']);
assert.deepStrictEqual(Ast.memberPath(Ast.parse('owner[dynamic].method;', '').body[0].expression), [],
  'a computed identifier is not a known static member path');
assert.deepStrictEqual(Ast.memberPath(Ast.parse('factory().method;', '').body[0].expression), [],
  'a call expression must not be mistaken for a static owner');
assert.strictEqual(Ast.memberProperty(null), '');
assert.deepStrictEqual(Ast.memberPath(null), []);
assert.deepStrictEqual(Ast.memberPath(Ast.parse('owner[0];', '').body[0].expression), ['owner', '0']);
console.log('Shared ES5 AST checks passed');

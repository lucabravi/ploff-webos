'use strict';

var assert = require('assert');
var vm = require('vm');
var Minifier = require('../scripts/minify-javascript');

var source = [
  "'use strict';",
  'function namedFunction(longArgument) {',
  '  var object = { longPropertyName: longArgument + 1 };',
  '  return object.longPropertyName;',
  '}',
  'var result = namedFunction(4);'
].join('\n');
var minified = Minifier.minifySource(source);
var originalContext = {};
var minifiedContext = {};

vm.runInNewContext(source, originalContext);
vm.runInNewContext(minified, minifiedContext);
assert.strictEqual(minifiedContext.result, originalContext.result, 'minification must preserve runtime behavior');
assert.strictEqual(Minifier.syntaxFingerprint(minified), Minifier.syntaxFingerprint(source), 'minification must preserve the ECMAScript 5 syntax tree');
assert.ok(minified.length < source.length, 'minification must reduce runtime bytes');
assert.ok(minified.indexOf('function namedFunction') !== -1, 'function names must remain stable');
assert.ok(minified.indexOf('.longPropertyName') !== -1, 'property names must never be mangled');
assert.strictEqual(Minifier.minifySource(source), minified, 'minification must be deterministic');

var restricted = 'function value() { return\n42; }\nvar first = 1;\n++first;\n';
var restrictedMinified = Minifier.minifySource(restricted);
assert.strictEqual(Minifier.syntaxFingerprint(restrictedMinified), Minifier.syntaxFingerprint(restricted), 'restricted productions and update expressions must preserve line boundaries');
assert.ok(/return\n42/.test(restrictedMinified), 'return followed by a line terminator must remain separated');

var lexical = 'var ratio = 10 / 2;\nvar pattern = /a\\/b/g;\nvar sum = 1 + +ratio;\n';
var lexicalMinified = Minifier.minifySource(lexical);
assert.strictEqual(Minifier.syntaxFingerprint(lexicalMinified), Minifier.syntaxFingerprint(lexical), 'division, regular expressions, and adjacent operators must remain unambiguous');
assert.ok(lexicalMinified.indexOf('+ +') !== -1, 'adjacent plus tokens must remain separated');

assert.throws(function () {
  Minifier.minifySource('#!/usr/bin/env node\nvar value = 1;\n');
}, /hashbang/, 'runtime bundles must reject unsupported hashbang input');

console.log('JavaScript minifier checks passed');

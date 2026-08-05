'use strict';

var acorn = require('acorn');

var PARSE_OPTIONS = {
  allowHashBang: true,
  ecmaVersion: 5,
  sourceType: 'script'
};

function normalizeAst(value) {
  var result;
  if (value === null || typeof value !== 'object') { return value; }
  if (Array.isArray(value)) { return value.map(normalizeAst); }
  result = {};
  Object.keys(value).sort().forEach(function (key) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw') { return; }
    result[key] = normalizeAst(value[key]);
  });
  return result;
}

function syntaxFingerprint(source) {
  return JSON.stringify(normalizeAst(acorn.parse(source, PARSE_OPTIONS)));
}

function hasLineTerminator(value) {
  return /[\r\n\u2028\u2029]/.test(value);
}

function needsSeparator(previous, current) {
  var left = previous.charAt(previous.length - 1);
  var right = current.charAt(0);
  if (/[A-Za-z0-9_$]/.test(left) && /[A-Za-z0-9_$]/.test(right)) { return true; }
  if ((left === '+' && right === '+') || (left === '-' && right === '-')) { return true; }
  if (left === '/' && (right === '/' || right === '*')) { return true; }
  if (/\d/.test(left) && right === '.') { return true; }
  if (left === '.' && /\d/.test(right)) { return true; }
  return false;
}

function requiresLineTerminator(previous, current, gap) {
  if (!hasLineTerminator(gap)) { return false; }
  return previous.type.label === 'return' ||
    previous.type.label === 'throw' ||
    previous.type.label === 'break' ||
    previous.type.label === 'continue' ||
    previous.type.label === '++/--' ||
    current.type.label === '++/--';
}

function tokenizeSource(source, preserveLines) {
  var tokenizer = acorn.tokenizer(source, PARSE_OPTIONS);
  var output = '';
  var previous = null;
  var token;
  var raw;
  var gap;
  while ((token = tokenizer.getToken()).type.label !== 'eof') {
    raw = source.slice(token.start, token.end);
    if (previous) {
      gap = source.slice(previous.end, token.start);
      if (hasLineTerminator(gap) && (preserveLines || requiresLineTerminator(previous, token, gap))) {
        output += '\n';
      } else if (needsSeparator(source.slice(previous.start, previous.end), raw)) {
        output += ' ';
      }
    }
    output += raw;
    previous = token;
  }
  return output + '\n';
}

function minifySource(source) {
  var value = String(source || '');
  var expected;
  var minified;
  if (/^#!/.test(value)) { throw new Error('Runtime bundle minification does not support hashbang input'); }
  expected = syntaxFingerprint(value);
  minified = tokenizeSource(value, false);
  if (syntaxFingerprint(minified) === expected) { return minified; }
  minified = tokenizeSource(value, true);
  if (syntaxFingerprint(minified) !== expected) {
    throw new Error('Runtime bundle minification changed the ECMAScript 5 syntax tree');
  }
  return minified;
}

module.exports = {
  minifySource: minifySource,
  needsSeparator: needsSeparator,
  syntaxFingerprint: syntaxFingerprint,
  tokenizeSource: tokenizeSource
};

'use strict';

var acorn = require('acorn');

function parse(source, fileName) {
  return acorn.parse(source, {
    ecmaVersion: 5,
    locations: true,
    sourceFile: fileName || '',
    allowReserved: true
  });
}

function walk(node, parent, visit) {
  var key;
  var value;
  var index;
  if (!node || typeof node.type !== 'string') { return; }
  visit(node, parent || null);
  for (key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key) || key === 'loc' || key === 'start' || key === 'end') { continue; }
    value = node[key];
    if (value && typeof value.type === 'string') { walk(value, node, visit); }
    else if (Object.prototype.toString.call(value) === '[object Array]') {
      for (index = 0; index < value.length; index += 1) {
        if (value[index] && typeof value[index].type === 'string') { walk(value[index], node, visit); }
      }
    }
  }
}

function memberProperty(node) {
  if (!node || node.type !== 'MemberExpression') { return ''; }
  if (!node.computed && node.property && node.property.type === 'Identifier') { return node.property.name; }
  if (node.computed && node.property && node.property.type === 'Literal') { return String(node.property.value); }
  return '';
}

function memberPath(node) {
  var prefix;
  var property;
  if (!node) { return []; }
  if (node.type === 'Identifier') { return [node.name]; }
  if (node.type === 'ThisExpression') { return ['this']; }
  if (node.type !== 'MemberExpression') { return []; }
  prefix = memberPath(node.object);
  property = memberProperty(node);
  if (!prefix.length || !property) { return []; }
  prefix.push(property);
  return prefix;
}

module.exports = { parse: parse, walk: walk, memberProperty: memberProperty, memberPath: memberPath };

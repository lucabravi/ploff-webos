'use strict';

var fs = require('fs');
var path = require('path');
var acorn = require('acorn');

var FEATURES = [
  { name: 'shell', file: 'app/coordinator/shell-feature-controller.js', variable: 'shellFeature' },
  { name: 'server', file: 'app/coordinator/server-feature-controller.js', variable: 'serverFeature' },
  { name: 'search', file: 'app/coordinator/search-feature-controller.js', variable: 'searchFeature' },
  { name: 'library', file: 'app/coordinator/library-feature-controller.js', variable: 'libraryFeature' },
  { name: 'detail', file: 'app/coordinator/detail-feature-controller.js', variable: 'detailFeature' },
  { name: 'player', file: 'app/coordinator/player-feature-controller.js', variable: 'playerFeature' },
  { name: 'settings', file: 'app/coordinator/settings-feature-controller.js', variable: 'settingsFeature' },
  { name: 'setup', file: 'app/coordinator/setup-feature-controller.js', variable: 'setupFeature' },
  { name: 'diagnostics', file: 'app/coordinator/diagnostics-feature-controller.js', variable: 'diagnosticsFeature' }
];

function parse(source, fileName) {
  return acorn.parse(source, { ecmaVersion: 5, sourceType: 'script', allowHashBang: true, locations: true, sourceFile: fileName || 'source.js' });
}

function walk(node, visitor) {
  var key;
  var value;
  var index;
  if (!node || typeof node.type !== 'string') { return; }
  visitor(node);
  for (key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key) || key === 'loc' || key === 'start' || key === 'end') { continue; }
    value = node[key];
    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (index = 0; index < value.length; index += 1) { walk(value[index], visitor); }
    } else if (value && typeof value.type === 'string') {
      walk(value, visitor);
    }
  }
}

function propertyName(property) {
  if (!property || property.type !== 'Property') { return ''; }
  if (!property.computed && property.key.type === 'Identifier') { return property.key.name; }
  if (property.key.type === 'Literal') { return String(property.key.value); }
  return '';
}

function objectMethods(objectExpression) {
  var methods = [];
  if (!objectExpression || objectExpression.type !== 'ObjectExpression') { return methods; }
  objectExpression.properties.forEach(function (property) {
    var name = propertyName(property);
    if (name) { methods.push(name); }
  });
  return methods.sort();
}

function exportedMethods(source, fileName) {
  var ast = parse(source, fileName);
  var creates = [];
  var candidates = [];
  walk(ast, function (node) {
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === 'create') { creates.push(node); }
  });
  creates.forEach(function (createNode) {
    var assigned = {};
    createNode.body.body.forEach(function (statement) {
      var expression;
      var left;
      if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
        expression = statement.expression;
        left = expression.left;
        if (left && left.type === 'Identifier' && expression.right && expression.right.type === 'ObjectExpression') {
          assigned[left.name] = expression.right;
        }
      }
      if (statement.type === 'ReturnStatement' && statement.argument) {
        if (statement.argument.type === 'ObjectExpression') { candidates.push(statement.argument); }
        else if (statement.argument.type === 'Identifier' && assigned[statement.argument.name]) { candidates.push(assigned[statement.argument.name]); }
      }
    });
  });
  candidates.sort(function (left, right) { return right.properties.length - left.properties.length; });
  return objectMethods(candidates[0]);
}

function memberUses(source, variableName, fileName) {
  var ast = parse(source, fileName);
  var uses = {};
  walk(ast, function (node) {
    var name = '';
    if (node.type !== 'MemberExpression' || !node.object || node.object.type !== 'Identifier' || node.object.name !== variableName) { return; }
    if (!node.computed && node.property.type === 'Identifier') { name = node.property.name; }
    else if (node.computed && node.property.type === 'Literal') { name = String(node.property.value); }
    if (name) { uses[name] = true; }
  });
  return Object.keys(uses).sort();
}

function runtimeFiles(rootDirectory) {
  var result = [];
  function visit(directory) {
    fs.readdirSync(directory).sort().forEach(function (name) {
      var full = path.join(directory, name);
      var relative = path.relative(rootDirectory, full).replace(/\\/g, '/');
      var stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (name === 'vendor' || name === 'node_modules' || name === 'dist' || name === 'build') { return; }
        visit(full);
      } else if (/\.js$/.test(name) && relative !== 'app/app.js') {
        result.push(full);
      }
    });
  }
  visit(path.join(rootDirectory, 'app'));
  return result;
}

function readContracts(rootDirectory) {
  var file = path.join(rootDirectory, 'scripts/feature-contracts.json');
  if (!fs.existsSync(file)) { return {}; }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function difference(left, right) {
  return left.filter(function (value) { return right.indexOf(value) === -1; });
}

function analyzeProject(rootDirectory) {
  var files = runtimeFiles(rootDirectory);
  var contracts = readContracts(rootDirectory);
  var report = { features: {}, unused: [], undeclared: [], contractDrift: [] };
  FEATURES.forEach(function (feature) {
    var featurePath = path.join(rootDirectory, feature.file);
    var exports = exportedMethods(fs.readFileSync(featurePath, 'utf8'), feature.file);
    var usedMap = { destroy: true };
    var used;
    var declared = contracts[feature.name] || exports.slice();
    files.forEach(function (file) {
      if (file === featurePath) { return; }
      memberUses(fs.readFileSync(file, 'utf8'), feature.variable, path.relative(rootDirectory, file)).forEach(function (name) { usedMap[name] = true; });
    });
    used = Object.keys(usedMap).sort();
    difference(exports, used).forEach(function (name) { report.unused.push(feature.name + '.' + name); });
    difference(used, exports).forEach(function (name) { report.undeclared.push(feature.name + '.' + name); });
    difference(exports, declared).forEach(function (name) { report.contractDrift.push(feature.name + '.unexpected:' + name); });
    difference(declared, exports).forEach(function (name) { report.contractDrift.push(feature.name + '.missing:' + name); });
    report.features[feature.name] = { exports: exports, used: used, declared: declared.slice().sort() };
  });
  report.unused.sort();
  report.undeclared.sort();
  report.contractDrift.sort();
  return report;
}

function formatReport(report) {
  var lines = [];
  Object.keys(report.features).sort().forEach(function (name) {
    var feature = report.features[name];
    lines.push(name + ': ' + feature.exports.length + ' public methods, ' + feature.used.length + ' production/lifecycle consumers');
  });
  if (report.unused.length) { lines.push('Unused: ' + report.unused.join(', ')); }
  if (report.undeclared.length) { lines.push('Undeclared uses: ' + report.undeclared.join(', ')); }
  if (report.contractDrift.length) { lines.push('Contract drift: ' + report.contractDrift.join(', ')); }
  return lines.join('\n');
}

if (require.main === module) {
  var project = path.join(__dirname, '..');
  var report = analyzeProject(project);
  console.log(formatReport(report));
  if (report.unused.length || report.undeclared.length || report.contractDrift.length) { process.exitCode = 1; }
}

module.exports = {
  FEATURES: FEATURES,
  analyzeProject: analyzeProject,
  exportedMethods: exportedMethods,
  formatReport: formatReport,
  memberUses: memberUses
};

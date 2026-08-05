'use strict';

var acorn = require('acorn');
var fs = require('fs');
var path = require('path');

function collectJavaScript(directory, files) {
  if (!fs.existsSync(directory)) { return files; }
  fs.readdirSync(directory).sort().forEach(function (name) {
    var file = path.join(directory, name);
    var stat = fs.statSync(file);
    if (stat.isDirectory()) { collectJavaScript(file, files); }
    else if (/\.js$/.test(name)) { files.push(file); }
  });
  return files;
}

function collectRuntimeFiles(projectRoot) {
  var files = [];
  collectJavaScript(path.join(projectRoot, 'app'), files);
  collectJavaScript(path.join(projectRoot, 'webos-service'), files);
  return files.sort();
}

function walk(node, callback) {
  var key;
  var value;
  var index;
  if (!node || typeof node !== 'object') { return; }
  callback(node);
  for (key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key) || key === 'loc' || key === 'start' || key === 'end') { continue; }
    value = node[key];
    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (index = 0; index < value.length; index += 1) { walk(value[index], callback); }
    } else if (value && typeof value === 'object') { walk(value, callback); }
  }
}

function assertRuntimeApis(ast, filename) {
  walk(ast, function (node) {
    if (node.type === 'Identifier' && node.name === 'Promise') {
      var contractError = new Error(String(filename || '<runtime>') + ':' + node.loc.start.line + ':' + (node.loc.start.column + 1) +
        ' uses Promise, which is forbidden in the Chrome 53 runtime contract');
      contractError.runtimeContract = true;
      throw contractError;
    }
  });
}

function parseSource(source, filename) {
  var ast;
  try {
    ast = acorn.parse(String(source || ''), {
      ecmaVersion: 5,
      sourceType: 'script',
      locations: true
    });
    assertRuntimeApis(ast, filename);
  } catch (error) {
    if (error && error.runtimeContract) { throw error; }
    var location = error && error.loc || { line: 0, column: 0 };
    var wrapped = new Error(
      String(filename || '<runtime>') + ':' + location.line + ':' + (location.column + 1) +
      ' is not valid ECMAScript 5: ' + String(error && error.message || error)
    );
    wrapped.originalError = error;
    throw wrapped;
  }
  return true;
}

function checkFiles(files) {
  (files || []).forEach(function (file) {
    parseSource(fs.readFileSync(file, 'utf8'), file);
  });
  return (files || []).length;
}

function run(projectRoot) {
  var root = projectRoot || path.join(__dirname, '..');
  var files = collectRuntimeFiles(root);
  checkFiles(files);
  process.stdout.write('Runtime ECMAScript 5 parsing passed (' + files.length + ' files)\n');
  return files.length;
}

if (require.main === module) {
  try { run(process.argv[2]); }
  catch (error) {
    process.stderr.write(String(error && error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  checkFiles: checkFiles,
  collectRuntimeFiles: collectRuntimeFiles,
  parseSource: parseSource,
  run: run
};

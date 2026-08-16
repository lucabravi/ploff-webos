'use strict';

var fs = require('fs');
var path = require('path');
var ThemeRegistry = require('../app/theme-registry');
var REQUIRED_THEME_TOKENS = [
  '--theme-app-background', '--theme-app-text', '--theme-scroll-track', '--theme-scroll-thumb',
  '--theme-backdrop-shade', '--theme-media-card-surface', '--theme-card-caption-surface', '--theme-corner-radius'
];

function stripComments(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function matchingBrace(source, start) {
  var depth = 0;
  var quote = '';
  var index;
  var character;
  for (index = start; index < source.length; index += 1) {
    character = source.charAt(index);
    if (quote) {
      if (character === '\\') { index += 1; }
      else if (character === quote) { quote = ''; }
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') { depth += 1; }
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) { return index; }
    }
  }
  return -1;
}

function validateBlock(theme, source, errors) {
  var cursor = 0;
  var open;
  var close;
  var prelude;
  var selectors;
  var index;
  while (cursor < source.length) {
    open = source.indexOf('{', cursor);
    if (open === -1) { break; }
    prelude = source.slice(cursor, open).replace(/^\s+|\s+$/g, '');
    close = matchingBrace(source, open);
    if (close === -1) {
      errors.push('Unclosed CSS block: ' + prelude);
      return;
    }
    if (prelude.charAt(0) === '@') {
      if (/^@(media|supports|document)\b/.test(prelude)) {
        validateBlock(theme, source.slice(open + 1, close), errors);
      }
    } else if (prelude) {
      selectors = prelude.split(',');
      for (index = 0; index < selectors.length; index += 1) {
        if (selectors[index].replace(/^\s+|\s+$/g, '').indexOf('body.' + theme.className) !== 0) {
          errors.push('Unscoped selector for ' + theme.id + ': ' + selectors[index].replace(/^\s+|\s+$/g, ''));
        }
      }
    }
    cursor = close + 1;
  }
}

function validateThemeCss(theme, css) {
  var errors = [];
  var source = stripComments(css);
  validateBlock(theme, source, errors);
  REQUIRED_THEME_TOKENS.forEach(function (token) {
    if (source.indexOf(token + ':') === -1) { errors.push('Missing required theme token for ' + theme.id + ': ' + token); }
  });
  return errors;
}

function validateRuntimeOrder(html) {
  var source = String(html || '');
  var registryIndex = source.search(/<script[^>]+src=["']theme-registry\.js(?:\?[^"']*)?["'][^>]*>/i);
  var schemaIndex = source.search(/<script[^>]+src=["']settings-schema\.js(?:\?[^"']*)?["'][^>]*>/i);
  var settingsIndex = source.search(/<script[^>]+src=["']settings\.js(?:\?[^"']*)?["'][^>]*>/i);
  var errors = [];
  if (registryIndex === -1) { errors.push('Missing runtime script: theme-registry.js'); }
  if (schemaIndex === -1) { errors.push('Missing runtime script: settings-schema.js'); }
  if (settingsIndex === -1) { errors.push('Missing runtime script: settings.js'); }
  if (registryIndex !== -1 && schemaIndex !== -1 && registryIndex > schemaIndex) {
    errors.push('theme-registry.js must load before settings-schema.js');
  }
  if (schemaIndex !== -1 && settingsIndex !== -1 && schemaIndex > settingsIndex) {
    errors.push('settings-schema.js must load before settings.js');
  }
  return errors;
}

function requiredThemeTokens() { return REQUIRED_THEME_TOKENS.slice(); }

function check(root) {
  var errors = [];
  ThemeRegistry.all().forEach(function (theme) {
    var file = path.join(root, 'app', 'styles', 'themes', theme.styleFile);
    if (!fs.existsSync(file)) {
      errors.push('Missing theme stylesheet: ' + theme.id + ' -> ' + theme.styleFile);
      return;
    }
    errors = errors.concat(validateThemeCss(theme, fs.readFileSync(file, 'utf8')));
  });
  errors = errors.concat(validateRuntimeOrder(fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8')));
  return errors;
}

if (require.main === module) {
  var projectRoot = path.resolve(__dirname, '..');
  var errors = check(projectRoot);
  if (errors.length) {
    errors.forEach(function (error) { console.error(error); });
    process.exitCode = 1;
  } else {
    console.log('Theme stylesheet contracts passed');
  }
}

module.exports = {
  check: check,
  requiredThemeTokens: requiredThemeTokens,
  validateRuntimeOrder: validateRuntimeOrder,
  validateThemeCss: validateThemeCss
};

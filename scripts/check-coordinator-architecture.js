'use strict';

var acorn = require('acorn');
var fs = require('fs');
var path = require('path');

var FORBIDDEN_ROOT_CONSTRUCTORS = {
  BackgroundAudio: true,
  ChoiceDialogView: true,
  DetailController: true,
  DetailEpisodeView: true,
  DetailPreferenceState: true,
  DetailPresentationView: true,
  DiagnosticsController: true,
  LibraryController: true,
  LibraryFilterView: true,
  LibraryGridView: true,
  MediaInfoView: true,
  PlaybackController: true,
  PlaybackQueueController: true,
  PlayerControlsController: true,
  PloffLibraryGridView: true,
  ProgressiveImages: true,
  SearchController: true,
  ServerController: true,
  ServerEditorView: true,
  SettingsController: true,
  ShellController: true,
  WatchlistView: true
};

var ROOT_DOM_MUTATION_METHODS = {
  appendChild: true,
  insertAdjacentHTML: true,
  insertAdjacentText: true,
  insertBefore: true,
  removeAttribute: true,
  removeChild: true,
  replaceChild: true,
  replaceChildren: true,
  setAttribute: true
};

var ROOT_CLASS_LIST_MUTATION_METHODS = { add: true, remove: true, replace: true, toggle: true };
var ROOT_STYLE_MUTATION_METHODS = { removeProperty: true, setProperty: true };

var FORBIDDEN_ROOT_STATE = {
  activeViewState: true,
  appView: true,
  backgroundAudio: true,
  choiceDialogApply: true,
  choiceDialogReturnFocus: true,
  choiceDialogView: true,
  clockTimer: true,
  detailController: true,
  detailEpisodeView: true,
  detailPreferenceState: true,
  detailPresentationView: true,
  detailState: true,
  lastDetailPresentationKey: true,
  libraryFilterView: true,
  libraryGridView: true,
  libraryLifecycle: true,
  mediaInfoView: true,
  navHoldTimer: true,
  navReorderOriginalItems: true,
  navbarResizeTimer: true,
  pendingDetailProgress: true,
  playbackController: true,
  playbackQueueController: true,
  playbackQueueState: true,
  playerChaptersView: true,
  playerControlsController: true,
  playerControlsView: true,
  playerErrorVisible: true,
  posterLoader: true,
  resumeChoiceState: true,
  serverController: true,
  serverEditorView: true,
  settingsView: true,
  subtitleEditorView: true,
  upNextLayoutDialog: true,
  upNextView: true,
  watchlistView: true
};

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

function rootIdentifier(node) {
  if (!node) { return ''; }
  if (node.type === 'Identifier') { return node.name; }
  if (node.type === 'MemberExpression') { return rootIdentifier(node.object); }
  return '';
}

function snapshotCallName(node) {
  var current = node;
  while (current && current.type === 'MemberExpression') { current = current.object; }
  if (!current || current.type !== 'CallExpression' || !current.callee || current.callee.type !== 'Identifier') { return ''; }
  return current.callee.name;
}

function isPlexPortFactoryCall(node) {
  var pathParts;
  if (!node || node.type !== 'CallExpression') { return false; }
  pathParts = memberPath(node.callee);
  return pathParts.length === 2 && pathParts[0] === 'PlexFeaturePorts';
}

function rootPlexClientAliases(ast) {
  var aliases = {};
  aliases.PlexClient = true;
  walk(ast, null, function (node) {
    var source;
    if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
      source = node.init;
      if (isPlexPortFactoryCall(source) || source && source.type === 'Identifier' && aliases[source.name]) {
        aliases[node.id.name] = true;
      }
    } else if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left && node.left.type === 'Identifier') {
      source = node.right;
      if (isPlexPortFactoryCall(source) || source && source.type === 'Identifier' && aliases[source.name]) {
        aliases[node.left.name] = true;
      }
    }
  });
  return aliases;
}

function readabilityMetrics(source) {
  var lines = String(source || '').split('\n');
  var longest = 0;
  var longCount = 0;
  var index;
  for (index = 0; index < lines.length; index += 1) {
    if (lines[index].length > longest) { longest = lines[index].length; }
    if (lines[index].length > 200) { longCount += 1; }
  }
  return { lineCount: lines.length, longLineCount: longCount, maxLineLength: longest };
}

function analyzeSource(source, fileName) {
  var name = path.basename(fileName || '');
  var isApplication = name === 'application-controller.js';
  var isPlayback = name === 'playback-controller.js';
  var issues = [];
  var ast = parse(source, name);
  var plexClientAliases = isApplication ? rootPlexClientAliases(ast) : {};

  function add(rule, node, message) {
    issues.push({
      file: name,
      line: node && node.loc ? node.loc.start.line : 0,
      rule: rule,
      message: message
    });
  }

  walk(ast, null, function (node) {
    var pathParts;
    var property;
    var objectName;
    var callName;
    var declaredName;

    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
      pathParts = memberPath(node.argument || node.left);
      property = pathParts.length ? pathParts[pathParts.length - 1] : '';
      if (!isPlayback && pathParts[0] === 'video' && (property === 'src' || property === 'currentTime')) {
        add('native-video-write', node, 'only playback-controller.js may assign video.' + property);
      }
      if (isApplication) {
        if (property === 'innerHTML' || property === 'className' || property === 'textContent' ||
            pathParts.length > 1 && pathParts[pathParts.length - 2] === 'style') {
          add('root-dom-mutation', node, 'the composition root must not mutate feature presentation');
        }
        callName = snapshotCallName(node.argument || node.left);
        if (callName === 'detailSnapshot' || callName === 'playbackQueueSnapshot') {
          add('root-snapshot-mutation', node, callName + ' results are read-only at the composition boundary');
        }
        if (pathParts.length === 2 && pathParts[0] === 'queue' && pathParts[1] === 'index') {
          add('root-private-state-mutation', node, 'the composition root must not mutate queue internals');
        }
      }
    }

    if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
      declaredName = node.id.name;
      if (isApplication && FORBIDDEN_ROOT_STATE[declaredName]) {
        add('root-private-state', node, 'the composition root must not retain private feature state: ' + declaredName);
      }
      if (declaredName === 'compatibility') {
        add('legacy-compatibility-state', node, 'mutable compatibility facades must not be reintroduced');
      }
    }

    if (node.type === 'Identifier' && node.name === 'compatibilityState') {
      add('legacy-compatibility-state', node, 'mutable compatibility state must not be reintroduced');
    }

    if (node.type === 'CallExpression') {
      pathParts = memberPath(node.callee);
      property = pathParts.length ? pathParts[pathParts.length - 1] : '';
      if (isApplication && (plexClientAliases[pathParts[0]] ||
          node.callee.type === 'MemberExpression' && isPlexPortFactoryCall(node.callee.object))) {
        add('root-direct-plex', node, 'the composition root must not perform direct Plex transport');
      }
      if (isApplication && (ROOT_DOM_MUTATION_METHODS[property] ||
          pathParts.length > 1 && pathParts[pathParts.length - 2] === 'classList' && ROOT_CLASS_LIST_MUTATION_METHODS[property] ||
          pathParts.length > 1 && pathParts[pathParts.length - 2] === 'style' && ROOT_STYLE_MUTATION_METHODS[property])) {
        add('root-dom-mutation', node, 'the composition root must not mutate feature presentation');
      }
      if (isApplication && (property === 'setTimeout' || property === 'setInterval' ||
          node.callee.type === 'Identifier' && (node.callee.name === 'setTimeout' || node.callee.name === 'setInterval'))) {
        add('root-feature-timer', node, 'the composition root must not own feature timers');
      }
      if (isApplication && property === 'create' && node.callee.type === 'MemberExpression') {
        objectName = rootIdentifier(node.callee.object);
        if (FORBIDDEN_ROOT_CONSTRUCTORS[objectName]) {
          add('root-forbidden-construction', node, 'the composition root must not construct ' + objectName + ' directly');
        }
      }
    }
  });

  return { issues: issues, metrics: readabilityMetrics(source) };
}

function coordinatorFiles(projectRoot) {
  var directory = path.join(projectRoot, 'app/coordinator');
  return fs.readdirSync(directory).filter(function (name) { return /\.js$/.test(name); }).sort();
}

function checkProject(projectRoot) {
  var directory = path.join(projectRoot, 'app/coordinator');
  var files = coordinatorFiles(projectRoot);
  var issues = [];
  var applicationMetrics = { lineCount: 0, longLineCount: 0, maxLineLength: 0 };
  var index;
  var name;
  var result;
  for (index = 0; index < files.length; index += 1) {
    name = files[index];
    result = analyzeSource(fs.readFileSync(path.join(directory, name), 'utf8'), name);
    issues = issues.concat(result.issues);
    if (name === 'application-controller.js') { applicationMetrics = result.metrics; }
  }
  if (fs.existsSync(path.join(projectRoot, 'app/source'))) {
    issues.push({ file: 'app/source', line: 0, rule: 'legacy-source', message: 'app/source must not be reintroduced' });
  }
  if (fs.existsSync(path.join(directory, 'setup-adapter.js'))) {
    issues.push({ file: 'setup-adapter.js', line: 0, rule: 'legacy-setup-adapter', message: 'the transitional setup adapter must stay removed' });
  }
  return { issues: issues, applicationMetrics: applicationMetrics, files: files };
}

function run(projectRoot) {
  var result = checkProject(projectRoot);
  var index;
  if (result.issues.length) {
    for (index = 0; index < result.issues.length; index += 1) {
      console.error(result.issues[index].file + ':' + result.issues[index].line + ' [' + result.issues[index].rule + '] ' + result.issues[index].message);
    }
    return false;
  }
  console.log('Coordinator architecture checks passed');
  console.log('Application composition root readability: ' + result.applicationMetrics.lineCount + ' lines, ' +
    result.applicationMetrics.longLineCount + ' lines over 200 characters, maximum ' + result.applicationMetrics.maxLineLength + ' characters');
  return true;
}

if (require.main === module) {
  if (!run(path.resolve(__dirname, '..'))) { process.exitCode = 1; }
}

module.exports = {
  analyzeSource: analyzeSource,
  checkProject: checkProject,
  run: run
};

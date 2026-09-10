'use strict';

var Ast = require('./lib/es5-ast');
var parse = Ast.parse;
var walk = Ast.walk;
var memberProperty = Ast.memberProperty;
var memberPath = Ast.memberPath;
var fs = require('fs');
var path = require('path');

var HOTSPOT_BUDGETS = {
  'library-controller.js': { functionName: 'handleKey', maxLines: 40, maxIfs: 20 },
  'player-controls-controller.js': { functionName: 'handleKey', maxLines: 40, maxIfs: 20 },
  'pointer-controller.js': { functionName: 'syncPointerFocus', maxLines: 40, maxIfs: 20 }
};

var NATIVE_VIDEO_PROPERTIES = {
  autoplay: true,
  currentTime: true,
  muted: true,
  playbackRate: true,
  src: true,
  volume: true
};

var NATIVE_VIDEO_METHODS = {
  load: true,
  pause: true,
  play: true
};

var PLAYER_QUEUE_PRESENTATION_STATE = {
  playlistQueueScrollDirection: true,
  playlistQueuePrefetchDirection: true,
  playlistQueueCards: true,
  playlistQueuePrefetchImages: true,
  playlistQueueRenderToken: true,
  playlistQueueSpacers: true,
  playlistQueueCardOriginIdentity: true,
  playlistQueuePlaybackPaused: true
};

function literalValue(node) {
  return node && node.type === 'Literal' ? node.value : undefined;
}

function isPlayerVideoLookup(node) {
  var callee;
  if (!node || node.type !== 'CallExpression' || !node.callee) { return false; }
  callee = memberPath(node.callee);
  return callee.length >= 2 && callee[callee.length - 1] === 'getElementById' && literalValue(node.arguments[0]) === 'player-video';
}

function collectNativeVideoAliases(ast) {
  var aliases = { video: true, nativeVideo: true };
  var changed = true;
  var passes = 0;
  while (changed && passes < 4) {
    changed = false;
    passes += 1;
    walk(ast, null, function (node) {
      var target = '';
      var source = null;
      if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
        target = node.id.name;
        source = node.init;
      } else if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left && node.left.type === 'Identifier') {
        target = node.left.name;
        source = node.right;
      }
      if (!target || aliases[target]) { return; }
      if (isPlayerVideoLookup(source) || source && source.type === 'Identifier' && aliases[source.name]) {
        aliases[target] = true;
        changed = true;
      }
    });
  }
  return aliases;
}

function nativeVideoObjectName(node) {
  var pathParts = memberPath(node);
  if (!pathParts.length) { return ''; }
  return pathParts[pathParts.length - 1];
}

function functionName(node) {
  if (!node) { return ''; }
  if (node.type === 'FunctionDeclaration' && node.id) { return node.id.name || ''; }
  if (node.type === 'FunctionExpression' && node.id) { return node.id.name || ''; }
  return '';
}

function hotspotMetrics(ast, budget) {
  var target = null;
  var metrics = null;
  walk(ast, null, function (node) {
    if (!target && node.type === 'FunctionDeclaration' && functionName(node) === budget.functionName) { target = node; }
  });
  if (!target) { return null; }
  metrics = {
    functionName: budget.functionName,
    lineCount: target.loc.end.line - target.loc.start.line + 1,
    ifCount: 0
  };
  walk(target.body, target, function (node) {
    if (node.type === 'IfStatement') { metrics.ifCount += 1; }
  });
  return metrics;
}

function analyzeSource(source, fileName) {
  var name = path.basename(fileName || '');
  var isSubtitleRuntime = name === 'subtitle-runtime.js';
  var isNativeVideoOwner = name === 'native-video-driver.js';
  var isPlaybackReposition = name === 'playback-reposition.js';
  var isPlaybackTimeline = name === 'playback-timeline.js';
  var isPlayerQueuePresentationOwner = name === 'player-queue-controller.js';
  var budget = HOTSPOT_BUDGETS[name];
  var issues = [];
  var ast = parse(source, name);
  var videoAliases = collectNativeVideoAliases(ast);
  var metrics = budget ? hotspotMetrics(ast, budget) : null;

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
    var objectName;
    var property;
    var called;
    if (!isSubtitleRuntime) {
      if (node.type === 'FunctionDeclaration' && (functionName(node) === 'subtitleEditorTrackAllowed' ||
          functionName(node) === 'editorTrackAllowed' || functionName(node) === 'editorAvailability')) {
        add('subtitle-editor-policy-owner', node, 'runtime subtitle-editor eligibility policy belongs to SubtitleRuntime');
      }
      if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' &&
          (node.id.name === 'failedSubtitleStreams' || node.id.name === 'failedStreams')) {
        add('subtitle-editor-policy-owner', node, 'runtime subtitle failure state belongs to SubtitleRuntime');
      }
      if (node.type === 'CallExpression') {
        pathParts = memberPath(node.callee);
        if (pathParts.length === 2 && pathParts[0] === 'SubtitleSync' && pathParts[1] === 'availability') {
          add('subtitle-editor-policy-owner', node, 'runtime subtitle-editor availability must be queried from SubtitleRuntime');
        }
      }
    }

    if (!isNativeVideoOwner && (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression')) {
      pathParts = memberPath(node.argument || node.left);
      objectName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
      property = pathParts.length ? pathParts[pathParts.length - 1] : memberProperty(node.argument || node.left);
      if ((videoAliases[objectName] || node.left && node.left.type === 'MemberExpression' && isPlayerVideoLookup(node.left.object)) && NATIVE_VIDEO_PROPERTIES[property]) {
        add('native-video-owner', node, 'only native-video-driver.js may mutate native player video state');
      }
    }

    if (!isNativeVideoOwner && node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
      objectName = nativeVideoObjectName(node.callee.object);
      called = memberProperty(node.callee);
      if ((videoAliases[objectName] || isPlayerVideoLookup(node.callee.object)) && (NATIVE_VIDEO_METHODS[called] ||
          called === 'removeAttribute' && literalValue(node.arguments[0]) === 'src')) {
        add('native-video-owner', node, 'only native-video-driver.js may control the native player video element');
      }
    }

    if (!isPlaybackTimeline && node.type === 'CallExpression') {
      pathParts = memberPath(node.callee);
      if (pathParts.length === 2 && pathParts[0] === 'PlexClient' &&
          (pathParts[1] === 'sendTimeline' || pathParts[1] === 'pingTranscode')) {
        add('playback-timeline-owner', node, 'Plex timeline reporting and transcode keepalive belong to PlaybackTimeline');
      }
    }

    if (isPlaybackReposition && node.type === 'Identifier' && node.name === 'PlaybackRecovery') {
      add('reposition-recovery-boundary', node, 'PlaybackReposition must remain independent from PlaybackRecovery fallback state');
    }

    if (!isPlayerQueuePresentationOwner && node.type === 'VariableDeclarator' && node.id &&
        node.id.type === 'Identifier' && PLAYER_QUEUE_PRESENTATION_STATE[node.id.name]) {
      add('player-queue-presentation-owner', node, 'queue drawer presentation state belongs to PlayerQueueController');
    }
  });

  if (budget && metrics && (metrics.lineCount > budget.maxLines || metrics.ifCount > budget.maxIfs)) {
    issues.push({
      file: name,
      line: 0,
      rule: 'input-hotspot-budget',
      message: budget.functionName + ' grew to ' + metrics.lineCount + ' lines / ' + metrics.ifCount +
        ' if statements (budget ' + budget.maxLines + ' / ' + budget.maxIfs + ')'
    });
  }

  return { issues: issues, hotspot: metrics };
}

function runtimeFiles(projectRoot) {
  var appDirectory = path.join(projectRoot, 'app');
  var coordinatorDirectory = path.join(appDirectory, 'coordinator');
  var files = fs.readdirSync(appDirectory).filter(function (name) {
    return /\.js$/.test(name) && name !== 'app.js' && name !== 'player.js';
  }).sort().map(function (name) {
    return { name: name, filePath: path.join(appDirectory, name) };
  });
  fs.readdirSync(coordinatorDirectory).filter(function (name) { return /\.js$/.test(name); }).sort().forEach(function (name) {
    files.push({ name: name, filePath: path.join(coordinatorDirectory, name) });
  });
  return files;
}

function checkProject(projectRoot) {
  var files = runtimeFiles(projectRoot);
  var issues = [];
  var hotspots = [];
  var index;
  var entry;
  var result;
  for (index = 0; index < files.length; index += 1) {
    entry = files[index];
    result = analyzeSource(fs.readFileSync(entry.filePath, 'utf8'), entry.name);
    issues = issues.concat(result.issues);
    if (result.hotspot) { hotspots.push({ file: entry.name, metrics: result.hotspot, budget: HOTSPOT_BUDGETS[entry.name] }); }
  }
  Object.keys(HOTSPOT_BUDGETS).forEach(function (fileName) {
    var found = hotspots.some(function (entry) { return entry.file === fileName; });
    if (!found) {
      issues.push({ file: fileName, line: 0, rule: 'input-hotspot-missing', message: 'reviewed input hotspot function is missing; update the guard intentionally' });
    }
  });
  return { issues: issues, hotspots: hotspots, files: files.map(function (entry) { return entry.name; }) };
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
  console.log('Maintainability boundary checks passed');
  result.hotspots.forEach(function (entry) {
    console.log('Input hotspot ' + entry.file + ' ' + entry.metrics.functionName + ': ' + entry.metrics.lineCount +
      ' lines / ' + entry.metrics.ifCount + ' if statements (budget ' + entry.budget.maxLines + ' / ' + entry.budget.maxIfs + ')');
  });
  return true;
}

if (require.main === module) {
  if (!run(path.resolve(__dirname, '..'))) { process.exitCode = 1; }
}

module.exports = {
  analyzeSource: analyzeSource,
  checkProject: checkProject,
  run: run,
  HOTSPOT_BUDGETS: HOTSPOT_BUDGETS
};

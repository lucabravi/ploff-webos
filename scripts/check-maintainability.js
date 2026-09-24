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

var REMOVED_MEDIA_SOURCE_PICKERS = {
  routeableSourceVariant: true,
  routeableMediaTarget: true,
  routeableQueueItem: true,
  itemForSourceVariant: true,
  preferredSourceItem: true,
  preferredSourceUnavailable: true,
  availableSourceItems: true,
  sourceFallbackRequired: true,
  sourceVariantItem: true
};

var RETIRED_RUNTIME_FILES = {
  'episode-navigation.js': true
};

var RETIRED_RUNTIME_APIS = {
  'ass-subtitle-prefetch.js': { peek: true },
  'card-layout.js': { SCALES: true },
  'detail-controller.js': { setReturnView: true },
  'detail-preference-state.js': { hasExplicitVersion: true },
  'diagnostics-controller.js': { handlePointer: true },
  'library-controller.js': { onGridScroll: true, setSort: true, setSortDirection: true },
  'library-tabs-editor.js': { openOrder: true },
  'library-source-catalog.js': { primaryId: true },
  'library-sources-controller.js': { displayServerName: true, sourceIdForMedia: true },
  'home-state.js': { fingerprintRows: true, fingerprintNormalizedRows: true, stableValue: true },
  'language-flag.js': { trackCode: true },
  'library-tab-store.js': { serialize: true },
  'media-preferences.js': { saveSelection: true },
  'navigation-model.js': { applyLibraryOrder: true },
  'playback-controller.js': { startAdjacent: true },
  'playback-queue-model.js': { adjacentItem: true, originFocusIndex: true, upcomingItems: true },
  'playback-recovery.js': { canRetry: true },
  'playback-queue-controller.js': { firstUnfinished: true, playable: true, resolveAdjacent: true },
  'playback-session.js': { armReopenStartupGuard: true, resetRuntime: true },
  'player-controls-controller.js': { pointerReveal: true, seekPointer: true },
  'player-feature-controller.js': { resolvePlaybackQueueAdjacent: true },
  'plex-source-router.js': { matchesOwner: true },
  'progressive-images.js': { ARTWORK_QUALITY_STEPS: true, BACKDROP_QUALITY_STEPS: true, deferNavigationLoads: true },
  'queue-sequence-contract.js': { sameOccurrence: true },
  'settings-backup-format.js': { isTechnicalPlaylist: true },
  'settings-controller.js': { closePrivacy: true, moveUpNextHorizontal: true, moveUpNextVertical: true, openPrivacy: true, toggleLanguage: true },
  'setup-scan-indicator.js': { dots: true },
  'shell-controller.js': { clearSelectionKey: true, navigationWindow: true, requestTheme: true, setNavigationStart: true },
  'startup-metrics.js': { assSyncComplete: true },
  'version-selection.js': { DEFAULT_PRIORITIES: true },
  'subtitle-series-offset.js': { matchTracks: true, resolveSelectedTrack: true, sourceFor: true, updateLayers: true }
};

var RETIRED_RUNTIME_EXPORTS = {
  'device-locale.js': { primaryLanguage: true },
  'library-tab-store.js': { displayServerName: true, ICONS: true },
  'media-info.js': { durationLabel: true },
  'playback-strategy.js': { selectedVersion: true },
  'plex-auth.js': { CLIENT_ID_KEY: true, serverIdentityFromXml: true },
  'plex-url.js': { replaceQueryParameter: true },
  'server-discovery.js': { SERVICE_URI: true },
  'settings-backup-format.js': { SETTINGS_KEYS: true },
  'settings.js': { languageList: true, primaryLanguage: true },
  'support-snapshot.js': { serialize: true }
};

var RETIRED_INSTANCE_EXPORTS = {
  'detail-episode-view.js': { currentEpisode: true, renderEpisodes: true, renderSeasons: true },
  'diagnostics-view.js': { closeSupportQr: true },
  'library-controller.js': { putCached: true },
  'library-source-catalog.js': { displayServerName: true },
  'media-info-dialog-controller.js': { focusVersion: true },
  'playback-queue-controller.js': { activateUpNext: true, moveUpNext: true },
  'player-controls-controller.js': { activateSkip: true, hideSkipWithControls: true, showSkipForControls: true, showTimeline: true },
  'pointer-controller.js': { seekTimelineFromPointer: true },
  'shell-controller.js': { activeProfileShortcutVisible: true, availableNavigationItems: true, beginBackdrop: true, beginTheme: true, createCard: true, loadBackdropItem: true, navigationButton: true }
};

function createExportProperties(ast) {
  var exports = [];
  function collect(node) {
    var body;
    var index;
    var statement;
    if (!node) { return; }
    if (node.type === 'FunctionDeclaration' && functionName(node) === 'create') { body = node.body && node.body.body; }
    else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' &&
        node.id.name === 'create' && node.init && node.init.type === 'FunctionExpression') {
      body = node.init.body && node.init.body.body;
    }
    if (!body) { return; }
    for (index = 0; index < body.length; index += 1) {
      statement = body[index];
      if (statement && statement.type === 'ReturnStatement' && statement.argument &&
          statement.argument.type === 'ObjectExpression') {
        exports = exports.concat(statement.argument.properties || []);
        return;
      }
    }
  }
  walk(ast, null, collect);
  return exports;
}

function moduleExportProperties(ast) {
  var factory = null;
  var exports = [];
  var index;
  var statement;
  var args;
  if (!ast || !ast.body) { return exports; }
  for (index = 0; index < ast.body.length && !factory; index += 1) {
    statement = ast.body[index];
    if (!statement || statement.type !== 'ExpressionStatement' ||
        !statement.expression || statement.expression.type !== 'CallExpression') { continue; }
    args = statement.expression.arguments || [];
    while (args.length) {
      statement = args[args.length - 1];
      if (statement && statement.type === 'FunctionExpression') { factory = statement; break; }
      args = args.slice(0, -1);
    }
  }
  if (!factory || !factory.body || !factory.body.body) { return exports; }
  for (index = 0; index < factory.body.body.length; index += 1) {
    statement = factory.body.body[index];
    if (statement && statement.type === 'ReturnStatement' && statement.argument &&
        statement.argument.type === 'ObjectExpression') {
      return statement.argument.properties || exports;
    }
  }
  return exports;
}

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
  var retiredApis = RETIRED_RUNTIME_APIS[name] || {};
  var retiredExports = RETIRED_RUNTIME_EXPORTS[name] || {};
  var retiredInstanceExports = RETIRED_INSTANCE_EXPORTS[name] || {};
  var issues = [];
  var ast = parse(source, name);
  var videoAliases = collectNativeVideoAliases(ast);
  var metrics = budget ? hotspotMetrics(ast, budget) : null;
  var exportProperties = moduleExportProperties(ast);
  var instanceExportProperties = createExportProperties(ast);

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
    var declaredName = functionName(node);
    var propertyName = '';
    if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' &&
        node.init && node.init.type === 'FunctionExpression') { declaredName = node.id.name; }
    if (node.type === 'Property' && node.key) {
      if (!node.computed && node.key.type === 'Identifier') { propertyName = node.key.name; }
      else if (node.key.type === 'Literal') { propertyName = String(node.key.value); }
    }
    if (retiredApis[declaredName] || retiredApis[propertyName]) {
      add('retired-runtime-api', node, 'retired unreachable runtime API must not be reintroduced');
    }
    if (node.type === 'Property' && exportProperties.indexOf(node) !== -1 && retiredExports[propertyName]) {
      add('retired-runtime-export', node, 'retired unused module export must not be reintroduced');
    }
    if (node.type === 'Property' && instanceExportProperties.indexOf(node) !== -1 && retiredInstanceExports[propertyName]) {
      add('retired-instance-export', node, 'retired unused instance export must not be reintroduced');
    }
    if (REMOVED_MEDIA_SOURCE_PICKERS[declaredName] ||
        declaredName === 'selectSourceVariant' && name !== 'multi-server-media.js' ||
        name !== 'media-source-resolver.js' && node.type === 'MemberExpression' && memberProperty(node) === 'selectSourceVariant') {
      add('media-source-resolution-owner', node,
        'choose a concrete media copy through MediaSourceResolver; only it consumes the pure MultiServerMedia projection');
    }
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
    if (RETIRED_RUNTIME_FILES[entry.name]) {
      issues.push({ file: entry.name, line: 0, rule: 'retired-runtime-file', message: 'retired unreachable runtime file must not be reintroduced' });
      continue;
    }
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
  HOTSPOT_BUDGETS: HOTSPOT_BUDGETS,
  RETIRED_RUNTIME_APIS: RETIRED_RUNTIME_APIS,
  RETIRED_RUNTIME_EXPORTS: RETIRED_RUNTIME_EXPORTS,
  RETIRED_INSTANCE_EXPORTS: RETIRED_INSTANCE_EXPORTS,
  RETIRED_RUNTIME_FILES: RETIRED_RUNTIME_FILES
};

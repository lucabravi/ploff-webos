'use strict';

var acorn = require('acorn');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var root = path.join(__dirname, '..');
var sourcePath = path.join(__dirname, 'vendor-sources', 'subtitles-octopus-worker-legacy-4.1.0.full.js.gz');
var outputPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.js');
var memoryOutputPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.mem');
var expectedSourceSha256 = '1a66cce7795fdfa1cee41b60e812f165421874bf54274f16a797d5aa443e92a0';
var checkOnly = process.argv.indexOf('--check') !== -1;
var source = zlib.gunzipSync(fs.readFileSync(sourcePath)).toString('utf8');
var sourceHash = crypto.createHash('sha256').update(source).digest('hex');
var ast;
var edits = [];

if (sourceHash !== expectedSourceSha256) {
  throw new Error('Unexpected JavascriptSubtitlesOctopus 4.1.0 legacy worker source: ' + sourceHash);
}

ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });

function nodeText(node) {
  return source.slice(node.start, node.end);
}

function leftName(node) {
  var expression;
  if (!node || node.type !== 'ExpressionStatement') { return ''; }
  expression = node.expression;
  if (!expression || expression.type !== 'AssignmentExpression') { return ''; }
  return source.slice(expression.left.start, expression.left.end);
}

function addEdit(node, replacement, label) {
  if (!node) { throw new Error('Unable to locate legacy worker section: ' + label); }
  edits.push({ start: node.start, end: node.end, replacement: replacement || '', label: label });
}

function one(predicate, label) {
  var matches = ast.body.filter(predicate);
  if (matches.length !== 1) {
    throw new Error('Expected one legacy worker section for ' + label + ', found ' + matches.length);
  }
  return matches[0];
}

function assignment(name) {
  return one(function (node) { return leftName(node) === name; }, name);
}

function namedFunction(name) {
  return one(function (node) {
    return node.type === 'FunctionDeclaration' && node.id && node.id.name === name;
  }, 'function ' + name);
}

function statementStarting(prefix, label) {
  return one(function (node) { return nodeText(node).indexOf(prefix) === 0; }, label || prefix);
}

function removeAssignment(name) {
  addEdit(assignment(name), '', name);
}

function replaceAssignment(name, replacement) {
  addEdit(assignment(name), replacement, name);
}

function removeFunction(name) {
  addEdit(namedFunction(name), '', 'function ' + name);
}

function classStart(name) {
  return namedFunction(name);
}

function nodeIndex(node) {
  return ast.body.indexOf(node);
}

function removeRange(firstNode, lastNode, label) {
  addEdit({ start: firstNode.start, end: lastNode.end }, '', label);
}

function removeClassRange(firstClassName, nextClassName, label) {
  var first = classStart(firstClassName);
  var next = classStart(nextClassName);
  var firstIndex = nodeIndex(first);
  var nextIndex = nodeIndex(next);
  if (firstIndex < 0 || nextIndex <= firstIndex) { throw new Error('Invalid class range: ' + label); }
  removeRange(first, ast.body[nextIndex - 1], label);
}

function trimClassMethods(className, keepMethods, stopNode, label) {
  var first = classStart(className);
  var startIndex = nodeIndex(first);
  var stopIndex = nodeIndex(stopNode);
  var keep = {};
  var index;
  keepMethods.forEach(function (name) { keep[name] = true; });
  if (startIndex < 0 || stopIndex <= startIndex + 6) { throw new Error('Invalid class trim range: ' + className); }
  for (index = startIndex + 6; index < stopIndex; index += 1) {
    var node = ast.body[index];
    var match = nodeText(node).match(new RegExp('^' + className + '\\.prototype\\["([^"]+)"\\]='));
    if (match && keep[match[1]]) { continue; }
    addEdit(node, '', label + ': ' + nodeText(node).slice(0, 70));
  }
}

function externalizeStaticMemory(input) {
  var functionStart = input.indexOf('function p(q){');
  var functionEndMarker = '}var r=new ArrayBuffer(16);';
  var functionEnd = input.indexOf(functionEndMarker, functionStart);
  var functionSource;
  var segmentPattern = /l\(e,(\d+),"([A-Za-z0-9+/=]+)"\)/g;
  var segments = [];
  var match;
  var minOffset = Infinity;
  var maxEnd = 0;
  var memory;
  var loader;
  var timingPrelude;

  if (functionStart < 0 || functionEnd < 0) {
    throw new Error('Unable to locate Emscripten static memory initializer');
  }
  functionSource = input.slice(functionStart, functionEnd + 1);
  while ((match = segmentPattern.exec(functionSource))) {
    var offset = Number(match[1]);
    var bytes = Buffer.from(match[2], 'base64');
    segments.push({ offset: offset, bytes: bytes });
    minOffset = Math.min(minOffset, offset);
    maxEnd = Math.max(maxEnd, offset + bytes.length);
  }
  if (segments.length !== 2378 || minOffset !== 1024 || maxEnd !== 655423) {
    throw new Error('Unexpected Emscripten static memory layout: ' + segments.length + ' segments, ' + minOffset + '..' + maxEnd);
  }
  memory = Buffer.alloc(maxEnd - minOffset);
  segments.forEach(function (segment) {
    segment.bytes.copy(memory, segment.offset - minOffset);
  });
  timingPrelude = 'var PloffAssTimingEnabled=typeof self!=="undefined"&&self.location&&/[?&]assTiming=1(?:&|$)/.test(String(self.location.search||self.location.href||""));function PloffAssTimingMark(phase){if(!PloffAssTimingEnabled){return}try{postMessage({target:"ploff-ass-timing",phase:phase})}catch(ignore){}}PloffAssTimingMark("worker-script");';
  loader = 'function p(q){PloffAssTimingMark("static-memory-start");var a=readBinary(locateFile("subtitles-octopus-worker-legacy.mem"));PloffAssTimingMark("static-memory-end");if(!a||a.length!==' +
    memory.length + ')throw"legacy static memory load failed";e.set(a,' + minOffset + ')}';
  return {
    output: timingPrelude + input.slice(0, functionStart) + loader + input.slice(functionEnd + 1),
    memory: memory,
    segmentCount: segments.length
  };
}

function applyEdits(input) {
  var ordered = edits.slice().sort(function (a, b) { return b.start - a.start; });
  var previousStart = input.length + 1;
  var output = input;
  ordered.forEach(function (edit) {
    if (edit.end > previousStart) { throw new Error('Overlapping legacy worker edits near ' + edit.label); }
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    previousStart = edit.start;
  });
  return output;
}

/* Ploff always passes local ASS as subContent. The native Brotli linked for
 * FreeType/WOFF2 remains untouched inside the Emscripten payload; only the
 * deprecated JavaScript subtitle .br decoder is removed here. */
removeFunction('isBrotliFile');
removeFunction('BrotliDecodeClosure');
addEdit(one(function (node) {
  return node.type === 'VariableDeclaration' && node.declarations.length === 1 &&
    node.declarations[0].id && node.declarations[0].id.name === 'BrotliDecode';
}, 'BrotliDecode variable'), '', 'BrotliDecode variable');
removeAssignment('Module["BrotliDecode"]');

addEdit(statementStarting('Module["preRun"].push(', 'legacy preRun'),
  'Module["preRun"].push(function(){PloffAssTimingMark("prerun-start");Module["FS_createPath"]("/","fonts",true,true);Module["FS_createPath"]("/","fontconfig",true,true);if(self.subContent!==undefined&&self.subContent!==null){Module["FS"].writeFile("/sub.ass",self.subContent)}self.subContent=null;self.loadFontFile(".fallback-",self.fallbackFont);PloffAssTimingMark("prerun-end")});',
  'legacy preRun');
replaceAssignment('Module["onRuntimeInitialized"]',
  'Module["onRuntimeInitialized"]=function(){var library;var renderer;var fallbackPath;PloffAssTimingMark("runtime-init-start");self.octObj=new Module.SubtitleOctopus;self.PloffAssLibass=new Module.libass;self.changed=Module._malloc(4);fallbackPath="/fonts/.fallback-"+self.fallbackFont.split("/").pop();library=self.PloffAssLibass.oct_library_init();if(!library||!library.ptr){throw new Error("Ploff libass library init failed")}self.PloffAssLibass.oct_set_extract_fonts(library,1);renderer=self.PloffAssLibass.oct_renderer_init(library);if(!renderer||!renderer.ptr){throw new Error("Ploff libass renderer init failed")}self.octObj.set_ass_library(library);self.octObj.set_ass_renderer(renderer);self.octObj.resizeCanvas(screen.width,screen.height);self.PloffAssLibass.oct_set_fonts(renderer,fallbackPath,null,0,null,0);PloffAssTimingMark("libass-runtime-ready");self.PloffAssInstallTrack();PloffAssTimingMark("warm-track-ready");PloffAssTimingMark("runtime-init-end")};');

/* The Ploff renderer uses one packaged fallback font and the js-blend path.
 * Generic URL/lazy-font/render-mode paths stay in the upstream source archive,
 * not in the TV runtime worker. */
removeAssignment('self.writeFontToFS');
replaceAssignment('self.loadFontFile',
  'self.PloffAssIsWoff2=function(data){return!!data&&data.length>=4&&data[0]===119&&data[1]===79&&data[2]===70&&data[3]===50};' +
  'self.loadFontFile=function(fontId,path){var name=fontId+path.split("/").pop();var data=null;var dep=null;var released=false;function writeFont(bytes){if(!self.PloffAssIsWoff2(bytes)){return false}Module["FS"].writeFile("/fonts/"+name,bytes);PloffAssTimingMark("font-loaded");return true}function release(){if(released){return}released=true;removeRunDependency(dep)}PloffAssTimingMark("font-request");try{data=readBinary(path);if(!writeFont(data)){throw new Error("invalid packaged fallback font")}}catch(error){PloffAssTimingMark("font-sync-error");dep=getUniqueRunDependency("ploff-font "+name);addRunDependency(dep);try{readAsync(path,function(buffer){try{data=new Uint8Array(buffer);if(!writeFont(data)){PloffAssTimingMark("font-error")}}catch(ignore){PloffAssTimingMark("font-error")}release()},function(){PloffAssTimingMark("font-error");release()})}catch(ignore){PloffAssTimingMark("font-error");release()}}};');
removeAssignment('self.writeAvailableFontsToFS');
removeAssignment('self.getRenderMethod');
replaceAssignment('self.setTrack',
  'self.PloffAssResetRenderProfile=function(){self.PloffAssRenderCount=0;self.PloffAssChangedRenderCount=0;self.PloffAssLibassTotalMs=0;self.PloffAssBlendTotalMs=0;self.PloffAssMaxLibassMs=0;self.PloffAssMaxBlendMs=0;self.PloffAssSlowRenderCount=0;self.PloffAssSlowLibassRenderCount=0;self.PloffAssSlowUnchangedRenderCount=0;self.PloffAssMaxUnchangedLibassMs=0;self.PloffAssLastSlowUnchangedLibassMs=0;self.PloffAssLastSlowUnchangedMediaTime=0;self.PloffAssLastSlowUnchangedClockAgeMs=0;self.PloffAssLastSlowUnchangedReason="";self.PloffAssSyncUpdateCount=0;self.PloffAssSyncTriggeredRenderCount=0;self.PloffAssPauseTransitionCount=0;self.PloffAssLastSyncQueueMs=0;self.PloffAssMaxSyncQueueMs=0};' +
  'self.PloffAssInstallTrack=function(content){var oldTrack=self.octObj.get_track();var library=self.octObj.get_ass_library();var nextTrack;if(content!==undefined){Module["FS"].writeFile("/sub.ass",content)}nextTrack=self.PloffAssLibass.oct_read_file(library,"/sub.ass",null);if(!nextTrack||!nextTrack.ptr){throw new Error("Ploff libass track replacement failed")}self.octObj.set_track(nextTrack);self.ass_track=nextTrack;self.ass_library=library;if(oldTrack&&oldTrack.ptr){self.PloffAssLibass.oct_free_track(oldTrack)}return nextTrack};' +
  'self.PloffAssWarmCancelled=false;self.PloffAssAwaitingRealTrack=false;self.PloffAssWarmStepCount=0;self.PloffAssWarmTotalMs=0;self.PloffAssWarmMaxMs=0;self.PloffAssWarmLastMs=0;self.PloffAssWarmComplete=false;' +
  'self.PloffAssAnalyzeTrack=function(content){var result={animated:true};var sections;var i;var j;var row;var value;var text;var blockPattern=/\\{([^}]*)\\}/g;var match;var block;try{sections=parseAss(String(content||""));result.animated=false;for(i=0;i<sections.length;i+=1){if(String(sections[i].name||"").toLowerCase()!=="events"){continue}for(j=0;j<sections[i].body.length;j+=1){row=sections[i].body[j];if(!row||String(row.key||"").toLowerCase()!=="dialogue"){continue}value=row.value;if(!value||typeof value!=="object"||value.Text===undefined){result.animated=true;continue}if(String(value.Effect||"").replace(/^\\s+|\\s+$/g,"")!==""){result.animated=true}text=String(value.Text||"");blockPattern.lastIndex=0;while((match=blockPattern.exec(text))){block=match[1];if(/\\\\[kK]/.test(block)||/\\\\t(?:\\(|[ \\t])/.test(block)||/\\\\move(?:\\(|[ \\t])/.test(block)||/\\\\fad(?:e)?(?:\\(|[ \\t])/.test(block)){result.animated=true}}}}return result}catch(ignore){return result}};' +
  'self.PloffAssReadTrackBoundaries=function(){var track=self.octObj.get_track();var count;var values=[];var unique=[];var i;var event;var start;var duration;try{if(!track||!track.ptr||typeof track.get_n_events!=="function"||typeof track.get_events!=="function"){return false}count=Math.max(0,Number(track.get_n_events())||0);for(i=0;i<count;i+=1){event=track.get_events(i);if(!event||!event.ptr||typeof event.get_Start!=="function"||typeof event.get_Duration!=="function"){return false}start=Number(event.get_Start());duration=Number(event.get_Duration());if(!isFinite(start)||!isFinite(duration)||duration<0){return false}values.push(start/1000);values.push((start+duration)/1000)}values.sort(function(a,b){return a-b});for(i=0;i<values.length;i+=1){if(i===0||Math.abs(values[i]-values[i-1])>0.0005){unique.push(values[i])}}self.PloffAssStaticBoundaries=unique;return true}catch(ignore){return false}};' +
  'self.PloffAssCancelStaticBoundary=function(){if(self.PloffAssStaticBoundaryTimer){clearTimeout(self.PloffAssStaticBoundaryTimer);self.PloffAssStaticBoundaryTimer=0}};' +
  'self.PloffAssCancelLookahead=function(){if(self.PloffAssLookaheadTimer){clearTimeout(self.PloffAssLookaheadTimer);self.PloffAssLookaheadTimer=0}};' +
  'self.PloffAssResetLookahead=function(){self.PloffAssCancelLookahead();self.PloffAssPreparedBoundaryIndices=[];self.PloffAssPreparedCostlyBoundaryIndices=[];self.PloffAssLookaheadAttempted={};self.PloffAssRenderOverrideTime=null;self.PloffAssRenderPrepared=false};' +
  'self.PloffAssStaticBoundaryIndex=function(time){var values=self.PloffAssStaticBoundaries||[];var low=0;var high=values.length;var middle;time=Number(time)||0;while(low<high){middle=(low+high)>>1;if(values[middle]<=time+0.0005){low=middle+1}else{high=middle}}return low};' +
  'self.PloffAssBoundaryState=function(time){var values=self.PloffAssStaticBoundaries||[];var index=self.PloffAssStaticBoundaryIndex(time);return{index:index,validFrom:index>0?values[index-1]:null,validUntil:index<values.length?values[index]:null}};' +
  'self.PloffAssHasPreparedBoundary=function(index){var values=self.PloffAssPreparedBoundaryIndices||[];var i;index=Number(index);for(i=0;i<values.length;i+=1){if(Number(values[i])===index){return true}}return false};' +
  'self.PloffAssBoundaryRenderTime=function(index){var values=self.PloffAssStaticBoundaries||[];var from=index>0?Number(values[index-1]):0;var until=index<values.length?Number(values[index]):null;var epsilon=0.001;if(!isFinite(from)){return null}if(until!==null&&isFinite(until)&&until>from&&until-from<0.002){epsilon=Math.max(0.0001,(until-from)/2)}return from+epsilon};' +
  'self.PloffAssLookaheadSafe=function(targetIndex,currentIndex,current){var values=self.PloffAssStaticBoundaries||[];var from=targetIndex>0?Number(values[targetIndex-1]):NaN;var estimate=self.PloffAssRecentRenderMs>0?Math.max(250,Math.min(1500,self.PloffAssRecentRenderMs)*1.5+100):500;if(targetIndex<=currentIndex+1){return true}return isFinite(from)&&(from-current)*1000>=estimate};' +
  'self.PloffAssMaybeLookahead=function(){var current;var currentIndex;var targetIndex;var maxIndex;var renderAt;if(self.PloffAssTrackAnimated||self._isPaused||self.PloffAssAwaitingRealTrack||!self.PloffAssClockReceived||self.rafId||(self.PloffAssPreparedCostlyBoundaryIndices||[]).length>=5){return false}current=self.getCurrentTime()+self.delay;currentIndex=self.PloffAssStaticBoundaryIndex(current);if(self.PloffAssStaticRenderedBoundaryIndex===null||currentIndex>self.PloffAssStaticRenderedBoundaryIndex){if(!self.PloffAssHasPreparedBoundary(currentIndex)){return false}}maxIndex=(self.PloffAssStaticBoundaries||[]).length;targetIndex=currentIndex+1;while(targetIndex<=maxIndex&&self.PloffAssHasPreparedBoundary(targetIndex)){targetIndex+=1}if(targetIndex>maxIndex){return false}if(self.PloffAssLookaheadAttempted.hasOwnProperty(targetIndex)&&Number(self.PloffAssLookaheadAttempted[targetIndex])===currentIndex){return false}if(!self.PloffAssLookaheadSafe(targetIndex,currentIndex,current)){return false}renderAt=self.PloffAssBoundaryRenderTime(targetIndex);if(renderAt===null){return false}self.PloffAssLookaheadAttempted[targetIndex]=currentIndex;self.PloffAssLookaheadStarted=(self.PloffAssLookaheadStarted||0)+1;if(!self.PloffAssQueueRender("lookahead",renderAt,true)){delete self.PloffAssLookaheadAttempted[targetIndex];return false}return true};' +
  'self.PloffAssScheduleLookahead=function(){self.PloffAssCancelLookahead();if(self.PloffAssTrackAnimated||self._isPaused||self.PloffAssAwaitingRealTrack){return false}self.PloffAssLookaheadTimer=setTimeout(function(){self.PloffAssLookaheadTimer=0;self.PloffAssMaybeLookahead()},20);return true};' +
  'self.PloffAssScheduleStaticBoundary=function(){var current;var index;var next;var nextIndex;var rate;var waitMs;self.PloffAssCancelStaticBoundary();if(self.PloffAssTrackAnimated||self._isPaused||self.PloffAssAwaitingRealTrack){return false}current=self.getCurrentTime()+self.delay;index=self.PloffAssStaticBoundaryIndex(current);if(self.PloffAssStaticRenderedBoundaryIndex!==null){index=Math.max(index,self.PloffAssStaticRenderedBoundaryIndex)}next=(self.PloffAssStaticBoundaries||[])[index];nextIndex=index+1;if(next===undefined){return false}rate=Math.abs(Number(self.rate)||1);waitMs=Math.max(1,Math.ceil((next-current)*1000/rate)+2);self.PloffAssStaticBoundaryTimer=setTimeout(function(){self.PloffAssStaticBoundaryTimer=0;if(self._isPaused||self.PloffAssTrackAnimated||self.PloffAssAwaitingRealTrack){return}if(self.PloffAssHasPreparedBoundary(nextIndex)){self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead();return}self.PloffAssQueueRender("boundary")},waitMs);return true};' +
  'self.PloffAssQueueRender=function(reason,overrideTime,prepared){self.PloffAssCancelStaticBoundary();if(self.rafId){return false}self.PloffAssNextRenderReason=reason;self.PloffAssRenderOverrideTime=overrideTime!==null&&overrideTime!==undefined&&isFinite(Number(overrideTime))?Number(overrideTime):null;self.PloffAssRenderPrepared=prepared===true;self.rafId=self.requestAnimationFrame(self.render);return true};' +
  'self.PloffAssApplyTrackCadence=function(content){var analysis=self.PloffAssAnalyzeTrack(content);self.PloffAssTrackAnimated=analysis.animated===true;self.PloffAssStaticBoundaries=[];self.PloffAssStaticRenderedBoundaryIndex=null;self.PloffAssResetLookahead();self.targetFps=self.PloffAssAnimatedFps};' +
  'self.PloffAssFrameFingerprint=function(canvases){var hash=2166136261>>>0;var i;var j;var item;var bytes;var step;var sampled;function mix(value){hash=Math.imul(hash^(Number(value)||0),16777619)>>>0}for(i=0;i<canvases.length;i+=1){item=canvases[i];mix(item.x);mix(item.y);mix(item.w);mix(item.h);bytes=new Uint8Array(item.buffer);step=Math.max(1,Math.floor(bytes.length/16));sampled=0;for(j=0;j<bytes.length&&sampled<16;j+=step){mix(bytes[j]);sampled+=1}}return("00000000"+(hash>>>0).toString(16)).slice(-8)};' +
  'self.PloffAssWarmRender=function(index,time,last){var start;var warmMs;if(self.PloffAssWarmCancelled){postMessage({target:"ploff-ass-warm-step",index:index,cancelled:true,warmStepCount:self.PloffAssWarmStepCount||0,warmTotalMs:self.PloffAssWarmTotalMs||0,warmMaxMs:self.PloffAssWarmMaxMs||0,warmComplete:self.PloffAssWarmComplete===true});return}start=performance.now();self.octObj.renderImage(Number(time)||0,self.changed);warmMs=performance.now()-start;self.PloffAssWarmStepCount=(self.PloffAssWarmStepCount||0)+1;self.PloffAssWarmTotalMs=(self.PloffAssWarmTotalMs||0)+warmMs;self.PloffAssWarmMaxMs=Math.max(self.PloffAssWarmMaxMs||0,warmMs);self.PloffAssWarmLastMs=warmMs;if(last){self.PloffAssWarmComplete=true;PloffAssTimingMark("warm-render-ready")}postMessage({target:"ploff-ass-warm-step",index:index,libassMs:warmMs,warmStepCount:self.PloffAssWarmStepCount,warmTotalMs:self.PloffAssWarmTotalMs,warmMaxMs:self.PloffAssWarmMaxMs,warmComplete:self.PloffAssWarmComplete===true})};' +
  'self.setTrack=function(content){self.PloffAssWarmCancelled=true;self.PloffAssAwaitingRealTrack=false;self.PloffAssCancelStaticBoundary();self.PloffAssResetLookahead();self.PloffAssClockReceived=false;if(self.rafId){clearTimeout(self.rafId);self.rafId=0}self.PloffAssFirstRender=0;self.PloffAssFrameSeq=0;self.PloffAssApplyTrackCadence(content);self.PloffAssResetRenderProfile();PloffAssTimingMark("set-track-start");self.PloffAssInstallTrack(content);if(!self.PloffAssTrackAnimated&&!self.PloffAssReadTrackBoundaries()){self.PloffAssTrackAnimated=true;self.PloffAssStaticBoundaries=[]}PloffAssTimingMark("set-track-end")};');
removeAssignment('self.freeTrack');
removeAssignment('self.setTrackByUrl');
replaceAssignment('self.setCurrentTime',
  'self.PloffAssMessageTimestamp=function(sentAt){var now=Date.now();sentAt=Number(sentAt);return isFinite(sentAt)&&sentAt>0&&sentAt<=now?sentAt:now};' +
  'self.PloffAssSetRate=function(rate,sentAt){var nextRate=Number(rate);var messageAt=Math.max(Number(self.lastCurrentTimeReceivedAt)||0,self.PloffAssMessageTimestamp(sentAt));var elapsed;if(!isFinite(nextRate)||nextRate<=0){nextRate=1}if(!self._isPaused){elapsed=Math.max(0,messageAt-self.lastCurrentTimeReceivedAt)/1000;self.lastCurrentTime=(Number(self.lastCurrentTime)||0)+elapsed*(Number(self.rate)||1)}self.lastCurrentTimeReceivedAt=messageAt;self.rate=nextRate;if(!self.PloffAssTrackAnimated){self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead()}};' +
  'self.setCurrentTime=function(currentTime,sentAt){var now=Date.now();var messageAt=self.PloffAssMessageTimestamp(sentAt);var queueMs=Math.max(0,now-messageAt);var boundaryIndex;self.PloffAssCancelLookahead();self.PloffAssClockReceived=true;self.PloffAssSyncUpdateCount=(self.PloffAssSyncUpdateCount||0)+1;self.PloffAssLastSyncQueueMs=queueMs;self.PloffAssMaxSyncQueueMs=Math.max(self.PloffAssMaxSyncQueueMs||0,queueMs);self.lastCurrentTime=currentTime;self.lastCurrentTimeReceivedAt=messageAt;if(self.PloffAssTrackAnimated){if(self.PloffAssQueueRender("sync")){self.PloffAssSyncTriggeredRenderCount=(self.PloffAssSyncTriggeredRenderCount||0)+1}return}boundaryIndex=self.PloffAssStaticBoundaryIndex((Number(currentTime)||0)+self.delay);if(self.PloffAssStaticRenderedBoundaryIndex===null||boundaryIndex>self.PloffAssStaticRenderedBoundaryIndex){if(self.PloffAssHasPreparedBoundary(boundaryIndex)){self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead()}else if(self.PloffAssQueueRender("sync")){self.PloffAssSyncTriggeredRenderCount=(self.PloffAssSyncTriggeredRenderCount||0)+1}}else{self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead()}};');
replaceAssignment('self.setIsPaused',
  'self.setIsPaused=function(isPaused,sentAt){if(isPaused!=self._isPaused){self.PloffAssPauseTransitionCount=(self.PloffAssPauseTransitionCount||0)+1;self._isPaused=isPaused;if(isPaused){self.PloffAssCancelStaticBoundary();self.PloffAssCancelLookahead();if(self.rafId){clearTimeout(self.rafId);self.rafId=null}}else{self.lastCurrentTimeReceivedAt=self.PloffAssMessageTimestamp(sentAt);if(self.PloffAssTrackAnimated){self.PloffAssQueueRender("resume")}else{self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead()}}}};');
replaceAssignment('self.buildResultItem',
  'self.PloffAssCanPackRgba=function(){if(typeof ArrayBuffer!=="function"||typeof Uint8Array!=="function"||typeof Uint32Array!=="function"){return false}try{var buffer=new ArrayBuffer(4);var words=new Uint32Array(buffer);var bytes=new Uint8Array(buffer);words[0]=16909060;return bytes[0]===4&&bytes[1]===3&&bytes[2]===2&&bytes[3]===1}catch(ignore){return false}};' +
  'self.PloffAssUsePackedPixels=self.PloffAssCanPackRgba();' +
  'self.PloffAssAlphaLutCache={};self.PloffAssAlphaLutOrder=[];' +
  'self.PloffAssGetAlphaLut=function(alpha){var key=String(alpha);var cached=self.PloffAssAlphaLutCache[key];var lut;var i;var oldest;if(cached){return cached}lut=new Uint8ClampedArray(256);for(i=0;i<256;i+=1){lut[i]=i*alpha/255}self.PloffAssAlphaLutCache[key]=lut;self.PloffAssAlphaLutOrder.push(key);if(self.PloffAssAlphaLutOrder.length>8){oldest=self.PloffAssAlphaLutOrder.shift();delete self.PloffAssAlphaLutCache[oldest]}return lut};' +
  'self.buildResultItem=function(ptr){var bitmap=ptr.bitmap,stride=ptr.stride,w=ptr.w,h=ptr.h,color=ptr.color;if(w==0||h==0){return null}var r=color>>24&255,g=color>>16&255,b=color>>8&255,a=255-(color&255);var result=new Uint8ClampedArray(4*w*h);var alphaLut=a===255?null:self.PloffAssGetAlphaLut(a);var bitmapPosition=0;var resultPosition=0;var y;var x;var coverage;var alpha;if(self.PloffAssUsePackedPixels){var packed=new Uint32Array(result.buffer);var rgb=(r|g<<8|b<<16)>>>0;var pixel=0;for(y=0;y<h;y+=1){for(x=0;x<w;x+=1){coverage=Module.HEAPU8[bitmap+bitmapPosition+x];alpha=alphaLut?alphaLut[coverage]:coverage;packed[pixel]=(rgb|alpha<<24)>>>0;pixel+=1}bitmapPosition+=stride}}else{for(y=0;y<h;y+=1){for(x=0;x<w;x+=1){coverage=Module.HEAPU8[bitmap+bitmapPosition+x];alpha=alphaLut?alphaLut[coverage]:coverage;result[resultPosition]=r;result[resultPosition+1]=g;result[resultPosition+2]=b;result[resultPosition+3]=alpha;resultPosition+=4}bitmapPosition+=stride}}x=ptr.dst_x;y=ptr.dst_y;return{w:w,h:h,x:x,y:y,buffer:result.buffer}};');
removeAssignment('self.blendRender');
removeAssignment('self.lossyRender');
removeFunction('_applyKeys');
removeAssignment('self.runBenchmark');
removeAssignment('self.libassMemoryLimit');
removeAssignment('self.dropAllAnimations');
removeAssignment('self.fontMap_');
removeAssignment('self.fontId');

/* Retain only JavaScript bindings reachable from Ploff's worker protocol.
 * The generated native payload itself remains byte-identical to upstream.
 * Ploff configures its single packaged fallback through libass directly with
 * ASS_FONTPROVIDER_NONE, so the linked Fontconfig code stays dormant at runtime. */
trimClassMethods('ASS_Style', ['get_FontSize', 'set_FontSize'], classStart('ASS_Event'), 'ASS_Style Ploff profile');
trimClassMethods('ASS_Event', ['get_Start', 'get_Duration'], classStart('ASS_Track'), 'ASS_Event Ploff profile');
trimClassMethods('ASS_Track', ['get_n_events', 'get_styles', 'get_events'], classStart('ASS_Library'), 'ASS_Track Ploff profile');
removeClassRange('ASS_RenderPriv', 'ASS_ParserPriv', 'unused ASS_RenderPriv pointer wrapper');
removeClassRange('ASS_ParserPriv', 'ASS_Renderer', 'unused ASS_ParserPriv pointer wrapper');
trimClassMethods('libass', [
  'oct_library_init', 'oct_set_extract_fonts', 'oct_renderer_init', 'oct_set_fonts',
  'oct_free_track', 'oct_read_file'
], classStart('RenderBlendResult'), 'minimal libass init and track replacement bindings');
removeClassRange('RenderBlendResult', 'SubtitleOctopus', 'unused native blend result bindings');
trimClassMethods('SubtitleOctopus', [
  'resizeCanvas', 'renderImage', 'quitLibrary',
  'getEventCount', 'getStyleCount', 'get_track', 'set_track', 'get_ass_library',
  'set_ass_renderer', 'set_ass_library'
], assignment('Module["FS"]'), 'SubtitleOctopus Ploff profile');

addEdit(namedFunction('onMessageFromMainEmscriptenThread'),
  'function onMessageFromMainEmscriptenThread(message){if(!calledMain&&!message.data.preMain){if(!messageBuffer){messageBuffer=[];messageResenderTimeout=setTimeout(messageResender,50)}messageBuffer.push(message);return}if(calledMain&&messageResenderTimeout){clearTimeout(messageResenderTimeout);messageResender()}switch(message.data.target){case"canvas":{if(message.data.event){Module.canvas.fireEvent(message.data.event)}else if(message.data.width){if(Module.canvas&&message.data.boundingClientRect){Module.canvas.boundingClientRect=message.data.boundingClientRect}self.resize(message.data.width,message.data.height);if(!self.PloffAssAwaitingRealTrack&&self.PloffAssClockReceived){self.PloffAssQueueRender("resize")}}else throw"ey?";break}case"video":{var ploffSentAt=message.data.sentAt;var ploffHasTime=message.data.currentTime!==undefined;var ploffHasPause=message.data.isPaused!==undefined;if(ploffHasTime&&ploffHasPause&&message.data.isPaused===false){self.setIsPaused(false,ploffSentAt);self.setCurrentTime(message.data.currentTime,ploffSentAt)}else{if(ploffHasTime){self.setCurrentTime(message.data.currentTime,ploffSentAt)}if(ploffHasPause){self.setIsPaused(message.data.isPaused,ploffSentAt)}}if(message.data.rate!==undefined){self.PloffAssSetRate(message.data.rate,ploffSentAt)}break}case"ploff-discontinuity":{self.PloffAssPlaybackEpoch=Math.max(0,Number(message.data.playbackEpoch)||0);if(message.data.renderGeneration!==undefined){self.PloffAssRenderGeneration=Math.max(0,Number(message.data.renderGeneration)||0)}self.PloffAssCancelStaticBoundary();self.PloffAssResetLookahead();if(self.rafId){clearTimeout(self.rafId);self.rafId=0}self.PloffAssStaticRenderedBoundaryIndex=null;if(message.data.currentTime!==null&&message.data.currentTime!==undefined&&isFinite(Number(message.data.currentTime))){self.lastCurrentTime=Math.max(0,Number(message.data.currentTime));self.lastCurrentTimeReceivedAt=self.PloffAssMessageTimestamp(message.data.sentAt);self.PloffAssClockReceived=true}break}case"ploff-render-generation":{self.PloffAssRenderGeneration=Math.max(0,Number(message.data.renderGeneration)||0);self.PloffAssCancelStaticBoundary();self.PloffAssResetLookahead();if(self.rafId){clearTimeout(self.rafId);self.rafId=0}self.PloffAssStaticRenderedBoundaryIndex=null;break}case"ploff-prepared-state":{if(Math.max(0,Number(message.data.playbackEpoch)||0)!==self.PloffAssPlaybackEpoch||Math.max(0,Number(message.data.renderGeneration)||0)!==self.PloffAssRenderGeneration){break}var ploffPrepared=message.data.boundaryIndices||[];var ploffCostly=message.data.costlyBoundaryIndices;self.PloffAssPreparedBoundaryIndices=[];self.PloffAssPreparedCostlyBoundaryIndices=[];for(var ploffPreparedIndex=0;ploffPreparedIndex<ploffPrepared.length;ploffPreparedIndex+=1){var ploffPreparedValue=Number(ploffPrepared[ploffPreparedIndex]);if(isFinite(ploffPreparedValue)){self.PloffAssPreparedBoundaryIndices.push(ploffPreparedValue)}}if(ploffCostly&&typeof ploffCostly.length==="number"){for(var ploffCostlyIndex=0;ploffCostlyIndex<ploffCostly.length;ploffCostlyIndex+=1){var ploffCostlyValue=Number(ploffCostly[ploffCostlyIndex]);if(isFinite(ploffCostlyValue)){self.PloffAssPreparedCostlyBoundaryIndices.push(ploffCostlyValue)}}}else{for(var ploffFallbackIndex=0;ploffFallbackIndex<self.PloffAssPreparedBoundaryIndices.length&&ploffFallbackIndex<5;ploffFallbackIndex+=1){self.PloffAssPreparedCostlyBoundaryIndices.push(self.PloffAssPreparedBoundaryIndices[ploffFallbackIndex])}}var ploffCommittedRaw=message.data.committedBoundaryIndex;var ploffCommitted=Number(ploffCommittedRaw);if(ploffCommittedRaw!==null&&ploffCommittedRaw!==undefined&&isFinite(ploffCommitted)){if(self.PloffAssStaticRenderedBoundaryIndex===null||ploffCommitted>self.PloffAssStaticRenderedBoundaryIndex){self.PloffAssStaticRenderedBoundaryIndex=ploffCommitted}for(var ploffAttemptedKey in self.PloffAssLookaheadAttempted){if(self.PloffAssLookaheadAttempted.hasOwnProperty(ploffAttemptedKey)&&Number(ploffAttemptedKey)<=ploffCommitted){delete self.PloffAssLookaheadAttempted[ploffAttemptedKey]}}}self.PloffAssScheduleLookahead();break}case"tock":{clientFrameId=message.data.id;break}case"worker-init":{PloffAssTimingMark("worker-init-received");screen.width=self.width=message.data.width;screen.height=self.height=message.data.height;self.subContent=message.data.subContent;self.fallbackFont=message.data.fallbackFont;self.debug=message.data.debug;if(!hasNativeConsole&&self.debug){console=makeCustomConsole();console.log("overridden console")}if(Module.canvas){Module.canvas.width_=message.data.width;Module.canvas.height_=message.data.height;if(message.data.boundingClientRect){Module.canvas.boundingClientRect=message.data.boundingClientRect}}self.PloffAssAnimatedFps=message.data.targetFps||self.targetFps;self.targetFps=self.PloffAssAnimatedFps;self.PloffAssTrackAnimated=true;self.PloffAssStaticBoundaries=[];self.PloffAssStaticBoundaryTimer=0;self.PloffAssStaticRenderedBoundaryIndex=null;self.PloffAssFrameSeq=0;self.PloffAssPlaybackEpoch=0;self.PloffAssRenderGeneration=Math.max(0,Number(message.data.renderGeneration)||0);self.PloffAssLookaheadTimer=0;self.PloffAssPreparedBoundaryIndices=[];self.PloffAssPreparedCostlyBoundaryIndices=[];self.PloffAssLookaheadAttempted={};self.PloffAssRenderOverrideTime=null;self.PloffAssRenderPrepared=false;self.PloffAssRecentRenderMs=0;self.PloffAssLookaheadStarted=0;self.PloffAssLookaheadCompleted=0;self.PloffAssClockReceived=false;removeRunDependency("worker-init");PloffAssTimingMark("worker-ready");postMessage({target:"ready"});break}case"destroy":self.PloffAssCancelStaticBoundary();self.PloffAssCancelLookahead();self.octObj.quitLibrary();break;case"set-track":if(message.data.renderGeneration!==undefined){self.PloffAssRenderGeneration=Math.max(0,Number(message.data.renderGeneration)||0)}self.setTrack(message.data.content);break;case"ploff-warm-step":self.PloffAssWarmRender(message.data.index,message.data.time,message.data.last===true);break;case"ploff-warm-cancel":self.PloffAssWarmCancelled=true;self.PloffAssAwaitingRealTrack=true;self.PloffAssCancelStaticBoundary();break;case"get-events":PloffAssTimingMark("get-events");self.octObj.getEventCount();postMessage({target:"get-events",time:Date.now(),events:[]});break;case"ploff-frame-barrier":postMessage({target:"ploff-frame-barrier"});break;case"get-styles":var styles=[];var track=self.octObj.get_track();for(var i=0;i<self.octObj.getStyleCount();i++){var styl_ptr=track.get_styles(i);styles.push({_index:i,FontSize:styl_ptr.get_FontSize()})}postMessage({target:"get-styles",time:Date.now(),styles:styles});break;case"set-style":var style=message.data.style;var index=message.data.index;if(style&&style.FontSize!==undefined){self.octObj.get_track().get_styles(index).set_FontSize(style.FontSize);if(self.PloffAssClockReceived&&!self.PloffAssTrackAnimated){self.PloffAssQueueRender("style")}}break;case"setimmediate":{if(Module["setImmediates"])Module["setImmediates"].shift()();break}default:throw"wha? "+message.data.target}}',
  'Ploff worker protocol');

var profiledOutput = applyEdits(source);
var renderClockNeedle = 'var renderResult=self.octObj.renderImage(self.getCurrentTime()+self.delay,self.changed);';
var renderClockReplacement = 'var ploffPreparedFrame=self.PloffAssRenderPrepared===true;var renderTime=self.PloffAssRenderOverrideTime!==null&&self.PloffAssRenderOverrideTime!==undefined&&isFinite(Number(self.PloffAssRenderOverrideTime))?Number(self.PloffAssRenderOverrideTime):self.getCurrentTime()+self.delay;self.PloffAssRenderOverrideTime=null;self.PloffAssRenderPrepared=false;var renderClockAgeMs=Math.max(0,Date.now()-self.lastCurrentTimeReceivedAt);var ploffRenderReason=self.PloffAssNextRenderReason||"loop";var ploffBoundaryState=self.PloffAssTrackAnimated?null:self.PloffAssBoundaryState(renderTime);self.PloffAssNextRenderReason="";if(!ploffPreparedFrame&&!self.PloffAssTrackAnimated&&self.PloffAssStaticRenderedBoundaryIndex!==null&&ploffBoundaryState.index<self.PloffAssStaticRenderedBoundaryIndex){if(!self._isPaused){self.PloffAssScheduleStaticBoundary();self.PloffAssScheduleLookahead()}return}self.PloffAssRenderCount=(self.PloffAssRenderCount||0)+1;var ploffLibassStart=performance.now();var renderResult=self.octObj.renderImage(renderTime,self.changed);var ploffLibassMs=performance.now()-ploffLibassStart;self.PloffAssRecentRenderMs=self.PloffAssRecentRenderMs>0?self.PloffAssRecentRenderMs*0.7+ploffLibassMs*0.3:ploffLibassMs;self.PloffAssLibassTotalMs=(self.PloffAssLibassTotalMs||0)+ploffLibassMs;self.PloffAssMaxLibassMs=Math.max(self.PloffAssMaxLibassMs||0,ploffLibassMs);';
if (profiledOutput.indexOf(renderClockNeedle) < 0 || profiledOutput.indexOf(renderClockNeedle) !== profiledOutput.lastIndexOf(renderClockNeedle)) {
  throw new Error('Unable to locate the single legacy libass render call');
}
profiledOutput = profiledOutput.replace(renderClockNeedle, renderClockReplacement);
var renderChangedNeedle = 'var changed=Module.getValue(self.changed,"i32");if(changed!=0||force){';
var renderChangedReplacement = 'var changed=Module.getValue(self.changed,"i32");var ploffFrameBudgetMs=1000/self.targetFps;if(ploffLibassMs>ploffFrameBudgetMs){self.PloffAssSlowLibassRenderCount=(self.PloffAssSlowLibassRenderCount||0)+1;if(changed==0&&!force){self.PloffAssSlowUnchangedRenderCount=(self.PloffAssSlowUnchangedRenderCount||0)+1;self.PloffAssMaxUnchangedLibassMs=Math.max(self.PloffAssMaxUnchangedLibassMs||0,ploffLibassMs);self.PloffAssLastSlowUnchangedLibassMs=ploffLibassMs;self.PloffAssLastSlowUnchangedMediaTime=renderTime;self.PloffAssLastSlowUnchangedClockAgeMs=renderClockAgeMs;self.PloffAssLastSlowUnchangedReason=ploffRenderReason}}if(changed!=0||force||ploffPreparedFrame){';
if (profiledOutput.indexOf(renderChangedNeedle) < 0 || profiledOutput.indexOf(renderChangedNeedle) !== profiledOutput.lastIndexOf(renderChangedNeedle)) {
  throw new Error('Unable to locate the single legacy changed-frame branch');
}
profiledOutput = profiledOutput.replace(renderChangedNeedle, renderChangedReplacement);
var renderBuildNeedle = 'var result=self.buildResult(renderResult);var spentTime=performance.now()-startTime;';
var renderBuildReplacement = 'var ploffBlendStart=performance.now();var result=self.buildResult(renderResult);var ploffBlendMs=performance.now()-ploffBlendStart;self.PloffAssBlendTotalMs=(self.PloffAssBlendTotalMs||0)+ploffBlendMs;self.PloffAssMaxBlendMs=Math.max(self.PloffAssMaxBlendMs||0,ploffBlendMs);self.PloffAssChangedRenderCount=(self.PloffAssChangedRenderCount||0)+1;self.PloffAssFrameSeq=(self.PloffAssFrameSeq||0)+1;var ploffFrameSeq=self.PloffAssFrameSeq;var ploffFrameFingerprint=self.PloffAssFrameFingerprint(result[0]);var ploffBitmapCount=result[0].length;var ploffPixelCount=0;for(var ploffBitmapIndex=0;ploffBitmapIndex<ploffBitmapCount;ploffBitmapIndex+=1){ploffPixelCount+=result[0][ploffBitmapIndex].w*result[0][ploffBitmapIndex].h}var spentTime=performance.now()-startTime;if(spentTime>1000/self.targetFps){self.PloffAssSlowRenderCount=(self.PloffAssSlowRenderCount||0)+1}';
if (profiledOutput.indexOf(renderBuildNeedle) < 0 || profiledOutput.indexOf(renderBuildNeedle) !== profiledOutput.lastIndexOf(renderBuildNeedle)) {
  throw new Error('Unable to locate the single legacy result build');
}
profiledOutput = profiledOutput.replace(renderBuildNeedle, renderBuildReplacement);
var renderNeedle = 'postMessage({target:"canvas",op:"renderCanvas",time:Date.now(),spentTime:spentTime,canvases:result[0]},result[1])';
var renderReplacement = 'if(!self.PloffAssFirstRender){self.PloffAssFirstRender=1;PloffAssTimingMark("first-render-message")};postMessage({target:"canvas",op:"renderCanvas",time:Date.now(),mediaTime:renderTime,clockAnchor:self.lastCurrentTime,clockAgeMs:renderClockAgeMs,workerPaused:self._isPaused,spentTime:spentTime,libassMs:ploffLibassMs,blendMs:ploffBlendMs,bitmapCount:ploffBitmapCount,pixelCount:ploffPixelCount,renderCount:self.PloffAssRenderCount||0,changedRenderCount:self.PloffAssChangedRenderCount||0,frameSeq:ploffFrameSeq,frameFingerprint:ploffFrameFingerprint,libassTotalMs:self.PloffAssLibassTotalMs||0,blendTotalMs:self.PloffAssBlendTotalMs||0,syncUpdateCount:self.PloffAssSyncUpdateCount||0,syncTriggeredRenderCount:self.PloffAssSyncTriggeredRenderCount||0,pauseTransitionCount:self.PloffAssPauseTransitionCount||0,syncQueueMs:self.PloffAssLastSyncQueueMs||0,maxSyncQueueMs:self.PloffAssMaxSyncQueueMs||0,maxLibassMs:self.PloffAssMaxLibassMs||0,maxBlendMs:self.PloffAssMaxBlendMs||0,slowRenderCount:self.PloffAssSlowRenderCount||0,slowLibassRenderCount:self.PloffAssSlowLibassRenderCount||0,slowUnchangedRenderCount:self.PloffAssSlowUnchangedRenderCount||0,maxUnchangedLibassMs:self.PloffAssMaxUnchangedLibassMs||0,lastSlowUnchangedLibassMs:self.PloffAssLastSlowUnchangedLibassMs||0,lastSlowUnchangedMediaTime:self.PloffAssLastSlowUnchangedMediaTime||0,lastSlowUnchangedClockAgeMs:self.PloffAssLastSlowUnchangedClockAgeMs||0,lastSlowUnchangedReason:self.PloffAssLastSlowUnchangedReason||"",workerWarmStepCount:self.PloffAssWarmStepCount||0,workerWarmTotalMs:self.PloffAssWarmTotalMs||0,workerWarmMaxMs:self.PloffAssWarmMaxMs||0,workerWarmLastMs:self.PloffAssWarmLastMs||0,workerWarmComplete:self.PloffAssWarmComplete===true,trackAnimated:self.PloffAssTrackAnimated===true,effectiveTargetFps:self.PloffAssTrackAnimated?self.targetFps:0,renderReason:ploffRenderReason,prepared:ploffPreparedFrame,lookaheadStarted:self.PloffAssLookaheadStarted||0,lookaheadCompleted:self.PloffAssLookaheadCompleted||0,recentRenderMs:self.PloffAssRecentRenderMs||0,workerPreparedDepth:(self.PloffAssPreparedBoundaryIndices||[]).length,workerPreparedCostlyDepth:(self.PloffAssPreparedCostlyBoundaryIndices||[]).length,playbackEpoch:self.PloffAssPlaybackEpoch||0,renderGeneration:self.PloffAssRenderGeneration||0,boundaryIndex:ploffBoundaryState?ploffBoundaryState.index:null,validFrom:ploffBoundaryState?ploffBoundaryState.validFrom:null,validUntil:ploffBoundaryState?ploffBoundaryState.validUntil:null,canvases:result[0]},result[1])';
if (profiledOutput.indexOf(renderNeedle) < 0 || profiledOutput.indexOf(renderNeedle) !== profiledOutput.lastIndexOf(renderNeedle)) {
  throw new Error('Unable to locate the single legacy canvas render message');
}
profiledOutput = profiledOutput.replace(renderNeedle, renderReplacement);
var renderLoopNeedle = 'if(!self._isPaused){self.rafId=self.requestAnimationFrame(self.render)}};';
var renderLoopReplacement = 'if(!self.PloffAssTrackAnimated){var ploffRenderedBoundaryIndex=self.PloffAssStaticBoundaryIndex(renderTime);if(!ploffPreparedFrame){if(self.PloffAssStaticRenderedBoundaryIndex===null||ploffRenderedBoundaryIndex>self.PloffAssStaticRenderedBoundaryIndex){self.PloffAssStaticRenderedBoundaryIndex=ploffRenderedBoundaryIndex}}else{self.PloffAssLookaheadCompleted=(self.PloffAssLookaheadCompleted||0)+1}}if(!self._isPaused){if(self.PloffAssTrackAnimated){self.rafId=self.requestAnimationFrame(self.render)}else{self.PloffAssScheduleStaticBoundary();if(!ploffPreparedFrame){self.PloffAssScheduleLookahead()}}}};';
if (profiledOutput.indexOf(renderLoopNeedle) < 0 || profiledOutput.indexOf(renderLoopNeedle) !== profiledOutput.lastIndexOf(renderLoopNeedle)) {
  throw new Error('Unable to locate the single legacy render-loop scheduler');
}
profiledOutput = profiledOutput.replace(renderLoopNeedle, renderLoopReplacement);
var externalized = externalizeStaticMemory(profiledOutput);
var output = externalized.output;
var sourceBytes = Buffer.byteLength(source, 'utf8');
var outputBytes = Buffer.byteLength(output, 'utf8');
acorn.parse(output, { ecmaVersion: 2020, sourceType: 'script' });
if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
    throw new Error('Legacy ASS worker is not synchronized; run npm run build:ass-legacy-worker');
  }
  if (!fs.existsSync(memoryOutputPath) || !fs.readFileSync(memoryOutputPath).equals(externalized.memory)) {
    throw new Error('Legacy ASS worker static memory is not synchronized; run npm run build:ass-legacy-worker');
  }
} else {
  fs.writeFileSync(outputPath, output);
  fs.writeFileSync(memoryOutputPath, externalized.memory);
}
console.log('Legacy ASS worker' + (checkOnly ? ' check' : '') + ': ' + sourceBytes + ' -> ' + outputBytes + ' JS bytes (' +
  Math.round((1 - outputBytes / sourceBytes) * 1000) / 10 + '% smaller), ' + externalized.memory.length +
  ' external memory bytes from ' + externalized.segmentCount + ' segments');

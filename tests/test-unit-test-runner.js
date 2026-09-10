'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var root = path.join(__dirname, '..');
var runner = path.join(root, 'scripts', 'run-unit-tests.js');
var temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ploff-unit-runner-'));
var eventLog = path.join(temp, 'events.log');

function quoted(value) {
  return JSON.stringify(String(value));
}

function writeTest(name, delay, exitCode, marker) {
  var fileName = path.join(temp, name + '.js');
  var source = [
    "'use strict';",
    "var fs = require('fs');",
    "var path = require('path');",
    "var log = process.env.PLOFF_RUNNER_EVENT_LOG;",
    "fs.appendFileSync(log, 'start ' + path.basename(__filename) + '\\n');",
    marker ? "fs.appendFileSync(" + quoted(marker) + ", 'ran\\n');" : '',
    'setTimeout(function () {',
    "  fs.appendFileSync(log, 'end ' + path.basename(__filename) + '\\n');",
    "  console.log('fixture ' + path.basename(__filename));",
    '  process.exitCode = ' + exitCode + ';',
    '}, ' + delay + ');'
  ].filter(Boolean).join('\n');
  fs.writeFileSync(fileName, source);
  return fileName;
}

function writeBarrierTest(name, releaseFile, exitCode, startedFile) {
  var fileName = path.join(temp, name + '.js');
  var source = [
    "'use strict';",
    "var fs = require('fs');",
    "var path = require('path');",
    "var log = process.env.PLOFF_RUNNER_EVENT_LOG;",
    'var releaseFile = ' + quoted(releaseFile) + ';',
    'var deadline = Date.now() + 5000;',
    "fs.appendFileSync(log, 'start ' + path.basename(__filename) + '\\n');",
    startedFile ? 'fs.writeFileSync(' + quoted(startedFile) + ", 'started');" : '',
    'function finish() {',
    '  process.exitCode = ' + Number(exitCode || 0) + ';',
    "  fs.appendFileSync(log, 'end ' + path.basename(__filename) + '\\n');",
    "  console.log('fixture ' + path.basename(__filename));",
    '}',
    'function waitForRelease() {',
    '  if (fs.existsSync(releaseFile)) { finish(); return; }',
    "  if (Date.now() > deadline) { console.error('barrier timeout'); process.exitCode = 9; return; }",
    '  setTimeout(waitForRelease, 10);',
    '}',
    'waitForRelease();'
  ].join('\n');
  fs.writeFileSync(fileName, source);
  return fileName;
}

function writeReleaseCoordinator(releaseFile, markerFile, expectedStarts) {
  var fileName = path.join(temp, 'release-coordinator.js');
  var source = [
    "'use strict';",
    "var fs = require('fs');",
    'var eventLog = ' + quoted(eventLog) + ';',
    'var releaseFile = ' + quoted(releaseFile) + ';',
    'var markerFile = ' + quoted(markerFile) + ';',
    'var deadline = Date.now() + 5000;',
    'function startCount() {',
    "  if (!fs.existsSync(eventLog)) { return 0; }",
    "  return fs.readFileSync(eventLog, 'utf8').split(/\\n+/).filter(function (line) { return line.indexOf('start ') === 0; }).length;",
    '}',
    'function poll() {',
    '  var count = startCount();',
    '  if (count >= ' + expectedStarts + ') {',
    "    fs.writeFileSync(markerFile, 'overlap');",
    "    fs.writeFileSync(releaseFile, 'go');",
    '    return;',
    '  }',
    '  if (Date.now() > deadline) {',
    "    fs.writeFileSync(markerFile, 'timeout:' + count);",
    "    fs.writeFileSync(releaseFile, 'go');",
    '    return;',
    '  }',
    '  setTimeout(poll, 10);',
    '}',
    'poll();'
  ].join('\n');
  fs.writeFileSync(fileName, source);
  return fileName;
}

function run(files, jobs, logPath, overrides, stdoutFile, stderrFile) {
  var env = Object.assign({}, process.env, {
    PLOFF_TEST_JOBS: String(jobs),
    PLOFF_TEST_PROGRESS_MS: '0',
    PLOFF_TEST_TIMEOUT_MS: '0',
    PLOFF_RUNNER_EVENT_LOG: logPath
  }, overrides || {});
  var outputFd = stdoutFile ? fs.openSync(stdoutFile, 'w') : null;
  var errorFd = stderrFile ? fs.openSync(stderrFile, 'w') : null;
  try {
    var result = childProcess.spawnSync(process.execPath, [runner].concat(files), {
      cwd: root,
      env: env,
      encoding: 'utf8',
      timeout: 7000,
      stdio: ['ignore', outputFd === null ? 'pipe' : outputFd, errorFd === null ? 'pipe' : errorFd]
    });
    if (stdoutFile) { result.stdout = fs.readFileSync(stdoutFile, 'utf8'); }
    if (stderrFile) { result.stderr = fs.readFileSync(stderrFile, 'utf8'); }
    return result;
  } finally {
    if (outputFd !== null) { fs.closeSync(outputFd); }
    if (errorFd !== null) { fs.closeSync(errorFd); }
  }
}

function writeProgressCoordinator(releaseFile, outputFile, testName) {
  var fileName = path.join(temp, 'progress-coordinator.js');
  fs.writeFileSync(fileName, [
    "'use strict';",
    "var fs = require('fs');",
    'var deadline = Date.now() + 5000;',
    'function poll() {',
    '  var output = fs.existsSync(' + quoted(outputFile) + ') ? fs.readFileSync(' + quoted(outputFile) + ", 'utf8') : '';",
    "  if (output.indexOf('[tests] Running:') >= 0 && output.indexOf(" + quoted(testName) + ') >= 0) {',
    '    fs.writeFileSync(' + quoted(releaseFile) + ", 'progress'); return;",
    '  }',
    '  if (Date.now() > deadline) { fs.writeFileSync(' + quoted(releaseFile) + ", 'deadline'); return; }",
    '  setTimeout(poll, 10);',
    '}',
    'poll();'
  ].join('\n'));
  return fileName;
}

function maxConcurrency(lines) {
  var active = 0;
  var maximum = 0;
  lines.forEach(function (line) {
    if (line.indexOf('start ') === 0) { active += 1; maximum = Math.max(maximum, active); }
    if (line.indexOf('end ') === 0) { active -= 1; }
  });
  assert.strictEqual(active, 0, 'all started fixture processes must finish');
  return maximum;
}

var releaseFile = path.join(temp, 'parallel-release');
var overlapMarker = path.join(temp, 'parallel-overlap');
var releaseCoordinator = writeReleaseCoordinator(releaseFile, overlapMarker, 2);
var parallelFiles = [];
var index;
for (index = 0; index < 5; index += 1) {
  parallelFiles.push(writeBarrierTest('parallel-' + index, releaseFile));
}
childProcess.spawn(process.execPath, [releaseCoordinator], { cwd: root, stdio: 'ignore' });
var parallelResult = run(parallelFiles, 2, eventLog);
assert.strictEqual(parallelResult.status, 0, parallelResult.stderr || parallelResult.stdout);
assert.strictEqual(fs.readFileSync(overlapMarker, 'utf8'), 'overlap',
  'two child processes must start before the barrier is released');
var events = fs.readFileSync(eventLog, 'utf8').trim().split(/\n+/);
assert.strictEqual(maxConcurrency(events), 2, 'runner must honor the configured concurrency and actually overlap independent tests');
parallelFiles.forEach(function (fileName) {
  assert.ok(parallelResult.stdout.indexOf(path.basename(fileName)) >= 0, 'runner output must identify each completed test file');
});

assert.strictEqual((parallelResult.stdout.match(/\(\d+ ms\) ===/g) || []).length, parallelFiles.length,
  'each completed test file must report elapsed milliseconds');

fs.writeFileSync(eventLog, '');
var skippedMarker = path.join(temp, 'must-not-run.txt');
var failureFiles = [
  writeTest('failure-first', 10, 7, ''),
  writeTest('must-not-start', 10, 0, skippedMarker)
];
var failureResult = run(failureFiles, 1, eventLog);
assert.strictEqual(failureResult.status, 1, 'a failing child test must make the runner fail');
assert.strictEqual(fs.existsSync(skippedMarker), false, 'runner must stop scheduling new tests after the first failure');
assert.ok(failureResult.stderr.indexOf('failure-first.js') >= 0 || failureResult.stdout.indexOf('failure-first.js') >= 0,
  'failure output must identify the failing test');

fs.writeFileSync(eventLog, '');
var progressRelease = path.join(temp, 'progress-release');
var progressOutput = path.join(temp, 'progress-output.log');
var progressFile = writeBarrierTest('progress-waiting', progressRelease);
var progressCoordinator = writeProgressCoordinator(progressRelease, progressOutput, 'progress-waiting.js');
childProcess.spawn(process.execPath, [progressCoordinator], { cwd: root, stdio: 'ignore' });
var progressResult = run([progressFile], 1, eventLog, { PLOFF_TEST_PROGRESS_MS: '10' }, progressOutput);
assert.strictEqual(progressResult.status, 0, progressResult.stderr || progressResult.stdout);
assert.strictEqual(fs.readFileSync(progressRelease, 'utf8'), 'progress',
  'a running-file report must release the fixture before completion, without waiting for buffered child output');
assert.ok(progressResult.stdout.indexOf('[tests] Running:') < progressResult.stdout.indexOf('=== '),
  'progress must identify the active test before its completed output block');

fs.writeFileSync(eventLog, '');
var timeoutFile = path.join(temp, 'timeout-stubborn.js');
fs.writeFileSync(timeoutFile, [
  "'use strict';",
  "console.log('before timeout');",
  "process.on('SIGTERM', function () {});",
  'setTimeout(function () { process.exitCode = 9; }, 5000);'
].join('\n'));
var timeoutSkipped = path.join(temp, 'timeout-must-not-run');
var timeoutResult = run([
  timeoutFile,
  writeTest('timeout-queued', 10, 0, timeoutSkipped)
], 1, eventLog, { PLOFF_TEST_TIMEOUT_MS: '1000', PLOFF_TEST_PROGRESS_MS: '10' });
assert.strictEqual(timeoutResult.status, 1, 'an expired child timeout must fail the runner');
assert.ok(timeoutResult.stderr.indexOf('Test timed out after 1000 ms') >= 0,
  'timeout output must distinguish an expired deadline from a normal test failure');
assert.ok(timeoutResult.stderr.indexOf('before timeout') >= 0, 'timeout must retain buffered child diagnostics');
assert.strictEqual(fs.existsSync(timeoutSkipped), false, 'a timeout must stop queued tests');
assert.strictEqual((timeoutResult.stderr.match(/=== .*timeout-stubborn.js/g) || []).length, 1,
  'a timed-out child must settle and print exactly once');
assert.strictEqual(timeoutResult.error, undefined, 'the runner must kill the child and clear its progress timer');

var timedSuccess = run([writeTest('timeout-success', 10, 0, '')], 1, eventLog,
  { PLOFF_TEST_TIMEOUT_MS: '1000', PLOFF_TEST_PROGRESS_MS: '10' });
assert.strictEqual(timedSuccess.status, 0, timedSuccess.stderr || timedSuccess.stdout);
assert.strictEqual(timedSuccess.error, undefined, 'successful children must clear their timeout and progress timers');
assert.strictEqual(parallelResult.stdout.indexOf('[tests] Running:'), -1, 'zero must disable progress reporting');

fs.writeFileSync(eventLog, '');
var drainStarted = path.join(temp, 'drain-active-started');
var drainRelease = path.join(temp, 'drain-active-release');
var drainOutput = path.join(temp, 'drain-errors.log');
var drainCoordinator = path.join(temp, 'drain-coordinator.js');
fs.writeFileSync(drainCoordinator, [
  "var fs = require('fs');",
  'var deadline = Date.now() + 5000;',
  'function poll() {',
  '  var text = fs.existsSync(' + quoted(drainOutput) + ') ? fs.readFileSync(' + quoted(drainOutput) + ", 'utf8') : '';",
  "  if (text.indexOf('drain-failure.js') >= 0) { fs.writeFileSync(" + quoted(drainRelease) + ", 'failure observed'); return; }",
  "  if (Date.now() > deadline) { fs.writeFileSync(" + quoted(drainRelease) + ", 'deadline'); return; }",
  '  setTimeout(poll, 10);',
  '}',
  'poll();'
].join('\n'));
var drainFiles = [
  writeBarrierTest('drain-failure', drainStarted, 7),
  writeBarrierTest('drain-active', drainRelease, 0, drainStarted),
  writeTest('drain-queued', 10, 0, skippedMarker)
];
childProcess.spawn(process.execPath, [drainCoordinator], { cwd: root, stdio: 'ignore' });
var drainResult = run(drainFiles, 2, eventLog, { PLOFF_TEST_PROGRESS_MS: '10' }, null, drainOutput);
assert.strictEqual(fs.readFileSync(drainRelease, 'utf8'), 'failure observed',
  'active child finishes only after the runner reports its peer failure, not after a guessed sleep');
assert.strictEqual(drainResult.status, 1);
assert.ok(drainResult.stdout.indexOf('fixture drain-active.js') >= 0,
  'already active children must finish and keep their output after another child fails');
assert.strictEqual(fs.existsSync(skippedMarker), false, 'normal failure must not start queued children');
assert.strictEqual(maxConcurrency(fs.readFileSync(eventLog, 'utf8').trim().split(/\n+/)), 2);

var signalFile = path.join(temp, 'terminated.js');
fs.writeFileSync(signalFile, "process.kill(process.pid, 'SIGTERM');\n");
var signalResult = run([signalFile], 1, eventLog, { PLOFF_TEST_PROGRESS_MS: '10' });
assert.strictEqual(signalResult.status, 1);
assert.ok(signalResult.stderr.indexOf('Test process terminated by SIGTERM') >= 0);
assert.strictEqual(signalResult.error, undefined, 'signal termination must clear runner-owned timers');

fs.rmSync(temp, { recursive: true, force: true });
console.log('Unit test runner checks passed');

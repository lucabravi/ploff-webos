'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var testsDirectory = path.join(root, 'tests');

function numberSetting(name, fallback) {
  var value = Number(process.env[name]);
  return isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
}

function durationSetting(value, fallback) {
  if (value === undefined || value === null || value === '') { return fallback; }
  var number = Number(value);
  return isFinite(number) && number >= 0 && number <= 2147483647 ? Math.floor(number) : fallback;
}

function defaultFiles() {
  return fs.readdirSync(testsDirectory).filter(function (name) {
    return /^test-.*\.js$/.test(name);
  }).sort().map(function (name) {
    return path.join(testsDirectory, name);
  });
}

function normalizeFiles(values) {
  return values.map(function (fileName) {
    return path.resolve(root, fileName);
  });
}

function elapsedMs(started) {
  var elapsed = process.hrtime(started);
  return Math.round(elapsed[0] * 1000 + elapsed[1] / 1000000);
}

function outputBlock(fileName, stdout, stderr, failed, durationMs) {
  var relative = path.relative(root, fileName) || fileName;
  var target = failed ? process.stderr : process.stdout;
  target.write('=== ' + relative + ' (' + durationMs + ' ms) ===\n');
  if (stdout) { target.write(stdout); if (stdout.charAt(stdout.length - 1) !== '\n') { target.write('\n'); } }
  if (stderr) { target.write(stderr); if (stderr.charAt(stderr.length - 1) !== '\n') { target.write('\n'); } }
}

function run(files, options, callback) {
  var list = normalizeFiles(files && files.length ? files : defaultFiles());
  var settings = options || {};
  var jobs = Math.max(1, Number(settings.jobs || numberSetting('PLOFF_TEST_JOBS', 4)) || 1);
  var nextIndex = 0;
  var running = [];
  var progressMs = durationSetting(settings.progressMs, durationSetting(process.env.PLOFF_TEST_PROGRESS_MS, 15000));
  var progressTimer = null;
  var timeoutMs = durationSetting(settings.timeoutMs, durationSetting(process.env.PLOFF_TEST_TIMEOUT_MS, 0));
  var failed = false;
  var finished = false;

  function complete() {
    if (finished || running.length > 0 || (!failed && nextIndex < list.length)) { return; }
    finished = true;
    if (progressTimer !== null) { clearInterval(progressTimer); progressTimer = null; }
    callback(failed ? 1 : 0);
  }

  function schedule() {
    var fileName;
    var child;
    while (!failed && running.length < jobs && nextIndex < list.length) {
      fileName = list[nextIndex];
      nextIndex += 1;
      child = childProcess.spawn(process.execPath, [fileName], {
        cwd: root,
        env: process.env
      });
      (function (currentFile, currentChild) {
        var started = process.hrtime();
        var record = { fileName: currentFile, started: started };
        running.push(record);
        var childStdout = '';
        var childStderr = '';
        var settled = false;
        var timeoutTimer = null;
        var timedOut = false;

        function settle(childFailed) {
          if (settled) { return; }
          settled = true;
          if (timeoutTimer !== null) { clearTimeout(timeoutTimer); timeoutTimer = null; }
          if (childFailed) { failed = true; }
          running.splice(running.indexOf(record), 1);
          outputBlock(currentFile, childStdout, childStderr, childFailed, elapsedMs(started));
          schedule();
          complete();
        }

        if (timeoutMs > 0) {
          timeoutTimer = setTimeout(function () {
            timedOut = true;
            failed = true;
            childStderr += 'Test timed out after ' + timeoutMs + ' ms; terminating test process.\n';
            currentChild.kill('SIGKILL');
          }, timeoutMs);
        }
        if (currentChild.stdout) {
          currentChild.stdout.on('data', function (chunk) { childStdout += String(chunk); });
        }
        if (currentChild.stderr) {
          currentChild.stderr.on('data', function (chunk) { childStderr += String(chunk); });
        }
        currentChild.on('error', function (error) {
          if (settled) { return; }
          childStderr += String(error && error.stack || error || 'Unable to start test process') + '\n';
          settle(true);
        });
        currentChild.on('close', function (code, signal) {
          if (settled) { return; }
          if (signal && !timedOut) { childStderr += 'Test process terminated by ' + signal + '.\n'; }
          settle(timedOut || code !== 0);
        });
      }(fileName, child));
    }
    complete();
  }

  if (!list.length) { callback(0); return; }
  if (progressMs > 0) {
    progressTimer = setInterval(function () {
      if (!running.length) { return; }
      process.stdout.write('[tests] Running: ' + running.map(function (record) {
        return path.relative(root, record.fileName) + ' (' + elapsedMs(record.started) + ' ms)';
      }).join(', ') + '\n');
    }, progressMs);
  }
  schedule();
}

if (require.main === module) {
  run(process.argv.slice(2), {}, function (status) { process.exitCode = status; });
}

module.exports = {
  defaultFiles: defaultFiles,
  run: run
};

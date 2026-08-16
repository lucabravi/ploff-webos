'use strict';

var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var ReleaseMetadata = require('./check-release-metadata');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function plan(root) {
  var projectRoot = path.resolve(root || path.join(__dirname, '..'));
  var metadata = ReleaseMetadata.check(projectRoot);
  var appInfo = JSON.parse(fs.readFileSync(path.join(projectRoot, 'webos-shell-app', 'appinfo.json'), 'utf8'));
  var artifact = path.join(projectRoot, 'dist', String(appInfo.id) + '_' + metadata.version + '_all.ipk');
  return {
    root: projectRoot,
    version: metadata.version,
    artifact: artifact,
    checksumFile: path.join(projectRoot, 'dist', 'SHA256SUMS'),
    steps: [
      { label: 'build styles', command: npmCommand(), args: ['run', 'build:styles'] },
      { label: 'build app bundle', command: npmCommand(), args: ['run', 'build:app'] },
      { label: 'pre-release verification', command: npmCommand(), args: ['run', 'test:pre-release'] },
      { label: 'package webOS shell', command: 'sh', args: ['scripts/package-tv-shell.sh'] },
      { label: 'inspect IPK', command: 'sh', args: ['scripts/inspect-ipk.sh', artifact] }
    ]
  };
}

function defaultRunner(step, root) {
  var result = childProcess.spawnSync(step.command, step.args, { cwd: root, stdio: 'inherit' });
  if (result.error) { throw result.error; }
  return { status: result.status === null ? 1 : result.status };
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function run(root, options) {
  var values = options || {};
  var release = plan(root);
  var runner = values.runner || defaultRunner;
  var index;
  var result;
  var digest;
  for (index = 0; index < release.steps.length; index += 1) {
    result = runner(release.steps[index], release.root) || { status: 1 };
    if (Number(result.status) !== 0) {
      throw new Error(release.steps[index].label + ' failed with exit code ' + String(result.status));
    }
  }
  if (!fs.existsSync(release.artifact)) {
    throw new Error('packaged IPK not found: ' + release.artifact);
  }
  digest = sha256(release.artifact);
  fs.writeFileSync(release.checksumFile, digest + '  ' + path.basename(release.artifact) + '\n');
  release.sha256 = digest;
  return release;
}

function formatStep(step) {
  return step.command + ' ' + step.args.map(function (value) {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }).join(' ');
}

if (require.main === module) {
  try {
    var releasePlan = plan(path.resolve(__dirname, '..'));
    if (process.argv.indexOf('--dry-run') !== -1) {
      console.log('Ploff release package plan v' + releasePlan.version + ':');
      releasePlan.steps.forEach(function (step) { console.log('- ' + step.label + ': ' + formatStep(step)); });
      console.log('- checksum: ' + releasePlan.checksumFile);
    } else {
      var completed = run(releasePlan.root);
      console.log('Release package ready: ' + completed.artifact);
      console.log('SHA-256: ' + completed.sha256);
      console.log('Checksums: ' + completed.checksumFile);
    }
  } catch (error) {
    console.error('Release packaging failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  plan: plan,
  run: run,
  sha256: sha256
};

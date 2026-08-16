'use strict';

var fs = require('fs');
var path = require('path');

function fail(message) {
  throw new Error(message);
}

function isSemanticVersion(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(String(value || ''));
}

function validateVersions(values) {
  var metadata = values || {};
  var packageVersion = String(metadata.packageVersion || '');
  var lockVersion = String(metadata.lockVersion || '');
  var appVersion = String(metadata.appVersion || '');
  var tag = String(metadata.tag || '');
  if (!isSemanticVersion(packageVersion) || !isSemanticVersion(lockVersion) || !isSemanticVersion(appVersion)) {
    fail('release metadata versions must use stable semantic x.y.z syntax');
  }
  if (packageVersion !== appVersion) {
    fail('package.json version ' + packageVersion + ' does not match appinfo.json version ' + appVersion);
  }
  if (lockVersion !== packageVersion) {
    fail('package-lock.json version ' + lockVersion + ' does not match package.json version ' + packageVersion);
  }
  if (tag && tag !== 'v' + appVersion) {
    fail('release tag ' + tag + ' does not match application version v' + appVersion);
  }
  return { version: appVersion, tag: tag };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function check(root, tag) {
  var project = readJson(path.join(root, 'package.json'));
  var lock = readJson(path.join(root, 'package-lock.json'));
  var appInfo = readJson(path.join(root, 'webos-shell-app', 'appinfo.json'));
  var lockVersion = lock.packages && lock.packages[''] && lock.packages[''].version
    ? String(lock.packages[''].version)
    : String(lock.version || '');
  if (lock.version && String(lock.version) !== lockVersion) {
    fail('package-lock.json top-level version ' + lock.version + ' does not match root package version ' + lockVersion);
  }
  return validateVersions({
    packageVersion: project.version,
    lockVersion: lockVersion,
    appVersion: appInfo.version,
    tag: tag || ''
  });
}

if (require.main === module) {
  try {
    var result = check(path.resolve(__dirname, '..'), process.argv[2] || '');
    console.log('Release metadata passed: v' + result.version + (result.tag ? ' (' + result.tag + ')' : ''));
  } catch (error) {
    console.error('Release metadata failed: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  check: check,
  isSemanticVersion: isSemanticVersion,
  validateVersions: validateVersions
};

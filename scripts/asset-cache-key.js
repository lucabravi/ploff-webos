'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var root = path.resolve(process.argv[2] || 'app');
var hash = crypto.createHash('sha256');

function filesIn(directory) {
  var result = [];
  fs.readdirSync(directory).sort().forEach(function (name) {
    var absolute = path.join(directory, name);
    var stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      result = result.concat(filesIn(absolute));
    } else if (/\.(?:css|js)$/i.test(name)) {
      result.push(absolute);
    }
  });
  return result;
}

filesIn(root).forEach(function (file) {
  hash.update(path.relative(root, file));
  hash.update('\0');
  hash.update(fs.readFileSync(file));
  hash.update('\0');
});

process.stdout.write(hash.digest('hex').slice(0, 12));

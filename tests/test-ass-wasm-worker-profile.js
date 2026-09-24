'use strict';

var childProcess = require('child_process');
var path = require('path');

// Run the same real rendering/clock/track contract against native WebAssembly.
childProcess.execFileSync(process.execPath, [
  path.join(__dirname, 'test-ass-legacy-worker-profile.js'), '--wasm'
], { stdio: 'inherit', timeout: 60000 });

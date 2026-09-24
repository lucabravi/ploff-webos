'use strict';

var path = require('path');
var defineConfig = require('@playwright/test').defineConfig;
var CHROME53_USER_AGENT = require('./tests/e2e/chrome53-profile').userAgent;

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLOFF_E2E_JSON || 'artifacts/playwright/results.json' }]
  ],
  outputDir: process.env.PLOFF_E2E_OUTPUT || 'artifacts/playwright/test-results',
  use: {
    baseURL: process.env.PLOFF_E2E_BASE_URL || 'http://127.0.0.1:8098/app/',
    userAgent: CHROME53_USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    actionTimeout: 8000,
    navigationTimeout: 10000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: process.env.PLOFF_E2E_BROWSER_PATH
      ? { executablePath: path.resolve(process.env.PLOFF_E2E_BROWSER_PATH) }
      : undefined
  },
  webServer: {
    command: 'PLOFF_NO_OPEN=1 ./scripts/preview-local.sh 8098',
    url: 'http://127.0.0.1:8098/app/',
    timeout: 15000,
    reuseExistingServer: true
  }
});

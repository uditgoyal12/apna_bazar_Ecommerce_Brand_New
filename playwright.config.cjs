const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests', timeout: 90000, expect: { timeout: 15000 }, workers: 1, fullyParallel: false, reporter: [['list'], ['html', { open: 'never' }]], use: { baseURL: 'http://localhost:3000', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:9000', trace: 'on-first-retry' },
});

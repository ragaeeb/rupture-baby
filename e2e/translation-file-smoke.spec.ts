import { expect, test } from '@playwright/test';

test('translation file page should load without Bun runtime errors in the browser', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });

    page.on('pageerror', (error) => {
        pageErrors.push(error.message);
    });

    await page.goto('/');

    const firstTranslationLink = page.locator('a[href*="/translations/"], a[href*="/_browse/translations/"]').first();

    await expect(firstTranslationLink).toBeVisible();
    const href = await firstTranslationLink.getAttribute('href');
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page).toHaveURL(/translations/);
    await expect(page.getByLabel('View mode')).toBeVisible();

    const allErrors = [...consoleErrors, ...pageErrors];
    expect(allErrors).not.toContainEqual(expect.stringContaining('Bun is not defined'));
});

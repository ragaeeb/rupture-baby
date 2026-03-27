import { expect, test } from '@playwright/test';

test('sidebar model and status filters should reduce the visible file list', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const modelSelect = page.getByLabel('Filter by model');
    const statusSelect = page.getByLabel('Filter by status');

    await expect(modelSelect).toBeVisible();
    await expect(statusSelect).toBeVisible();

    const initialLinks = page.locator('a[href*="/translations/"], a[href*="/_browse/translations/"]');
    const initialCount = await initialLinks.count();
    expect(initialCount).toBeGreaterThan(1);

    const modelOptions = await modelSelect
        .locator('option')
        .evaluateAll((options) =>
            options.map((option) => ({
                label: option.textContent?.trim() ?? '',
                value: option.getAttribute('value') ?? '',
            })),
        );
    const modelValue = modelOptions.find((option) => option.value !== 'all')?.value;
    expect(modelValue).toBeTruthy();

    await modelSelect.selectOption(modelValue!);
    await expect(page).toHaveURL(new RegExp(`[?&]model=${modelValue!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    const modelFilteredCount = await initialLinks.count();
    expect(modelFilteredCount).toBeLessThan(initialCount);

    await statusSelect.selectOption('invalid');
    await expect(page).toHaveURL(/[?&]status=invalid/);

    const combinedCount = await initialLinks.count();
    expect(combinedCount).toBeGreaterThan(0);
    expect(combinedCount).toBeLessThanOrEqual(modelFilteredCount);
    expect(combinedCount).toBeLessThan(initialCount);
});

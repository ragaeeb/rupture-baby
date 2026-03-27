import { expect, test } from '@playwright/test';

test('dashboard invalid count should open the aggregated invalid excerpts page', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const invalidLink = page.getByLabel('View invalid excerpts');
    await expect(invalidLink).toBeVisible();
    await invalidLink.click();

    await expect(page).toHaveURL(/\/invalid$/);
    await expect(page.getByText('Validation Queue')).toBeVisible();
    await expect(page.getByLabel('Filter invalid excerpts by error type')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fix Next 10 Errors' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Commit/ })).toBeVisible();
    await expect(page.getByRole('checkbox').first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Errors' })).toBeVisible();
});

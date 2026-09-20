import { expect, test } from '@playwright/test';

/**
 * The Super Admin settings page.
 *
 * Needs a running API and a superadmin account:
 *   PW_SUPERADMIN_EMAIL=... PW_SUPERADMIN_PASSWORD=... \
 *   PW_API_BASE_URL=http://localhost:8001 npx playwright test
 *
 * These save real settings, so point them at a development database, never a
 * shared one.
 */
const EMAIL = process.env.PW_SUPERADMIN_EMAIL;
const PASSWORD = process.env.PW_SUPERADMIN_PASSWORD;
const API = process.env.PW_API_BASE_URL || 'http://localhost:8000';

test.skip(
  !EMAIL || !PASSWORD,
  'Set PW_SUPERADMIN_EMAIL and PW_SUPERADMIN_PASSWORD to run the settings tests.',
);

// One shared settings document, so the tests must not race each other.
test.describe.configure({ mode: 'serial' });

const SETTINGS = '/superadmin/settings';
const SAVE = 'button[type="submit"]';

/**
 * Signed in once for the whole file. Logging in per test trips the login rate
 * limiter, and there is nothing to isolate: the state that matters lives on the
 * server, and beforeEach resets it.
 */
let context;
let page;

test.beforeAll(async ({ browser, playwright }) => {
  context = await browser.newContext();
  page = await context.newPage();

  await page.goto('/login');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/superadmin/**');

  // A token for the API calls that put the settings back to a known baseline.
  const api = await playwright.request.newContext({ baseURL: API });
  const login = await api.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } });
  const { access_token: token } = await login.json();
  context.apiToken = token;
  context.api = api;
});

test.afterAll(async () => {
  await context?.api?.post('/superadmin/upload-limits/reset', {
    headers: { Authorization: `Bearer ${context.apiToken}` },
  });
  await context?.api?.dispose();
  await context?.close();
});

test.beforeEach(async () => {
  // Start every test from the system defaults rather than from whatever the
  // previous one saved.
  await context.api.post('/superadmin/upload-limits/reset', {
    headers: { Authorization: `Bearer ${context.apiToken}` },
  });
  await page.goto(SETTINGS);
  await expect(page.locator('#max-photos-per-event')).toBeVisible();
});

test('renders both sections and deep-links to a tab', async () => {
  await expect(page.getByRole('tab')).toHaveCount(2);

  await page.goto(`${SETTINGS}?tab=documents`);
  await expect(page.locator('#max-documents-total-mb')).toBeVisible();

  // An unknown tab falls back to the first rather than rendering nothing.
  await page.goto(`${SETTINGS}?tab=nonsense`);
  await expect(page.locator('#max-photos-per-event')).toBeVisible();
});

test('Save is inert until something changes, and Discard restores', async () => {
  await expect(page.locator(SAVE)).toBeDisabled();

  const photos = page.locator('#max-photos-per-event');
  const original = await photos.inputValue();
  await photos.fill(String(Number(original) + 1));

  await expect(page.locator(SAVE)).toBeEnabled();
  await page.getByRole('button', { name: 'Discard changes' }).click();

  await expect(photos).toHaveValue(original);
  await expect(page.locator(SAVE)).toBeDisabled();
});

test('a decimal is rejected rather than silently truncated', async () => {
  let putFired = false;
  await page.route('**/superadmin/upload-limits', (route) => {
    if (route.request().method() === 'PUT') putFired = true;
    return route.continue();
  });

  await page.fill('#max-photo-size-mb', '20.5');
  await page.click(SAVE);

  await expect(page.locator('#max-photo-size-mb-error')).toContainText('whole number');
  await expect(page.locator('#max-photo-size-mb')).toHaveAttribute('aria-invalid', 'true');
  expect(putFired, 'an invalid form must not reach the server').toBe(false);

  // The error clears as soon as the admin acts on it.
  await page.fill('#max-photo-size-mb', '20');
  await expect(page.locator('#max-photo-size-mb-error')).toHaveCount(0);

  await page.unroute('**/superadmin/upload-limits');
});

test('a broken relationship flags both fields', async () => {
  const toggle = page.locator(
    'label:has-text("Enforce a combined photo budget") input[type="checkbox"]',
  );
  if (!(await toggle.isChecked())) await toggle.check();

  await page.fill('#max-photo-size-mb', '40');
  await page.fill('#max-photo-total-mb', '10');
  await page.click(SAVE);

  await expect(page.locator('#max-photo-size-mb-error')).toBeVisible();
  await expect(page.locator('#max-photo-total-mb-error')).toBeVisible();
});

test('a save shows the server timestamp and the admin who made it', async () => {
  await page.fill('#max-photos-per-event', '9');
  await page.click(SAVE);

  await expect(page.getByRole('status')).toContainText('Upload limits saved');
  await expect(page.getByText(/Last updated/)).toContainText(/by \S/);
  await expect(page.locator(SAVE)).toBeDisabled();

  // It really persisted, rather than only updating local state.
  await page.reload();
  await expect(page.locator('#max-photos-per-event')).toHaveValue('9');
});

test('reset asks first, using the defaults the server reports', async () => {
  let nativeDialog = false;
  page.on('dialog', () => {
    nativeDialog = true;
  });

  await page.fill('#max-photos-per-event', '4');
  await page.click(SAVE);
  await expect(page.getByRole('status')).toBeVisible();

  await page.getByRole('button', { name: /Reset to defaults/ }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Reset to system defaults');
  expect(nativeDialog, 'window.confirm should have been replaced by a modal').toBe(false);

  await modal.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByRole('status')).toContainText('Reset to system defaults');
  await expect(page.getByText('Using the default system configuration.')).toBeVisible();
});

test('a failed load offers a retry and never an editable form', async () => {
  await page.route('**/superadmin/upload-limits', (route) => route.abort());
  await page.goto(SETTINGS);

  await expect(page.getByText('Settings could not be loaded')).toBeVisible();
  // The old page rendered the form seeded with local defaults, so one click on
  // Save overwrote the real configuration with them.
  await expect(page.locator('input[type="number"]')).toHaveCount(0);

  await page.unroute('**/superadmin/upload-limits');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#max-photos-per-event')).toBeVisible();
});

test('leaving with unsaved changes is guarded', async () => {
  await page.fill('#max-photos-per-event', '8');

  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Leave without saving?');

  await page.getByRole('button', { name: 'Stay on this page' }).click();
  await expect(page).toHaveURL(/\/superadmin\/settings/);
  await expect(page.locator('#max-photos-per-event')).toHaveValue('8');
});

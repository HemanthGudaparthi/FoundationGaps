/**
 * FoundationGaps — end-to-end tests.
 *
 * These tests cover the actual user flows for this app, not generic CI hygiene.
 * Run with: npm run test:e2e
 * Or via QA script: bash qa-check.sh
 */

import { test, expect, Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadDemo(page: Page) {
  await page.click('#btnDemoTranscript');
  // Wait for the simulated transcription progress to finish (~3.5 s)
  await page.waitForSelector('#transcriptPanel', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(500); // let keyword renders settle
}

// ── App shell ─────────────────────────────────────────────────────────────────

test('loads with correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FoundationGaps/);
});

test('shows video loader on startup', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#videoLoader')).toBeVisible();
  await expect(page.locator('#transcriptWrap')).not.toBeVisible();
});

// ── Topbar buttons ────────────────────────────────────────────────────────────

test('settings modal opens and closes via Escape', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnSettings');
  await expect(page.locator('#settingsOverlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsOverlay')).not.toBeVisible();
});

test('session library opens and closes', async ({ page }) => {
  await page.goto('/');
  await page.click('#btnLibrary');
  await expect(page.locator('#libraryOverlay')).toBeVisible();
  // Empty state should show placeholder
  await expect(page.locator('.library-empty')).toBeVisible();
  await page.click('#libraryClose');
  await expect(page.locator('#libraryOverlay')).not.toBeVisible();
});

test('Report and Export buttons are disabled before any video is loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btnReport')).toBeDisabled();
  await expect(page.locator('#btnExport')).toBeDisabled();
});

// ── Demo transcript ───────────────────────────────────────────────────────────

test('demo transcript populates the transcript panel', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const segments = page.locator('.transcript-seg');
  await expect(segments).not.toHaveCount(0);
});

test('keywords are highlighted in the transcript', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const marks = page.locator('.kw-mark');
  await expect(marks).not.toHaveCount(0);
});

test('bins grid is populated after demo load', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  const bins = page.locator('.bin');
  await expect(bins).not.toHaveCount(0);
});

test('Report and Export buttons are enabled after demo load', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await expect(page.locator('#btnReport')).not.toBeDisabled();
  await expect(page.locator('#btnExport')).not.toBeDisabled();
});

test('Next gap button is enabled after demo load', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await expect(page.locator('#btnNextGap')).not.toBeDisabled();
});

// ── Bin prompt ────────────────────────────────────────────────────────────────

test('clicking Next gap opens the bin prompt', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnNextGap');
  await expect(page.locator('#binPrompt')).toBeVisible();
  await expect(page.locator('#bpConcept')).not.toBeEmpty();
});

test('Fill button stays disabled until 20 chars are typed', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnNextGap');
  await expect(page.locator('#bpFill')).toBeDisabled();
  await page.fill('#bpArea', 'Short');
  await expect(page.locator('#bpFill')).toBeDisabled();
  await page.fill('#bpArea', 'This is a sufficiently long answer to unlock fill');
  await expect(page.locator('#bpFill')).not.toBeDisabled();
});

test('closing bin prompt with Escape works', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnNextGap');
  await expect(page.locator('#binPrompt')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#binPrompt')).not.toBeVisible();
});

// ── Inline note editor ────────────────────────────────────────────────────────

test('+ Note opens the inline note editor', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnAddNote');
  await expect(page.locator('#noteEditor')).toBeVisible();
  await expect(page.locator('#noteEditorArea')).toBeFocused();
});

test('Cancel hides the note editor', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnAddNote');
  await page.click('#btnCancelNote');
  await expect(page.locator('#noteEditor')).not.toBeVisible();
});

test('saving a note adds a note card', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnAddNote');
  await page.fill('#noteEditorArea', 'This is a test note about deep learning');
  await page.click('#btnSaveNote');
  await expect(page.locator('.note-card')).toHaveCount(1);
});

test('Ctrl+Enter saves a note from the editor', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnAddNote');
  await page.fill('#noteEditorArea', 'Saved via keyboard shortcut Ctrl+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.note-card')).toHaveCount(1);
});

test('deleting a note card removes it', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnAddNote');
  await page.fill('#noteEditorArea', 'A deletable note here for testing');
  await page.click('#btnSaveNote');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.click('.note-del');
  // Confirm the inline delete confirmation dialog
  await expect(page.locator('.note-del-confirm')).toBeVisible();
  await page.click('.note-del-confirm');
  await expect(page.locator('.note-card')).toHaveCount(0);
});

// ── Enrichment sidebar ────────────────────────────────────────────────────────

test('clicking a keyword opens the enrichment sidebar', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.locator('.kw-mark').first().click();
  await expect(page.locator('#enrichOverlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#enrichOverlay')).not.toBeVisible();
});

// ── Report overlay ────────────────────────────────────────────────────────────

test('Report modal shows session title and date', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnReport');
  await expect(page.locator('#reportOverlay')).toBeVisible();
  await expect(page.locator('.report-logo')).toContainText('FoundationGaps');
  await page.click('#reportClose');
  await expect(page.locator('#reportOverlay')).not.toBeVisible();
});

// ── Speed control ─────────────────────────────────────────────────────────────

test('speed bar is not visible before video loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#speedBar')).not.toBeVisible();
});

// ── Home navigation ───────────────────────────────────────────────────────────

test('clicking home resets to the video loader', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnHome');
  await expect(page.locator('#videoLoader')).toBeVisible();
  await expect(page.locator('#transcriptWrap')).not.toBeVisible();
});

// ── Session persistence ───────────────────────────────────────────────────────

test('Save button shows saved indicator', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnSaveSession');
  const ind = page.locator('#savedIndicator');
  await expect(ind).toHaveCSS('opacity', '1');
});

test('Load Transcript button navigates back to video loader', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  await page.click('#btnLoadVideo');
  await expect(page.locator('#videoLoader')).toBeVisible();
});

test('session library shows saved session after note is added', async ({ page }) => {
  await page.goto('/');
  await loadDemo(page);
  // Add a note to trigger auto-save
  await page.click('#btnAddNote');
  await page.fill('#noteEditorArea', 'Testing session persistence across visits');
  await page.click('#btnSaveNote');
  // Go to library
  await page.click('#btnLibrary');
  await expect(page.locator('#libraryOverlay')).toBeVisible();
  // Should now have a session row, not the empty placeholder
  await expect(page.locator('.library-empty')).not.toBeVisible();
  await expect(page.locator('.sessions-table')).toBeVisible();
});

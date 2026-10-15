import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.__errors = errors;
  await page.goto("/demo/");
  await expect(page.locator(".job-card")).toHaveCount(9);
});
test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

test("real ranking, skill explanations, profile editing, and reset form a complete flow", async ({ page }) => {
  const originalTitle = await page.locator(".job-card h3").first().textContent();
  await page.getByLabel("Sample résumé").selectOption("product");
  await expect(page.locator(".job-card h3").first()).toHaveText("Product Design Co-op");
  expect(originalTitle).not.toEqual("Product Design Co-op");
  await page.getByRole("button", { name: "Why this match: Product Design Co-op", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Product Design Co-op", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Direct hard-skill evidence" })).toBeVisible();
  await expect(dialog.getByText("figma", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByText("Read & edit the sample", { exact: true }).click();
  await page.getByLabel("Résumé text", { exact: true }).fill("");
  await expect(page.getByRole("heading", { name: "Start with a little context." })).toBeVisible();
  await page.getByRole("button", { name: "Restore sample résumé" }).click();
  await expect(page.locator(".job-card")).toHaveCount(9);
});

test("filters, shortlist, CSV export and empty-state recovery compose", async ({ page }) => {
  await page.getByRole("group", { name: "Filter by field" }).getByLabel("Engineering", { exact: true }).check();
  await page.getByLabel("Work style", { exact: true }).selectOption("Remote");
  await expect(page.locator(".job-card")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search jobs" }).fill("Python SQL");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Save Data Engineering Co-op to shortlist", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export CSV/ }).click();
  expect((await download).suggestedFilename()).toBe("nucoop-fictional-shortlist.csv");
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await page.getByRole("button", { name: "Shortlist 1", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove Data Engineering Co-op from shortlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make room for the good fits." })).toBeVisible();
  await page.getByRole("button", { name: "Show all roles", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(9);
});

test("comparison enforces three roles and is keyboard dismissible", async ({ page }) => {
  const choices = page.locator('[data-action="compare"]');
  await choices.nth(0).check(); await choices.nth(1).check(); await choices.nth(2).check();
  await choices.nth(3).click();
  await expect(choices.nth(3)).not.toBeChecked();
  await expect(page.locator("#announcement")).toHaveText(/Compare up to three/);
  await page.getByRole("button", { name: /Compare roles/ }).click();
  await expect(page.getByRole("dialog", { name: "Your roles, side by side." })).toBeVisible();
  await expect(page.locator(".comparison-card")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Compare roles/ })).toBeFocused();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator("#compare-tray")).toBeHidden();
});

test("the demo requests only its own static assets and treats edited markup as text", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await page.reload();
  await page.getByText("Read & edit the sample", { exact: true }).click();
  await page.getByLabel("Résumé text", { exact: true }).fill('<img src="https://example.invalid/leak"> Python React');
  await expect(page.locator("#profile-focus")).toHaveText("Your edited sample");
  expect(requests.every((url) => url.origin === "http://127.0.0.1:4174")).toBe(true);
  expect(await page.locator("#resume-skills img").count()).toBe(0);
  await page.reload();
  await page.getByText("Read & edit the sample", { exact: true }).click();
  await expect(page.getByLabel("Résumé text", { exact: true })).not.toHaveValue(/example.invalid/);
});

for (const width of [320, 390, 768, 1440]) {
  test(`explorer and dialogs fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-action="details"]').first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await page.locator('[data-action="compare"]').nth(0).check();
    await page.locator('[data-action="compare"]').nth(1).check();
    await page.getByRole("button", { name: /Compare roles/ }).click();
    await expect.poll(() => page.evaluate(() => document.querySelector("#comparison-dialog").scrollWidth <= document.querySelector("#comparison-dialog").clientWidth)).toBe(true);
  });
}

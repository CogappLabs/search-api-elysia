import { expect, test } from "@playwright/test";

const DEMO_URL = "/search-api-elysia/features/instantsearch/";

test.describe("InstantSearch demo", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-configure the demo to point at the local API
    await page.addInitScript(() => {
      localStorage.setItem(
        "search-api-demo",
        JSON.stringify({
          endpoint: "http://localhost:3000",
          index: "craft_search_plugin_labs",
          token: "",
        }),
      );
    });
    await page.goto(DEMO_URL);
    await page.waitForSelector('input[type="search"]');
  });

  test("renders search box", async ({ page }) => {
    const searchBox = page.locator('input[type="search"]');
    await expect(searchBox).toBeVisible();
    await expect(searchBox).toHaveAttribute("placeholder", "Search...");
  });

  test("returns results for a query", async ({ page }) => {
    await page.fill('input[type="search"]', "castle");
    const stats = page.locator(".ais-Stats-text");
    await expect(stats).toContainText(/\d+ results?/i, { timeout: 5000 });
    const hits = page.locator(".ais-Hits-item");
    await expect(hits.first()).toBeVisible();
    const count = await hits.count();
    expect(count).toBeGreaterThan(0);
  });

  test("highlights matching terms in results", async ({ page }) => {
    await page.fill('input[type="search"]', "castle");
    await page.waitForSelector(".ais-Hits-item");
    const highlighted = page.locator(
      ".ais-Hits-item mark, .ais-Hits-item .ais-Highlight-highlighted",
    );
    await expect(highlighted.first()).toBeVisible({ timeout: 5000 });
  });

  test("shows pagination", async ({ page }) => {
    const pagination = page.locator(".ais-Pagination");
    await expect(pagination).toBeVisible({ timeout: 5000 });
  });

  test("navigates pages", async ({ page }) => {
    await page.waitForSelector(".ais-Hits-item", { timeout: 5000 });
    const firstPageHit = await page
      .locator(".ais-Hits-item")
      .first()
      .textContent();

    const page2 = page.locator('.ais-Pagination-link:has-text("2")');
    if (await page2.isVisible()) {
      await page2.click();
      await page.waitForTimeout(500);
      const secondPageHit = await page
        .locator(".ais-Hits-item")
        .first()
        .textContent();
      expect(secondPageHit).not.toBe(firstPageHit);
    }
  });

  test("shows HitsPerPage dropdown with accessible label", async ({ page }) => {
    const hitsPerPage = page.locator(".ais-HitsPerPage-select");
    await expect(hitsPerPage).toBeVisible({ timeout: 5000 });
    await expect(hitsPerPage).toHaveAttribute("aria-label", "Results per page");
    const options = hitsPerPage.locator("option");
    expect(await options.count()).toBe(3);
  });

  test("defaults to 10 results per page", async ({ page }) => {
    await page.waitForSelector(".ais-Hits-item", { timeout: 5000 });
    const hits = page.locator(".ais-Hits-item");
    const count = await hits.count();
    expect(count).toBeLessThanOrEqual(10);
  });

  test("changes results count via HitsPerPage", async ({ page }) => {
    await page.waitForSelector(".ais-Hits-item", { timeout: 5000 });
    // Select 20 per page (default is now 10)
    await page.selectOption(".ais-HitsPerPage-select", "20");
    await page.waitForTimeout(500);
    const hits = page.locator(".ais-Hits-item");
    const count = await hits.count();
    expect(count).toBeGreaterThan(10);
  });

  test("pre-populates facet field with country", async ({ page }) => {
    // Facet field should default to "country"
    const facetInput = page.locator('input[placeholder*="country"]');
    await expect(facetInput).toHaveValue("country");
    // RefinementList should already be visible
    const facetItem = page.locator(".ais-RefinementList-item");
    await expect(facetItem.first()).toBeVisible({ timeout: 5000 });
    expect(await facetItem.count()).toBeGreaterThan(0);
  });

  test("filters results by facet selection", async ({ page }) => {
    await page.fill('input[type="search"]', "castle");
    await page.waitForSelector(".ais-RefinementList-item", { timeout: 5000 });

    const statsBefore = await page.locator(".ais-Stats-text").textContent();

    const firstCheckbox = page.locator(".ais-RefinementList-checkbox").first();
    await firstCheckbox.click();
    await page.waitForTimeout(500);

    const statsAfter = await page.locator(".ais-Stats-text").textContent();
    expect(statsAfter).not.toBe(statsBefore);
  });

  test("shows CurrentRefinements after facet click", async ({ page }) => {
    await page.waitForSelector(".ais-RefinementList-item", { timeout: 5000 });

    await page.locator(".ais-RefinementList-checkbox").first().click();
    await page.waitForTimeout(500);

    const refinement = page.locator(".ais-CurrentRefinements-category");
    await expect(refinement.first()).toBeVisible({ timeout: 5000 });
  });

  test("ClearRefinements resets facet filters", async ({ page }) => {
    await page.waitForSelector(".ais-RefinementList-item", { timeout: 5000 });

    await page.locator(".ais-RefinementList-checkbox").first().click();
    await page.waitForTimeout(500);

    const clearBtn = page.locator(
      ".ais-ClearRefinements-button:not(.ais-ClearRefinements-button--disabled)",
    );
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    const statsBefore = await page.locator(".ais-Stats-text").textContent();
    await clearBtn.click();
    await page.waitForTimeout(500);

    const statsAfter = await page.locator(".ais-Stats-text").textContent();
    expect(statsAfter).not.toBe(statsBefore);
  });

  test("error banner uses role=alert", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "search-api-demo",
        JSON.stringify({
          endpoint: "http://localhost:9999",
          index: "nonexistent",
          token: "",
        }),
      );
    });
    await page.reload();
    await page.waitForSelector('input[type="search"]');
    await page.fill('input[type="search"]', "test");
    const error = page.locator('[role="alert"]');
    await expect(error.first()).toBeVisible({ timeout: 5000 });
  });

  test("empty query returns results", async ({ page }) => {
    const hits = page.locator(".ais-Hits-item");
    await expect(hits.first()).toBeVisible({ timeout: 5000 });
  });
});

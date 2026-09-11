import { test, expect } from "@playwright/test";
test("operator causes outage, reroutes, scales, injects corruption and resets", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("");
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Take region offline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Frankfurt cache, offline" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add two workers" }).click();
  await expect(page.getByTestId("workers")).toHaveText("6");
  await page.getByRole("button", { name: "Extra cache replica" }).click();
  await expect(page.getByText("12 concurrent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inject corrupt package" }).click();
  await expect(
    page.getByRole("button", { name: "Restore clean package" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Automatic failover" }).click();
  await expect(
    page.getByRole("button", { name: "Automatic failover" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Add 500 clients" }).click();
  await expect(page.getByText("of 1,500 clients")).toBeVisible();
  await page
    .getByRole("button", { name: "Reset simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset release", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Frankfurt cache, online" }),
  ).toBeVisible();
  await expect(page.getByTestId("workers")).toHaveText("4");
  expect(errors).toEqual([]);
});
test("repeatable experiment reveals deliveries and failed requests", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await page
    .getByRole("button", { name: "Run experiment", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible({
    timeout: 20000,
  });
  const cards = page.locator(".experiment-cards article");
  expect(
    Number(
      (await cards.nth(1).locator(".result-number").textContent())!.split(
        "/",
      )[0],
    ),
  ).toBeGreaterThan(800);
  await expect(cards.nth(0).locator(".result-number")).not.toHaveText(
    (await cards.nth(1).locator(".result-number").textContent()) || "",
  );
});
test("mobile, keyboard map selection, dialogs and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1080 });
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4177") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("");
  await expect(
    page.getByRole("button", { name: "Resume simulation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "12 times speed" }).click();
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.screenshot({ path: "docs/desktop.png", fullPage: true });
  const node = page.getByRole("button", { name: "Virginia cache, online" });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Virginia", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset network view" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "How RelayDesk works" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(external).toEqual([]);
});
test("local lab submits actual jobs and deduplicates the same release", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Local engine", exact: true }).click();
  await page.getByRole("button", { name: "Connect local engine" }).click();
  await expect(
    page.getByRole("heading", { name: "Worker activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Take EU cache offline" }).click();
  await page.getByRole("button", { name: "Corrupt US package" }).click();
  await page.getByRole("button", { name: "Submit 24 deliveries" }).click();
  await expect
    .poll(
      async () => {
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        return page
          .locator(".lab-stats > div")
          .filter({ hasText: "done" })
          .locator("strong")
          .textContent();
      },
      { timeout: 20000 },
    )
    .toBe("24");
  await page.getByRole("button", { name: "Submit 24 deliveries" }).click();
  await expect(
    page
      .locator(".lab-stats > div")
      .filter({ hasText: "done" })
      .locator("strong"),
  ).toHaveText("24");
  await expect(page.getByRole("alert")).not.toBeVisible();
});
test("1000-client mission completes with Frankfurt remaining offline", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("");
  await page
    .getByRole("button", { name: "Start regional outage", exact: true })
    .click();
  await page.getByRole("button", { name: "12 times speed" }).click();
  await expect(
    page.getByRole("heading", { name: "You kept the release moving." }),
  ).toBeVisible({ timeout: 35000 });
  await expect(
    page.getByRole("button", { name: "Frankfurt cache, offline" }),
  ).toBeVisible();
});

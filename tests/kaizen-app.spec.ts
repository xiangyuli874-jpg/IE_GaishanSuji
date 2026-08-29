import { expect, test } from "@playwright/test";

const STORAGE_KEY = "kaizen-quick-log-records-v1";
const APP_URL = process.env.KAIZEN_APP_URL ?? "/";

const editableRecord = {
  id: "editable-record",
  line: "A线",
  type: "POU改善",
  raw: "原来需要转身拿取螺钉，改善后改为前方取料。",
  content: "螺钉取料优化：将螺钉移至员工正前方，减少转身取料。",
  effect: "岗位平均ST降低1s。",
  beforePhoto: null,
  afterPhoto: null,
  createdAt: "2026年08月28日",
  note: "",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, records }) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(records));
    }
  }, { key: STORAGE_KEY, records: [editableRecord] });
});

test("mobile production layout fills the browser viewport without prototype device chrome", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP_URL);

  await expect(page.locator(".phone-bezel")).toBeHidden();
  await expect(page.locator(".device-menu-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  expect(screenBox).not.toBeNull();
  expect(screenBox?.x).toBeCloseTo(0, 0);
  expect(screenBox?.y).toBeCloseTo(0, 0);
  expect(screenBox?.width).toBeCloseTo(390, 0);
  expect(screenBox?.height).toBeCloseTo(844, 0);
});

test("a saved record can be edited without creating a duplicate and remains changed after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP_URL);

  await page.getByRole("button", { name: "查看" }).click();
  await page.getByRole("button", { name: "编辑改善记录" }).click();
  await expect(page.getByText("正在编辑已保存记录")).toBeVisible();

  await page.getByLabel("改善内容").fill("螺钉取料优化：将螺钉定置在作业面前，取消转身取料。");
  await page.getByLabel("改善效果").fill("岗位平均ST降低1.5s。");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "查看" }).click();

  const mobileList = page.locator(".mobile-record-list");
  await expect(mobileList.getByText("将螺钉定置在作业面前，取消转身取料。")).toBeVisible();
  await expect(mobileList.locator(".record-row")).toHaveCount(1);

  await page.reload();
  await page.getByRole("button", { name: "查看" }).click();
  await expect(page.locator(".mobile-record-list").getByText("岗位平均ST降低1.5s。")).toBeVisible();
  await expect(page.locator(".mobile-record-list .record-row")).toHaveCount(1);
});

test("a saved record can be deleted after confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP_URL);
  await page.getByRole("button", { name: "查看" }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除改善记录" }).click();

  await expect(page.getByTestId("mobile-scroll-content").getByText("还没有改善记录")).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]").length, STORAGE_KEY)).toBe(0);
});

test("desktop ledger exposes edit and delete actions for every record", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL);

  const dashboard = page.getByLabel("电脑端改善清单");
  await expect(dashboard).toBeVisible();
  await expect(dashboard.getByRole("button", { name: "编辑改善记录" })).toHaveCount(1);
  await expect(dashboard.getByRole("button", { name: "删除改善记录" })).toHaveCount(1);
  await expect(page.locator(".phone-bezel")).toBeHidden();
  await expect(page.locator(".device-menu-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();

  const capturePanel = await page.getByTestId("device-screen").boundingBox();
  expect(capturePanel).not.toBeNull();
  expect(capturePanel?.x).toBeCloseTo(940, 0);
  expect(capturePanel?.y).toBeCloseTo(0, 0);
  expect(capturePanel?.width).toBeCloseTo(500, 0);
  expect(capturePanel?.height).toBeCloseTo(900, 0);
});

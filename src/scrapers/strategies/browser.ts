import { chromium } from "playwright";

export async function withBrowser<T>(fn: (page: import("playwright").Page) => Promise<T>) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    return await fn(page);
  } finally {
    await page.close();
    await browser.close();
  }
}

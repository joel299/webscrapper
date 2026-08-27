import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const widths = [1920, 1440, 1366, 1024, 768, 375];

test("filtros cabem no painel e ações não quebram", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto("file:///root/webscrapper/public/index.html");
      const result = await page.evaluate(() => {
        const panel = document.querySelector(".panel").getBoundingClientRect();
        const buttons = [...document.querySelectorAll(".filter-actions button")].map((button) => {
          const box = button.getBoundingClientRect();
          return { left: box.left, right: box.right, wrap: button.scrollHeight > button.clientHeight + 1, height: box.height };
        });
        return { panel, buttons, diagnostics: getComputedStyle(document.querySelector("#diagnosticSummary")).display };
      });
      for (const button of result.buttons) {
        assert.ok(button.left >= result.panel.left - 1);
        assert.ok(button.right <= result.panel.right + 1);
        assert.equal(button.wrap, false);
        assert.ok(button.height >= 44);
      }
      assert.equal(result.diagnostics, "none");
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

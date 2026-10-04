// Indicative Core Web Vitals in headless Chromium (no network throttling): LCP and CLS per page at 390x844.
// Usage: node _build/cwv.mjs <base-url>
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join } from "node:path"; import { homedir } from "node:os";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const CACHE = join(homedir(), ".cache", "ms-playwright");
const exe = join(CACHE, readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1), "chrome-linux64", "chrome");
const base = process.argv[2]; const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
for (const pg of ["/", "/day/", "/needs/", "/press/", "/embed/"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__cwv = { lcp: 0, lcpEl: "", cls: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__cwv.lcp = e.startTime; window.__cwv.lcpEl = (e.element && (e.element.tagName + "." + (e.element.className || ""))) || e.url || ""; } }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto(base + pg, { waitUntil: "load" }); await p.waitForTimeout(2500);
  const H = await p.evaluate(() => document.documentElement.scrollHeight); for (let y = 0; y < H; y += 500) { await p.evaluate(yy => scrollTo(0, yy), y); await p.waitForTimeout(120); } await p.waitForTimeout(800);
  const r = await p.evaluate(() => window.__cwv); console.log(`${pg.padEnd(10)} LCP ${r.lcp.toFixed(0)} ms (${r.lcpEl})  CLS ${r.cls.toFixed(4)}`);
  await ctx.close();
}
await b.close();

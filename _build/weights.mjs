// Measure what each page actually downloads (uncompressed bytes, as served), initial load vs after scrolling the whole page.
// Usage: node _build/weights.mjs <base-url>
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join } from "node:path"; import { homedir } from "node:os";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const CACHE = join(homedir(), ".cache", "ms-playwright");
const exe = join(CACHE, readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1), "chrome-linux64", "chrome");
const base = process.argv[2]; const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const kind = u => /\.(mp4)$/.test(u) ? "video" : /\.(woff2)$/.test(u) ? "font" : /\.(webp|png|jpg)$/.test(u) ? "image" : /\.js$/.test(u) ? "js" : /\.css$/.test(u) ? "css" : /\.json$/.test(u) ? "json" : "html";
for (const reduce of [false, true]) for (const pg of ["/", "/day/", "/needs/", "/press/", "/embed/", "/embed/widget/"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduce ? "reduce" : "no-preference" }); const p = await ctx.newPage(); const sizes = new Map();
  p.on("response", async r => { try { const buf = await r.body(); sizes.set(r.url(), buf.length); } catch { /* range or aborted */ } });
  await p.goto(base + pg, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  const sum = () => { const t = {}; let all = 0; for (const [u, n] of sizes) { const k = kind(u); t[k] = (t[k] || 0) + n; all += n; } return [t, all]; };
  const [t0, a0] = sum();
  const H = await p.evaluate(() => document.documentElement.scrollHeight); for (let y = 0; y < H; y += 600) { await p.evaluate(yy => scrollTo(0, yy), y); await p.waitForTimeout(150); } await p.waitForTimeout(1200);
  const [t1, a1] = sum();
  const f = t => Object.entries(t).map(([k, v]) => `${k}=${(v / 1024).toFixed(0)}K`).join(" ");
  console.log(`${reduce ? "reduced-motion" : "motion        "} ${pg.padEnd(15)} initial ${(a0 / 1024).toFixed(0).padStart(5)} KB (${f(t0)}) | after scroll ${(a1 / 1024).toFixed(0).padStart(5)} KB`);
  await ctx.close();
}
await b.close();

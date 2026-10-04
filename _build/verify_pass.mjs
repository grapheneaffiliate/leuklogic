// Playwright pass: each page at 390x844 and 1440x900, console errors, external/failed requests, full-page shots, reduced-motion shot of /.
// Usage: node _build/verify_pass.mjs <base-url> <out-dir> [page ...]
import { createRequire } from "node:module";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const [base, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const CACHE = join(homedir(), ".cache", "ms-playwright");
const exe = join(CACHE, readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1), "chrome-linux64", "chrome");
const pages = only.length ? only : ["/", "/day/", "/needs/", "/press/", "/embed/", "/embed/widget/"];
const sizes = { mobile: [390, 844], desktop: [1440, 900] };
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const origin = new URL(base).origin;
let bad = 0;
async function run(pg, name, w, h, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? "reduce" : "no-preference", deviceScaleFactor: 1, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [], ext = [], fails = [];
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 200)); });
  p.on("pageerror", e => errs.push("PAGEERROR: " + String(e).slice(0, 200)));
  p.on("request", r => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) ext.push(r.url()); });
  p.on("requestfailed", r => fails.push(r.url() + " " + (r.failure() || {}).errorText));
  p.on("response", r => { if (r.status() >= 400) fails.push(r.status() + " " + r.url()); });
  await p.goto(base + pg, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  // scroll through so reveal-on-scroll and lazy images fire
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(h * 0.7)) { await p.evaluate(yy => window.scrollTo(0, yy), y); await p.waitForTimeout(160); }
  await p.waitForTimeout(900); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
  const slug = (pg.replace(/\//g, "_").replace(/^_|_$/g, "") || "home") + "_" + name + (opts.reduce ? "_reduced" : "");
  await p.screenshot({ path: join(out, slug + ".png"), fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  console.log(`${pg.padEnd(16)} ${name.padEnd(8)}${opts.reduce ? "reduced " : ""} errors=${errs.length} external=${ext.length} failed=${fails.length} hscroll=${overflow}  -> ${slug}.png`);
  errs.concat(ext.map(x => "EXTERNAL " + x), fails.map(x => "FAIL " + x)).forEach(e => console.log("    " + e));
  if (errs.length || ext.length || fails.length || overflow) bad++;
  await ctx.close();
}
for (const pg of pages) for (const [n, [w, h]] of Object.entries(sizes)) await run(pg, n, w, h);
if (!only.length || only.includes("/")) { await run("/", "mobile", 390, 844, { reduce: true }); await run("/", "desktop", 1440, 900, { reduce: true }); }
// per-section viewport shots of the homepage (what a visitor actually sees at each beat)
if (!only.length || only.includes("/")) for (const [n, [w, h]] of Object.entries(sizes)) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); await p.goto(base + "/", { waitUntil: "networkidle" });
  for (const id of ["top", "ingredients", "needs", "day", "films", "timeline", "stand", "tools"]) {
    await p.evaluate(i => { const e = document.getElementById(i); window.scrollTo(0, e ? e.getBoundingClientRect().top + scrollY - (i === "top" ? 0 : 0) : 0); }, id);
    await p.waitForTimeout(1300); await p.screenshot({ path: join(out, `sec_${id}_${n}.png`) });
  }
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(700); await p.screenshot({ path: join(out, `sec_footer_${n}.png`) });
  await ctx.close();
}
await b.close(); console.log(bad ? `PROBLEMS: ${bad}` : "ALL CLEAN");
process.exit(bad ? 1 : 0);

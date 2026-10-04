// Exercise /day/: pick options, type a name, check the hash, export both card sizes, reload from the hash and compare pixels.
// Usage: node _build/day_exercise.mjs <base-url> <out-dir>
import { createRequire } from "node:module";
import { readdirSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const [base, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const CACHE = join(homedir(), ".cache", "ms-playwright");
const exe = join(CACHE, readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1), "chrome-linux64", "chrome");
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const sha = f => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16);
async function open(url, w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage(); const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(700); return { ctx, p, errs };
}
const results = {};
let { ctx, p, errs } = await open(base + "/day/");
for (const t of ["Laundry and folding", "Cooking and dishes", "Taxes and bookkeeping", "Long commutes and driving", "Paperwork and forms", "Waiting on hold"]) await p.getByRole("button", { name: t, exact: true }).click();
for (const t of ["Time with family", "Playing music", "Faith and worship", "Rest"]) await p.getByRole("button", { name: t, exact: true }).click();
await p.fill("#dname", "Maria 2nd!"); await p.waitForTimeout(500);
results.hash = await p.evaluate(() => location.hash);
results.name_sanitized = await p.evaluate(() => window.__dayState().n);
await p.screenshot({ path: join(out, "day_page_desktop_selected.png"), fullPage: true });
for (const f of ["feed", "story"]) {
  const [d] = await Promise.all([p.waitForEvent("download"), p.click("#dl-" + f)]);
  const path = join(out, `card_${f}.png`); await d.saveAs(path); results[f] = { file: path, sha: sha(path), suggested: d.suggestedFilename() };
}
await p.click("#copy"); await p.waitForTimeout(300);
results.clipboard = await p.evaluate(() => navigator.clipboard.readText());
results.status_after_copy = await p.textContent("#status");
// share button: headless Chromium has no file-share, so the page must fall back to a download
const [d2] = await Promise.all([p.waitForEvent("download"), p.click("#share")]);
results.share_fallback_download = d2.suggestedFilename(); results.share_status = await p.textContent("#status");
await p.click('.seg button[data-fmt="story"]'); await p.waitForTimeout(600);
results.story_canvas = await p.evaluate(() => [document.getElementById("card").width, document.getElementById("card").height]);
results.errs = errs; await ctx.close();
// reload from the hash alone: the card must be pixel-identical
const h = results.hash;
({ ctx, p, errs } = await open(base + "/day/" + h));
const [d3] = await Promise.all([p.waitForEvent("download"), p.click("#dl-feed")]); const p3 = join(out, "card_feed_from_hash.png"); await d3.saveAs(p3);
results.reload_identical = sha(p3) === results.feed.sha; results.reload_errs = errs;
results.chips_pressed_after_reload = await p.evaluate(() => [...document.querySelectorAll('.chip[aria-pressed="true"]')].map(x => x.textContent));
await ctx.close();
// phone-sized
({ ctx, p, errs } = await open(base + "/day/", 390, 844));
await p.getByRole("button", { name: "Cleaning the house", exact: true }).click(); await p.getByRole("button", { name: "The outdoors", exact: true }).click();
await p.screenshot({ path: join(out, "day_page_mobile.png"), fullPage: true }); results.mobile_errs = errs; await ctx.close();
await b.close(); console.log(JSON.stringify(results, null, 1));

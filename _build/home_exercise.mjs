// Exercise the homepage behaviour: hero video plays, reduced motion swaps in the poster and fetches no video, the film player plays,
// the pledge card + share links work, the day teaser canvas is drawn, keyboard reaches the skip link first.
// Usage: node _build/home_exercise.mjs <base-url> <out-dir>
import { createRequire } from "node:module";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const [base, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const CACHE = join(homedir(), ".cache", "ms-playwright");
const exe = join(CACHE, readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1), "chrome-linux64", "chrome");
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const R = {};
{ // motion allowed
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; const reqs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
  p.on("request", r => reqs.push(r.url()));
  await p.goto(base + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
  R.hero = await p.evaluate(() => { const v = document.getElementById("hero-video"); return { src: v.currentSrc.split("/").pop(), paused: v.paused, currentTime: +v.currentTime.toFixed(2), readyState: v.readyState, w: v.videoWidth, h: v.videoHeight }; });
  R.hero_requests_film = reqs.some(u => u.includes("film-v01.mp4"));
  await p.click("#hero-pause"); await p.waitForTimeout(300); R.after_pause = await p.evaluate(() => ({ paused: document.getElementById("hero-video").paused, label: document.getElementById("hero-pause").textContent }));
  // mini card drawn?
  await p.evaluate(() => document.getElementById("day").scrollIntoView()); await p.waitForTimeout(1500);
  R.minicard_nonblank = await p.evaluate(() => { const c = document.getElementById("minicard"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 0) n++; return n > 200; });
  // film player
  await p.evaluate(() => document.getElementById("films").scrollIntoView()); await p.waitForTimeout(800);
  R.films_rendered = await p.evaluate(() => document.querySelectorAll("#films-list .film").length);
  R.film_links = await p.evaluate(() => [...document.querySelectorAll("#films-list .links a")].map(a => a.href));
  await p.click("#films-list .posterbtn"); await p.waitForTimeout(2500);
  R.film = await p.evaluate(() => { const v = document.querySelector("#films-list video"); return v ? { src: v.currentSrc.split("/").pop(), paused: v.paused, t: +v.currentTime.toFixed(2), controls: v.controls } : null; });
  // pledge
  await p.evaluate(() => document.getElementById("stand").scrollIntoView()); await p.waitForTimeout(500);
  await p.fill("#pname", "Sam"); await p.click("#pledge-form button[type=submit]"); await p.waitForTimeout(1200);
  R.pledge_visible = await p.evaluate(() => document.getElementById("pcard").classList.contains("on"));
  R.share_x = await p.getAttribute("#pshare-x", "href"); R.share_fb = await p.getAttribute("#pshare-fb", "href");
  await p.click("#pcopy"); await p.waitForTimeout(300); R.copied = await p.evaluate(() => navigator.clipboard.readText()); R.pstatus = await p.textContent("#pstatus");
  const [d] = await Promise.all([p.waitForEvent("download"), p.click("#pdl")]); await d.saveAs(join(out, "pledge_card.png")); R.pledge_download = d.suggestedFilename();
  await p.screenshot({ path: join(out, "pledge_section_mobile.png") });
  // keyboard: first tab stop
  await p.goto(base + "/"); await p.keyboard.press("Tab"); R.first_tab = await p.evaluate(() => document.activeElement.className + " | " + document.activeElement.textContent.trim());
  R.errs = errs; R.external = reqs.filter(u => !u.startsWith(base)).length; await ctx.close();
}
{ // reduced motion
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const p = await ctx.newPage(); const reqs = [];
  p.on("request", r => reqs.push(r.url()));
  await p.goto(base + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  R.reduced = await p.evaluate(() => { const v = document.getElementById("hero-video"), s = document.querySelector(".hero-media .still"); return { videoDisplay: getComputedStyle(v).display, videoSrcAttr: v.getAttribute("src"), stillDisplay: getComputedStyle(s).display, stillSrc: s.currentSrc.split("/").pop(), pauseHidden: getComputedStyle(document.getElementById("hero-pause")).display === "none" }; });
  R.reduced_loaded_hero_mp4 = reqs.some(u => u.includes("hero-loop.mp4"));
  await p.screenshot({ path: join(out, "home_reduced_motion_viewport.png") }); await ctx.close();
}
await b.close(); console.log(JSON.stringify(R, null, 1));

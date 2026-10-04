// Render the 1200x630 Open Graph cards from _build/og.html with the self-hosted fonts.
// Usage: node _build/og.mjs   (needs playwright-core + the Playwright-cached Chromium; paths below are this box's)
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const require2 = createRequire("/mnt/c/Users/atchi/Harness/game-web/.claude/skills/run-game-web/node_modules/");
const { chromium } = require2("playwright-core");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(homedir(), ".cache", "ms-playwright");
const dirs = readdirSync(CACHE).filter(d => /^chromium-\d+$/.test(d)).sort();
const exe = join(CACHE, dirs.at(-1), "chrome-linux64", "chrome");
const cards = [
  ["home", "img/page_cover.webp", "center 60%", "Abundance for All", "What if nobody ever had to <em>go without?</em>", "Build superintelligence and robotics for every need and every reasonable want."],
  ["day", "img/kf/K4.webp", "center 62%", "Design your abundant day", "What would you do with <em>your time back?</em>", "Pick the chores you would hand to robots. Make your card."],
  ["needs", "img/kf/K1.webp", "center 65%", "Every human need", "Food. Water. Shelter. Health. Energy. <em>Learning.</em>", "Where the gaps are today, with every source."],
  ["press", "img/page_cover.webp", "20% 40%", "Press kit", "One mission, <em>free to share.</em>", "Logo, cover, keyframes and a one-paragraph mission. AI-generated media is labelled."],
  ["embed", "img/kf/K5.webp", "center 60%", "Embed it", "Put the needs explorer <em>on your site.</em>", "One iframe. No trackers, no external requests."],
];
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [slug, bg, pos, k, t, s] of cards) {
  const u = pathToFileURL(join(root, "_build/og.html")).href + "?" + new URLSearchParams({ bg: "../" + bg, pos, k, t, s });
  await p.goto(u); await p.waitForSelector("body[data-ready]"); await p.waitForTimeout(300);
  await p.screenshot({ path: join(root, "og", slug + ".png") });
  console.log("og/" + slug + ".png");
}
await b.close();

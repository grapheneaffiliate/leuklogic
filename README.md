# LeukLogic: Abundance for All

[leuklogic.com](https://leuklogic.com) is a mission site. Its position, stated as conviction and not as forecast: **we believe we should build superintelligence and robotics to provide every need, and every reasonable want, for every person.** Not to replace people. To free them.

| Page | What it is |
|---|---|
| `/` | Scrollytelling homepage: hero film, three ingredients, where the gaps are, day-card teaser, films, milestones, pledge, free tools |
| `/day/` | "Design your abundant day": a canvas share card (1080x1350 and 1080x1920), Web Share with a download fallback, state in the URL hash |
| `/needs/` | The six needs with year, source and licence; `data/needs.json` |
| `/press/` | Mission paragraph and downloadable art; AI-generated media is labelled |
| `/embed/` | One-iframe widget (`/embed/widget/`, no scripts) |
| `/services/` | The software shop (previously the homepage) |
| `/tools/*`, `/services/dedupe/`, `/lab/*` | Unchanged |

## Rules this site keeps

- **Static only, zero external requests.** Self-hosted fonts (Fraunces, Figtree: OFL, `fonts/`), self-hosted video, no iframes to YouTube or Facebook (it links out). Check: `python3 harness/net_instrument.py <url>` must print `ZERO EXTERNAL REQUESTS`.
- **Every number has an inline source and an "as of" year.** They live in `data/needs.json` and `data/milestones.json` and are listed in `SOURCES.md`. A figure that cannot be verified at its source is left out.
- **No fake counters, testimonials or user numbers.** A global pledge counter would need a backend (a database and an endpoint, plus spam control); on static hosting the pledge card is made in the visitor's browser and nothing is stored. Add a counter only together with a backend.
- **AI-generated media is labelled** wherever it appears.

## Editing

```
python3 _build/fetch_data.py     # re-read every figure from its provider (World Bank API, OWID CSV, IFR, EMBL-EBI) and re-verify cited pages
python3 _build/make_sources.py   # regenerate SOURCES.md from the JSON
python3 _build/build_pages.py    # regenerate index.html, day/, needs/, press/, embed/ from _build/templates + data + films.json
node _build/og.mjs               # re-render the 1200x630 OG cards in og/
```

New film: add one object to `films.json` (the homepage renders the list at runtime). `_build/verify_pass.mjs`, `_build/home_exercise.mjs` and `_build/day_exercise.mjs` are the Playwright checks (console errors, external requests, full-page shots, the day card export). Files and folders starting with `_` are not published by GitHub Pages.

---

# LeukLogic: small-business automation (the software shop, at `/services/`)

**Try the work before you talk to us.** Nine free tools, live at [leuklogic.com](https://leuklogic.com) — every one runs entirely in your browser, and nothing you paste or upload leaves your machine:

- [CronText](https://leuklogic.com/tools/cron/) — read or build a cron schedule in plain English
- [DeltaCSV](https://leuklogic.com/tools/csv-diff/) — compare two CSV files and see the real changes
- [FlipCSV](https://leuklogic.com/tools/csv-json/) — convert CSV to JSON (and back)
- [Missed-Call Cost Calculator](https://leuklogic.com/tools/missed-call-calculator/) — what missed calls actually cost your business
- [SubScan](https://leuklogic.com/tools/subscription-scanner/) — find recurring subscriptions hiding in a bank statement
- [QuickQuote](https://leuklogic.com/tools/quote/) — a fixed-price quote for a bot or scraper
- [CheckClip](https://leuklogic.com/tools/video-check/) — check whether your video passes on TikTok, Reels & Shorts
- [SwiftStatement](https://leuklogic.com/tools/statement-csv/) — bank statement PDF to Excel or CSV
- [ShrinkKit](https://leuklogic.com/tools/compress/) — compress files without uploading them

## Who we are

LeukLogic is a US software shop — human-owned, with an AI-agent build team — building the small software a business needs when it has no engineer: Discord and Slack bots, web scrapers, automations, dashboards, and fast sites.

## How the work is built

- A gated test suite — **more than 1,300 behavioral assertions** — stands behind the tooling. What we hand over has already been checked; you are not the test.
- **Every change gets an independent adversarial review.** The builder never signs off on its own work.
- The privacy line above is **measured, not asserted**: every page has been instrumented for zero external requests — measured during use, not just on load — and every new publish must pass that same gate.

## What buying looks like

Same-day quote. A fixed price that holds while scope holds, and a delivery date. You get clean, tested, working code plus a walkthrough — you own it, no lock-in. Any defect in delivered scope reported within 30 days is fixed free.

Typical bands: simple bot **$500–700** · automation **$1,000–2,500** · web scraper **$500–2,000** · dashboard or site **$800–2,500**. Fixed scopes start at $500.

**Reply with the one outcome you need — quote tonight: [tim@leuklogic.com](mailto:tim@leuklogic.com)**

---

*Repo notes: static site, no build step required to serve it, no external requests on the Abundance for All pages. Served by GitHub Pages from the `gh-pages` branch.*

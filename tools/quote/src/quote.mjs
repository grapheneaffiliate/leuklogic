/*
 * QuickQuote — quote.mjs
 * Pure, dependency-free instant-quote engine. No DOM, no Node APIs, no network.
 * Safe to inline verbatim into a single-file HTML page (<script type="module">).
 *
 * WHAT THIS IS. The public, self-serve version of LeukLogic's rate card: pick a
 * project type and a few scope knobs, get the same fixed-price band a direct
 * email would get. The point (per the standing sales playbook) is SPEED — a
 * visitor gets a real number in ten seconds instead of a "we'll get back to
 * you" — and honesty: the band comes from researched 2026 direct-client rates,
 * not a teaser price that doubles later.
 *
 * PRICING RULES the engine enforces (mirrors the internal rate card):
 *   - Fixed-scope floor: $500. No fixed-scope quote ever starts below it.
 *   - Each added integration beyond the base widens cost +10% (low) / +15% (high).
 *   - Multi-project commitment (2+ of the same thing): 10% off the summed band.
 *   - Prepay in full: a further 10% off. Discounts stack multiplicatively.
 *   - Scrapers are quoted build + REQUIRED monthly maintenance (sites break;
 *     build-only scraper quotes are how clients end up abandoned).
 *   - All arithmetic in whole dollars, rounded to the nearest $25 for display
 *     sanity (a $1,187 quote reads as false precision; $1,175 does not).
 */

// Base bands: direct-client, fixed scope, US 2026. Low/high in dollars.
// `intBase` = integrations already included in the base band.
export const RATE_CARD = {
  bot: { label: 'Discord / Slack bot (no database)', low: 500, high: 700, intBase: 1 },
  'bot-db': { label: 'Bot with database + integrations', low: 1200, high: 2500, intBase: 2 },
  automation: { label: 'Automation workflow (reports, API glue)', low: 1000, high: 2500, intBase: 2 },
  scraper: { label: 'Web scraper', low: 500, high: 2000, intBase: 1, maintenance: { low: 100, high: 300 } },
  dashboard: { label: 'Small dashboard / internal tool', low: 800, high: 2500, intBase: 1 },
  site: { label: 'Static small-business site', low: 800, high: 2500, intBase: 0 },
  landing: { label: 'Landing page', low: 300, high: 1500, intBase: 0 },
  chatbot: { label: 'AI chatbot over your docs', low: 2000, high: 5000, intBase: 1 },
};

const FIXED_SCOPE_FLOOR = 500;
const MULTI_DISCOUNT = 0.10; // 2+ projects committed together
const PREPAY_DISCOUNT = 0.10; // paid in full up front

function round25(n) {
  return Math.round(n / 25) * 25;
}

/**
 * quote(input) -> {
 *   low, high,            // the final band, whole dollars, rounded to $25
 *   perProject: {low,high},
 *   count, monthly,       // monthly is null unless the type carries maintenance
 *   applied: string[],    // every rule that changed the number, in order
 *   notes: string[],      // honest caveats (scope traps) — always worth reading
 *   label
 * }
 * input: { type, integrations?: number (total desired), count?: number (default 1),
 *          prepay?: boolean }
 * Throws on an unknown type — never guesses a price.
 */
export function quote(input = {}) {
  const card = RATE_CARD[input.type];
  if (!card) throw new Error(`unknown project type: ${JSON.stringify(input.type)}`);

  const count = Math.max(1, Math.floor(Number(input.count) || 1));
  const prepay = Boolean(input.prepay);
  const wantInts = Math.max(0, Math.floor(Number(input.integrations) || 0));
  const extraInts = Math.max(0, wantInts - card.intBase);

  const applied = [];
  const notes = [];

  let low = card.low;
  let high = card.high;

  if (extraInts > 0) {
    low = low * (1 + 0.10 * extraInts);
    high = high * (1 + 0.15 * extraInts);
    applied.push(
      `${extraInts} integration${extraInts === 1 ? '' : 's'} beyond the base: +${extraInts * 10}% low / +${extraInts * 15}% high`,
    );
  }

  // Floor applies per project, before discounts — the discounts are earned
  // (commitment, cash up front), the floor is the walk-away line.
  if (low < FIXED_SCOPE_FLOOR) {
    low = FIXED_SCOPE_FLOOR;
    applied.push(`fixed-scope floor: no project starts below $${FIXED_SCOPE_FLOOR}`);
    if (high < low) high = low;
  }

  const perProject = { low: round25(low), high: round25(high) };

  let totalLow = low * count;
  let totalHigh = high * count;
  if (count > 1) {
    totalLow *= 1 - MULTI_DISCOUNT;
    totalHigh *= 1 - MULTI_DISCOUNT;
    applied.push(`${count}-project commitment: ${MULTI_DISCOUNT * 100}% off the total`);
  }
  if (prepay) {
    totalLow *= 1 - PREPAY_DISCOUNT;
    totalHigh *= 1 - PREPAY_DISCOUNT;
    applied.push(`paid in full up front: a further ${PREPAY_DISCOUNT * 100}% off`);
  }

  let monthly = null;
  if (card.maintenance) {
    monthly = { low: card.maintenance.low, high: card.maintenance.high };
    notes.push(
      'Scrapers are quoted build + monthly maintenance, never build-only: the sites being scraped change and break the scraper — a build-only price quietly becomes abandonware.',
    );
  }
  notes.push(
    'Price lock: the number we agree on is the number you pay, as long as the scope does not change. Two revision rounds included; hosting runs on your own accounts (typically $0–50/mo) — never silently billed.',
  );
  if (input.type === 'chatbot') {
    notes.push('Chatbot quotes assume your docs are ready to load; heavy data cleanup is scoped separately, in writing, before we start.');
  }

  return {
    low: round25(totalLow),
    high: round25(totalHigh),
    perProject,
    count,
    monthly,
    applied,
    notes,
    label: card.label,
  };
}

export function fmt(n) {
  return '$' + Number(n).toLocaleString();
}

export default { quote, fmt, RATE_CARD };

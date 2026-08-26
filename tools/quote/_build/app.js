/* ============================================================================
 * APP — DOM wiring only. All pricing is the pure engine above.
 * No network, no storage; the mailto CTA is the only way anything leaves.
 * ==========================================================================*/
const $ = (id) => document.getElementById(id);

const sel = $('ptype');
for (const [key, card] of Object.entries(RATE_CARD)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = card.label;
  sel.appendChild(o);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function run() {
  let q;
  try {
    q = quote({
      type: sel.value,
      integrations: Number($('ints').value) || 0,
      count: Number($('count').value) || 1,
      prepay: $('prepay').checked,
    });
  } catch {
    return; // unknown type can't happen from the dropdown; stay silent
  }
  $('priceLabel').textContent =
    q.count > 1 ? `${q.count} × ${q.label}` : q.label;
  $('priceBand').textContent =
    q.low === q.high ? fmt(q.low) : `${fmt(q.low)} – ${fmt(q.high)}`;
  $('pricePer').textContent =
    q.count > 1 ? `(${fmt(q.perProject.low)} – ${fmt(q.perProject.high)} each before the bundle rate)` : '';
  $('priceMonthly').textContent = q.monthly
    ? `+ ${fmt(q.monthly.low)}–${fmt(q.monthly.high)}/mo maintenance (required — see why below)`
    : '';
  $('priceApplied').innerHTML = q.applied.map((a) => `<li>${esc(a)}</li>`).join('');
  $('priceNotes').innerHTML =
    '<strong>The fine print, up front:</strong> ' + q.notes.map(esc).join(' ');

  const subject = encodeURIComponent(`QuickQuote: ${q.label} — ${fmt(q.low)}-${fmt(q.high)}`);
  const body = encodeURIComponent(
    [
      `Hi Tim,`,
      ``,
      `I used QuickQuote and want to lock this in:`,
      `- Project: ${q.label}`,
      `- Quantity: ${q.count}`,
      `- Integrations: ${$('ints').value}`,
      `- Prepay in full: ${$('prepay').checked ? 'yes' : 'no'}`,
      `- Quoted band: ${fmt(q.low)} - ${fmt(q.high)}${q.monthly ? ` + ${fmt(q.monthly.low)}-${fmt(q.monthly.high)}/mo maintenance` : ''}`,
      ``,
      `What I actually need it to do:`,
      `(a sentence or two here)`,
      ``,
    ].join('\n'),
  );
  $('ctaMail').href = `mailto:tim@leuklogic.com?subject=${subject}&body=${body}`;
}

['change', 'input'].forEach((ev) => {
  sel.addEventListener(ev, run);
  $('ints').addEventListener(ev, run);
  $('count').addEventListener(ev, run);
  $('prepay').addEventListener(ev, run);
});
run();

/* ============================================================================
 * APP — DOM wiring only. All detection is the pure engine above.
 * No network, no storage; every action runs on this page.
 * ==========================================================================*/
const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

const csvIn = $('csvIn');
const errBox = $('err');
const results = $('results');
const cta = $('cta');
const statsEl = $('stats');
const rowsEl = $('rows');
const srcnote = $('srcnote');
const foundnote = $('foundnote');

let lastResult = null;

function money(n) {
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function showErr(msg) {
  errBox.textContent = msg;
  show(errBox, true);
  show(results, false);
  show(cta, false);
}

function runScan() {
  show(errBox, false);
  const text = csvIn.value;
  if (text.trim() === '') {
    show(results, false);
    show(cta, false);
    srcnote.textContent = '';
    return;
  }
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (e) {
    showErr('Could not read that as CSV: ' + e.message);
    return;
  }
  const opts = $('signPos').checked ? { chargesArePositive: true } : {};
  const mapped = transactionsFromCsv(parsed, opts);
  if (mapped.transactions.length === 0) {
    showErr(
      mapped.note ||
        'No charges found. Make sure the file has a date column, a description column, and an amount (or debit) column.',
    );
    return;
  }
  const res = detectSubscriptions(mapped.transactions);
  lastResult = res;
  render(res, mapped.note, mapped.transactions.length);
}

function render(res, note, scanned) {
  const hikes = res.subscriptions.filter((s) => s.priceIncrease).length;
  statsEl.innerHTML = [
    { n: money(res.totalMonthly), k: 'Per month', hot: false },
    { n: money(res.totalAnnual), k: 'Per year', hot: true },
    { n: String(res.count), k: res.count === 1 ? 'Subscription' : 'Subscriptions', hot: false },
    { n: String(hikes), k: hikes === 1 ? 'Price hike' : 'Price hikes', hot: hikes > 0 },
  ]
    .map((s) => `<li class="${s.hot ? 'hot' : ''}"><span class="n">${esc(s.n)}</span><span class="k">${esc(s.k)}</span></li>`)
    .join('');

  if (res.subscriptions.length === 0) {
    rowsEl.innerHTML = `<tr><td colspan="8"><div class="empty">No clearly recurring charges found among ${scanned} charge${scanned === 1 ? '' : 's'}. That can be right — or your export may cover too short a window to see a second charge from the same merchant. Try a longer date range.</div></td></tr>`;
  } else {
    rowsEl.innerHTML = res.subscriptions
      .map((s) => {
        const flags = [];
        if (s.priceIncrease) flags.push(`<span class="badge flag">price up</span>`);
        flags.push(`<span class="badge">review</span>`);
        return (
          `<tr>` +
          `<td class="keycol">${esc(s.merchant)}<br><span class="hint">${esc(s.sampleDesc)}</span></td>` +
          `<td>${esc(s.cadence)}</td>` +
          `<td class="num">${money(s.typicalAmount)}</td>` +
          `<td class="num">${money(s.monthly)}</td>` +
          `<td class="num">${money(s.annual)}</td>` +
          `<td class="num">${s.chargeCount}</td>` +
          `<td>${esc(s.firstDate)} → ${esc(s.lastDate)}${s.priceIncrease ? `<br><span class="hint">${money(s.firstAmount)} → ${money(s.lastAmount)}</span>` : ''}</td>` +
          `<td>${flags.join(' ')}</td>` +
          `</tr>`
        );
      })
      .join('');
  }

  foundnote.textContent = `Scanned ${scanned} charge${scanned === 1 ? '' : 's'}.`;
  srcnote.textContent = note || '';
  show(results, true);
  show(cta, true);
}

function downloadReport() {
  if (!lastResult || lastResult.subscriptions.length === 0) return;
  const head = ['Subscription', 'Cycle', 'Each', 'PerMonth', 'PerYear', 'Charges', 'FirstDate', 'LastDate', 'PriceIncrease'];
  const q = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [head.join(',')];
  for (const s of lastResult.subscriptions) {
    lines.push(
      [s.merchant, s.cadence, s.typicalAmount, s.monthly, s.annual, s.chargeCount, s.firstDate, s.lastDate, s.priceIncrease ? 'yes' : 'no']
        .map(q)
        .join(','),
    );
  }
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-subscriptions.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- drop zone + file input ---- */
(function wireDrop() {
  const dropEl = $('drop');
  const fileEl = $('file');
  const statEl = $('stat');
  const setStat = (msg, cls) => {
    statEl.innerHTML = cls ? `<span class="${cls}">${msg}</span>` : msg;
  };
  const readFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      csvIn.value = String(r.result || '');
      setStat(`Loaded ${esc(file.name)} (${file.size.toLocaleString()} bytes).`, 'ok');
      runScan();
    };
    r.onerror = () => setStat('Could not read that file.', 'warn');
    r.readAsText(file);
  };
  dropEl.addEventListener('click', () => fileEl.click());
  dropEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileEl.click();
    }
  });
  fileEl.addEventListener('change', () => readFile(fileEl.files[0]));
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('over');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    readFile(e.dataTransfer.files[0]);
  });
})();

const SAMPLE = [
  'Date,Description,Amount',
  '2026-01-03,WHOLE FOODS MKT #123 AUSTIN TX,-84.12',
  '2026-01-04,NETFLIX.COM 866-579-7172 CA,-15.49',
  '2026-01-06,SHELL OIL 574212,-52.10',
  '2026-01-08,SPOTIFY USA NEW YORK,-9.99',
  '2026-01-10,PLANET FIT CLUB 8009212,-24.99',
  '2026-01-15,PAYROLL DIRECT DEP,2450.00',
  '2026-01-16,ADOBE  *CREATIVE CLD,-54.99',
  '2026-01-20,ICLOUD APPLE.COM/BILL,-2.99',
  '2026-02-04,NETFLIX.COM 866-579-7172 CA,-15.49',
  '2026-02-08,SPOTIFY USA NEW YORK,-9.99',
  '2026-02-10,PLANET FIT CLUB 8009212,-24.99',
  '2026-02-11,WHOLE FOODS MKT #310 AUSTIN TX,-31.55',
  '2026-02-16,ADOBE  *CREATIVE CLD,-54.99',
  '2026-02-20,ICLOUD APPLE.COM/BILL,-2.99',
  '2026-03-01,AMAZON PRIME*2H4XY9 AMZN.COM WA,-139.00',
  '2026-03-04,NETFLIX.COM 866-579-7172 CA,-17.99',
  '2026-03-08,SPOTIFY USA NEW YORK,-11.99',
  '2026-03-10,PLANET FIT CLUB 8009212,-24.99',
  '2026-03-16,ADOBE  *CREATIVE CLD,-54.99',
  '2026-03-20,ICLOUD APPLE.COM/BILL,-2.99',
].join('\n');

$('scanBtn').addEventListener('click', runScan);
$('sampleBtn').addEventListener('click', () => {
  csvIn.value = SAMPLE;
  $('stat').textContent = 'Loaded sample statement — 3 months of a typical account.';
  runScan();
});
$('clearBtn').addEventListener('click', () => {
  csvIn.value = '';
  show(results, false);
  show(cta, false);
  show(errBox, false);
  srcnote.textContent = '';
  $('stat').textContent = 'No file loaded — you can also paste CSV, or try the sample.';
});
$('signPos').addEventListener('change', () => {
  if (csvIn.value.trim() !== '') runScan();
});
$('dlBtn').addEventListener('click', downloadReport);

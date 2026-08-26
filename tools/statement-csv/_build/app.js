/* ============================================================================
 * APP — DOM wiring + PDF text extraction. All statement parsing is the pure
 * engine above. The PDF engine is a locally-hosted, version-pinned pdf.js
 * (vendor/pdf.min.mjs + vendor/pdf.worker.min.mjs — same-origin files, part of
 * this site). No request ever carries the user's data.
 * ==========================================================================*/
const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

$('yearIn').value = new Date().getFullYear();

let lastCsv = '';
let pdfjsPromise = null;
function loadPdfjs() {
  // Lazy same-origin import: the engine is fetched from THIS site on first use.
  if (!pdfjsPromise) {
    pdfjsPromise = import('./vendor/pdf.min.mjs').then((mod) => {
      const lib = mod.default || mod;
      lib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * Rebuild text LINES from pdf.js text items using their Y coordinates —
 * naive item-joining scrambles the columns statements depend on. Items whose
 * baseline Y is within a small tolerance belong to one visual line; within a
 * line, order by X. A wide X gap becomes a column gap (space-joined anyway;
 * the engine's tokenizer only needs whitespace separation).
 */
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) {
      row = { y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y); // PDF Y grows upward; top of page first
  return rows.map((r) =>
    r.cells
      .sort((a, b) => a.x - b.x)
      .map((c) => c.str.trim())
      .filter(Boolean)
      .join(' '),
  );
}

async function extractPdfText(buf, statEl) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    statEl.innerHTML = `<span class="ok">Reading page ${p} of ${doc.numPages}…</span>`;
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    lines.push(...itemsToLines(tc.items));
  }
  return { text: lines.join('\n'), pages: doc.numPages };
}

function runParse(text, sourceLabel) {
  show($('err'), false);
  const year = Number($('yearIn').value) || undefined;
  const res = parseStatementText(text, { year });
  render(res, sourceLabel);
}

function render(res, sourceLabel) {
  const txns = res.transactions;
  if (txns.length === 0) {
    showErr(
      `No transactions found in ${sourceLabel}. ` +
        (res.unparsed.length
          ? `${res.unparsed.length} line(s) had content but didn't match a transaction shape — open the unparsed list below after a successful parse, or email a redacted sample and we'll add your bank's layout.`
          : 'If this is a scanned/photographed statement, it has no text layer — this tool reads real text and will not pretend to OCR an image.'),
    );
    return;
  }
  const hasBalance = txns.some((t) => t.balance != null);
  $('stats').innerHTML =
    `<li><span class="n">${txns.length}</span><span class="k">transactions</span></li>` +
    `<li><span class="n">${esc(txns[0].date)} → ${esc(txns[txns.length - 1].date)}</span><span class="k">date range</span></li>` +
    `<li><span class="n">${res.unparsed.length}</span><span class="k">unparsed lines</span></li>`;
  show($('yearNote'), res.yearAssumed);
  if (res.yearAssumed)
    $('yearNote').textContent = `Your statement's dates omit the year, so the year field above (${$('yearIn').value}) was applied — fix it there if this statement is from a different year and re-parse.`;

  $('thead').innerHTML =
    '<th>Date</th><th>Description</th><th class="num">Amount</th>' + (hasBalance ? '<th class="num">Balance</th>' : '');
  const LIMIT = 200;
  $('rows').innerHTML = txns
    .slice(0, LIMIT)
    .map(
      (t) =>
        `<tr><td>${esc(t.date)}</td><td>${esc(t.description)}</td><td class="num">${t.amount.toFixed(2)}</td>` +
        (hasBalance ? `<td class="num">${t.balance != null ? t.balance.toFixed(2) : ''}</td>` : '') +
        '</tr>',
    )
    .join('');
  $('morenote').textContent = txns.length > LIMIT ? `Showing first ${LIMIT} of ${txns.length}; the CSV has all of them.` : '';

  show($('unparsedBox'), res.unparsed.length > 0);
  if (res.unparsed.length) {
    $('unparsedSummary').textContent = `${res.unparsed.length} unparsed line(s) — review them (nothing was silently dropped)`;
    $('unparsedRows').innerHTML = res.unparsed
      .slice(0, 100)
      .map((u) => `<tr><td class="num">${u.line}</td><td>${esc(u.text)}</td></tr>`)
      .join('');
  }

  lastCsv = toCsv(txns);
  show($('results'), true);
  $('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showErr(msg) {
  $('err').textContent = msg;
  show($('err'), true);
  show($('results'), false);
}

async function handleFile(file) {
  if (!file) return;
  const stat = $('stat');
  if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    stat.innerHTML = '<span class="warn">That is not a PDF — for CSV/text statements, use the paste box (or our other CSV tools).</span>';
    return;
  }
  try {
    stat.innerHTML = `<span class="ok">Opening ${esc(file.name)}…</span>`;
    const buf = await file.arrayBuffer();
    const { text, pages } = await extractPdfText(buf, stat);
    if (text.replace(/\s/g, '').length < 40) {
      stat.innerHTML = `<span class="warn">Read ${pages} page(s) but found almost no text.</span>`;
      showErr(
        'This PDF has no real text layer — it is a scanned or photographed statement. This tool reads actual text and will not pretend to OCR an image. Ask your bank for the "download statement (PDF)" version, which has real text.',
      );
      return;
    }
    stat.innerHTML = `<span class="ok">Read ${pages} page(s) of ${esc(file.name)}.</span>`;
    runParse(text, esc(file.name));
  } catch (e) {
    stat.innerHTML = '<span class="warn">Could not read that PDF.</span>';
    showErr('Could not read that PDF' + (/password/i.test(String(e && e.message)) ? ' — it is password-protected. Remove the password first (print-to-PDF works).' : '. ' + String((e && e.message) || e)));
  }
}

(function wire() {
  const dropEl = $('drop');
  const fileEl = $('file');
  dropEl.addEventListener('click', () => fileEl.click());
  dropEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileEl.click();
    }
  });
  fileEl.addEventListener('change', () => handleFile(fileEl.files[0]));
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('over');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    handleFile(e.dataTransfer.files[0]);
  });
  $('parseTextBtn').addEventListener('click', () => {
    const t = $('textIn').value;
    if (t.trim()) runParse(t, 'the pasted text');
  });
  $('dlBtn').addEventListener('click', () => {
    if (!lastCsv) return;
    const blob = new Blob([lastCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statement.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('copyBtn').addEventListener('click', async () => {
    if (!lastCsv) return;
    try {
      await navigator.clipboard.writeText(lastCsv);
      $('copyBtn').textContent = 'Copied ✓';
      setTimeout(() => ($('copyBtn').textContent = 'Copy CSV'), 1200);
    } catch {
      $('copyBtn').textContent = 'Press Ctrl/Cmd+C';
    }
  });
})();

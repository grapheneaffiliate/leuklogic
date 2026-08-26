/* ============================================================================
 * APP — DOM wiring only. All checks are the pure engine above.
 * The file is read by the browser's own <video> element via an object URL;
 * nothing is uploaded and no network request is made.
 * ==========================================================================*/
const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const BADGE_TEXT = { pass: 'fits', warn: 'caution', fail: 'won’t fly' };

function render(res, meta) {
  const metaEl = $('meta');
  metaEl.innerHTML = [
    meta.durationSec ? `<li>length <b>${esc(fmtDur(meta.durationSec))}</b></li>` : '<li>length <b>unreadable</b></li>',
    meta.width && meta.height ? `<li>size <b>${meta.width}×${meta.height}</b> (${esc(res.aspect || '?')})</li>` : '<li>dimensions <b>unreadable</b></li>',
    `<li>file <b>${esc(fmtSize(meta.sizeBytes))}</b></li>`,
  ].join('');
  show(metaEl, true);

  $('platforms').innerHTML = res.platforms
    .map(
      (p) =>
        `<div class="platform ${p.verdict}">` +
        `<h3>${esc(p.name)} <span class="badge ${p.verdict}">${BADGE_TEXT[p.verdict]}</span></h3>` +
        `<ul>${p.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` +
        `</div>`,
    )
    .join('');
  show($('results'), true);
}

function analyze(file) {
  show($('err'), false);
  const stat = $('stat');
  stat.innerHTML = `<span class="ok">Reading ${esc(file.name)} (${esc(fmtSize(file.size))})…</span>`;
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'metadata';
  let done = false;
  const finish = (meta) => {
    if (done) return;
    done = true;
    URL.revokeObjectURL(url);
    stat.innerHTML = `<span class="ok">Checked ${esc(file.name)}.</span>`;
    render(checkVideo(meta), meta);
  };
  v.onloadedmetadata = () => {
    finish({
      durationSec: Number.isFinite(v.duration) ? v.duration : 0,
      width: v.videoWidth,
      height: v.videoHeight,
      sizeBytes: file.size,
    });
  };
  v.onerror = () => {
    // Codec the browser can't parse: still check what we know (file size),
    // and say plainly what was unreadable.
    finish({ durationSec: 0, width: 0, height: 0, sizeBytes: file.size });
    const err = $('err');
    err.textContent =
      'Your browser could not read this file’s video metadata (unsupported codec or container). Size checks still ran; duration and aspect checks are marked unreadable.';
    show(err, true);
  };
  // Safety timeout: some files hang metadata loading.
  setTimeout(() => {
    if (!done) {
      finish({ durationSec: 0, width: 0, height: 0, sizeBytes: file.size });
    }
  }, 8000);
  v.src = url;
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
  fileEl.addEventListener('change', () => fileEl.files[0] && analyze(fileEl.files[0]));
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('over');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]);
  });
})();

/* Abundance for All: homepage behaviour. Vanilla JS. Same-origin fetches only (films.json). */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SITE = "https://leuklogic.com/";
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  /* ---- hero film: only fetched when motion is welcome; pausable (WCAG 2.2.2) ---- */
  var hv = $("#hero-video"), pb = $("#hero-pause");
  if (hv && !reduce) {
    hv.src = hv.getAttribute("data-src"); hv.load();
    var p = hv.play(); if (p && p.catch) p.catch(function () { /* autoplay blocked: poster stays */ });
    if (pb) pb.hidden = false;
    var userPaused = false;
    if (pb) pb.addEventListener("click", function () {
      if (hv.paused) { hv.play(); userPaused = false; pb.textContent = "Pause film"; pb.setAttribute("aria-pressed", "false"); }
      else { hv.pause(); userPaused = true; pb.textContent = "Play film"; pb.setAttribute("aria-pressed", "true"); }
    });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!userPaused) { if (e.isIntersecting) hv.play().catch(function () {}); else hv.pause(); } });
    }, { threshold: 0.05 }).observe(hv);
  }

  /* ---- three ingredients: sticky stage crossfades with the beat in view (desktop) ---- */
  var stage = $$(".stage img"), beats = $$(".beat");
  function setStage(i) { stage.forEach(function (im, j) { im.classList.toggle("on", j === i); }); }
  if (stage.length) { setStage(0);
    if ("IntersectionObserver" in window) {
      var bo = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) setStage(beats.indexOf(e.target)); });
      }, { rootMargin: "-45% 0px -45% 0px" });
      beats.forEach(function (b) { bo.observe(b); });
    }
  }
  // gentle parallax on the stacked (mobile) pictures; skipped for reduced motion
  if (!reduce) {
    var pics = $$(".beat .pic img"), tick = false;
    var par = function () {
      pics.forEach(function (im) {
        var r = im.parentNode.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.height) return;
        var k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; im.style.transform = "translateY(" + (k * -26).toFixed(1) + "px) scale(1.12)";
      }); tick = false;
    };
    if (pics.length) addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(par); } }, { passive: true });
  }

  /* ---- films: pre-rendered from /films.json at build time; a newer films.json is picked up at runtime ---- */
  var fm = $("#films-list");
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function playFilm(btn) {
    var pl = btn.parentNode, v = document.createElement("video");
    v.controls = true; v.playsInline = true; v.preload = "auto"; v.poster = btn.dataset.poster; v.setAttribute("aria-label", btn.dataset.title);
    v.innerHTML = '<source src="' + esc(btn.dataset.mp4) + '" type="video/mp4">'; pl.replaceChild(v, btn); v.play().catch(function () {}); v.focus();
  }
  function wireFilms() { $$(".posterbtn", fm).forEach(function (b) { b.addEventListener("click", function () { playFilm(b); }); }); }
  function filmHtml(f) {
    var links = f.links.map(function (l, i) { return '<a class="btn ' + (i ? "btn-g" : "btn-p") + '" href="' + esc(l.url) + '" rel="noopener">' + esc(l.label) + "</a>"; }).join("");
    return '<article class="film rv in" data-film="' + esc(f.id) + '"><div class="player"><span class="ailabel">AI-generated film</span>' +
      '<button class="posterbtn" type="button" style="background-image:url(' + esc(f.poster) + ')" aria-label="Play the film: ' + esc(f.title) + '" data-mp4="' + esc(f.mp4) + '" data-poster="' + esc(f.poster) + '" data-title="' + esc(f.title) + '"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg></span></button></div>' +
      '<div class="txt"><p class="kick">' + esc(f.kind) + " &middot; " + esc(f.duration) + "</p><h3>" + esc(f.title) + '</h3><p class="lead">' + esc(f.description) + '</p><p class="meta">' + esc(f.aiLabel) + '</p><div class="links">' + links + "</div></div></article>";
  }
  if (fm) {
    wireFilms();
    fetch("/films.json").then(function (r) { return r.json(); }).then(function (d) {
      var ids = d.films.map(function (f) { return f.id; }).join(",");
      if (ids !== fm.dataset.ids) { fm.innerHTML = d.films.map(filmHtml).join(""); fm.dataset.ids = ids; wireFilms(); }
    }).catch(function () { /* the pre-rendered films stay */ });
  }

  /* ---- Design-your-day teaser: the same renderer as /day/, cycling three example cards ---- */
  var mc = $("#minicard");
  if (mc && window.AbundanceCard) {
    var A = window.AbundanceCard, ex = [
      { c: ["laundry", "cook", "taxes", "drive"], t: ["family", "music", "rest"], n: "" },
      { c: ["paperwork", "email", "repair", "hold", "busywork"], t: ["create", "learn", "explore"], n: "" },
      { c: ["yard", "groceries", "clean", "haul"], t: ["faith", "serve", "friends", "outdoors"], n: "" }
    ], i = 0;
    var go = function () { A.render(mc, ex[i % ex.length], 540, 675).then(function () { mc.style.opacity = 1; }); i++; };
    var started = false, start = function () {
      if (started) return; started = true; go();
      if (!reduce) setInterval(function () { mc.style.opacity = 0; setTimeout(go, 420); }, 4600);
    };
    mc.style.transition = "opacity .4s"; mc.style.opacity = 0;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { start(); o.disconnect(); } }, { rootMargin: "200px" }).observe(mc); else start();
  }

  /* ---- pledge: a card made in this browser, plain share links, no counter, nothing stored ---- */
  var form = $("#pledge-form");
  if (form && window.AbundanceCard) {
    var A2 = window.AbundanceCard, pc = $("#pcanvas"), box = $("#pcard"), st = $("#pstatus"), cur = null;
    var text = "I believe we should build superintelligence and robotics so nobody ever has to go without. Add your voice:";
    $("#pshare-x").href = AbundanceShare.x(text, SITE); $("#pshare-fb").href = AbundanceShare.fb(SITE);
    function say(m) { st.textContent = m; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = A2.cleanName($("#pname").value);
      A2.renderPledge(pc, n, 1080, 1350).then(function () { box.classList.add("on"); say(""); pc.setAttribute("aria-label", "Pledge card: I believe we should build it for everyone." + (n ? " Signed " + n + "." : "")); box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); });
    });
    $("#pcopy").addEventListener("click", function () { AbundanceShare.copy(SITE).then(function () { say("Link copied."); }, function () { say("Copy failed. The link is " + SITE); }); });
    $("#pdl").addEventListener("click", function () { A2.toBlob(pc).then(function (b) { AbundanceShare.download(b, "i-believe-abundance-for-all.png"); say("Card saved."); }); });
    var sf = $("#pshare-file");
    if (navigator.canShare && typeof File === "function") sf.hidden = false;
    sf.addEventListener("click", function () {
      A2.toBlob(pc).then(function (b) { return AbundanceShare.shareFile(b, "i-believe-abundance-for-all.png", text, SITE).then(function (r) { if (r === "unsupported") { AbundanceShare.download(b, "i-believe-abundance-for-all.png"); say("Sharing files is not supported here, so the card was saved instead."); } }); });
    });
  }
})();

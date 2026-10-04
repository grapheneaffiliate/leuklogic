/* /day/: the "design your abundant day" card builder. State lives in the URL hash; the card is drawn on a canvas in this browser. */
(function () {
  "use strict";
  var A = window.AbundanceCard, S = window.AbundanceShare;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BASE = "https://leuklogic.com/day/";
  function $(s) { return document.querySelector(s); }
  var state = A.decode(location.hash), fmt = "feed";
  var canvas = $("#card"), status = $("#status"), nameIn = $("#dname"), draw = 0, timer = 0;
  var SIZES = { feed: [1080, 1350], story: [1080, 1920] };

  function hydrate(host, list, key) {
    var btns = [].slice.call(host.querySelectorAll(".chip"));
    btns.forEach(function (b) {
      b.classList.add(key);
      b.setAttribute("aria-pressed", state[key].indexOf(b.dataset.id) >= 0 ? "true" : "false");
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on ? "true" : "false");
        state[key] = list.map(function (x) { return x.id; }).filter(function (id) { return btns.some(function (x) { return x.dataset.id === id && x.getAttribute("aria-pressed") === "true"; }); });
        changed();
      });
    });
  }
  hydrate($("#chores"), A.CHORES, "c"); hydrate($("#times"), A.TIMES, "t");
  nameIn.value = state.n;
  nameIn.addEventListener("input", function () { state.n = A.cleanName(nameIn.value); changed(); });

  function url() { var h = A.encode(state); return BASE + (h ? "#" + h : ""); }
  function say(m) { status.textContent = m; if (m) { clearTimeout(say.t); say.t = setTimeout(function () { status.textContent = ""; }, 4200); } }
  var shareText = function () { return state.n ? state.n + "’s abundant day. What would yours be?" : "My abundant day. What would yours be?"; };
  function links() { $("#s-x").href = S.x(shareText(), url()); $("#s-fb").href = S.fb(url()); }

  function paint() {
    var my = ++draw, sz = SIZES[fmt];
    return A.render(canvas, state, sz[0], sz[1]).then(function () { if (my === draw) canvas.setAttribute("aria-label", "Your abundant-day card. " + describe()); });
  }
  function describe() {
    var c = state.c.map(function (id) { return A.CHORES.filter(function (x) { return x.id === id; })[0].short; }), t = state.t.map(function (id) { return A.TIMES.filter(function (x) { return x.id === id; })[0].phrase; });
    return (state.n ? state.n + "’s" : "My") + " abundant day. Robots and AI take care of " + (c.join(", ") || "the tedious stuff") + ". Time back for " + (t.join(", ") || "the people and things I love") + ".";
  }
  function changed() {
    var h = A.encode(state); try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) { /* file: or sandboxed */ }
    links(); clearTimeout(timer); timer = setTimeout(paint, 90);
  }

  // size toggle
  [].forEach.call(document.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () {
      fmt = b.dataset.fmt; [].forEach.call(document.querySelectorAll(".seg button"), function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
      var w = $("#cwrap"); w.style.opacity = 0; paint().then(function () { w.style.opacity = 1; });
    });
  });
  function exportBlob(f) {
    var c = document.createElement("canvas"), sz = SIZES[f]; return A.render(c, state, sz[0], sz[1]).then(function () { return A.toBlob(c); });
  }
  function fname(f) { return "abundant-day-" + f + ".png"; }
  $("#dl-feed").addEventListener("click", function () { exportBlob("feed").then(function (b) { S.download(b, fname("feed")); say("Saved the feed card."); }); });
  $("#dl-story").addEventListener("click", function () { exportBlob("story").then(function (b) { S.download(b, fname("story")); say("Saved the story card."); }); });
  $("#copy").addEventListener("click", function () { S.copy(url()).then(function () { say("Link copied. Anyone who opens it sees your card."); }, function () { say("Could not copy. Your link: " + url()); }); });
  $("#share").addEventListener("click", function () {
    exportBlob(fmt).then(function (b) {
      return S.shareFile(b, fname(fmt), shareText(), url()).then(function (r) {
        if (r === "unsupported") { S.download(b, fname(fmt)); say("Sharing files is not available here, so the card was saved. Attach it where you post."); }
        else if (r === "shared") say("Shared.");
      });
    });
  });
  $("#reset").addEventListener("click", function () {
    state = { c: [], t: [], n: "" }; nameIn.value = "";
    [].forEach.call(document.querySelectorAll(".chip"), function (b) { b.setAttribute("aria-pressed", "false"); });
    changed();
  });
  // a link opened later or an edited hash redraws the card
  addEventListener("hashchange", function () {
    var s = A.decode(location.hash); if (A.encode(s) === A.encode(state)) return; state = s; nameIn.value = s.n;
    [].forEach.call(document.querySelectorAll(".chip"), function (b) { var k = b.classList.contains("c") ? "c" : "t"; b.setAttribute("aria-pressed", state[k].indexOf(b.dataset.id) >= 0 ? "true" : "false"); });
    links(); paint();
  });
  links(); paint();
  window.__dayState = function () { return state; };
})();

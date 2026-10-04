/* Abundance for All: the share-card renderer (canvas). Shared by /, /day/ and /embed/widget/.
   Everything is drawn in a 1080-wide logical space and scaled, so 1080x1350, 1080x1920 and thumbnails use one code path.
   No numbers are ever drawn on a card. Art is the film's own keyframes (AI-generated, labelled on the card). */
(function () {
  "use strict";
  var OPT = window.AbundanceOptions || { chores: [], times: [] };
  var CHORES = OPT.chores.map(function (a) { return { id: a[0], label: a[1], short: a[2] }; });
  var TIMES = OPT.times.map(function (a) { return { id: a[0], label: a[1], phrase: a[2], art: a[3] }; });
  var FOCUS = { K1: 0.55, K2: 0.35, K3: 0.62, K4: 0.55, K5: 0.55, K6: 0.6 };
  var C = { cream: "#fbf3e4", paper: "#f3e6cc", ink: "#2a1d12", soft: "#5a4838", amber: "#e8a23b", amberInk: "#8a4f0b",
    terra: "#9a4522", teal: "#1b4a4d", tealD: "#0e2527", mist: "#efe2c8" };
  var W = 1080;
  var imgs = {};

  function ids(list) { return list.reduce(function (m, x) { m[x.id] = x; return m; }, {}); }
  var CH = ids(CHORES), TM = ids(TIMES);

  function cleanName(s) {
    s = String(s || "").normalize ? String(s || "").normalize("NFC") : String(s || "");
    s = s.replace(/[^\p{L}\p{M}\s'.\-]/gu, "").replace(/\s+/g, " ").trim();
    if (s.length > 24) { var cut = s.slice(0, 24), sp = cut.lastIndexOf(" "); s = sp > 8 ? cut.slice(0, sp) : cut; }
    return s.trim();
  }
  function encode(st) {
    var p = [];
    if (st.c && st.c.length) p.push("c=" + st.c.join("."));
    if (st.t && st.t.length) p.push("t=" + st.t.join("."));
    var n = cleanName(st.n); if (n) p.push("n=" + encodeURIComponent(n));
    return p.join("&");
  }
  function decode(h) {
    h = String(h || "").replace(/^#/, "");
    var out = { c: [], t: [], n: "" };
    h.split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i < 0) return;
      var k = kv.slice(0, i), v = kv.slice(i + 1);
      if (k === "c") out.c = v.split(".").filter(function (x) { return CH[x]; });
      else if (k === "t") out.t = v.split(".").filter(function (x) { return TM[x]; });
      else if (k === "n") { try { out.n = cleanName(decodeURIComponent(v)); } catch (e) { out.n = ""; } }
    });
    out.c = CHORES.map(function (x) { return x.id; }).filter(function (x) { return out.c.indexOf(x) >= 0; });
    out.t = TIMES.map(function (x) { return x.id; }).filter(function (x) { return out.t.indexOf(x) >= 0; });
    return out;
  }

  function loadImg(key) {
    if (imgs[key]) return imgs[key];
    imgs[key] = new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("img " + key)); };
      im.src = "/img/kf/" + key + ".webp";
    });
    return imgs[key];
  }
  function ready(keys) {
    var f = document.fonts && document.fonts.load ? [
      document.fonts.load("600 100px Fraunces"), document.fonts.load("italic 500 100px Fraunces"), document.fonts.load("700 30px Figtree"), document.fonts.load("600 30px Figtree")
    ] : [];
    return Promise.all(f.concat((keys || ["K6"]).map(loadImg)));
  }
  function artFor(st) {
    var first = st.t && st.t.length ? TM[st.t[0]] : null; return first ? first.art : "K4";
  }
  function setLS(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cover(ctx, im, x, y, w, h, fy) {
    var s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
    var dx = x + (w - dw) / 2, dy = y + (h - dh) * (fy == null ? 0.5 : fy);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(im, dx, dy, dw, dh); ctx.restore();
  }
  function wrap(ctx, text, maxW) {
    var words = text.split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur); return lines;
  }
  function list(arr) {
    if (arr.length <= 1) return arr.join("");
    if (arr.length === 2) return arr[0] + " and " + arr[1];
    return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
  }

  function render(canvas, st, w, h) {
    st = st || { c: [], t: [], n: "" };
    var s = w / W, H = h / s, ctx = canvas.getContext("2d");
    canvas.width = w; canvas.height = h;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    var key = artFor(st);
    return ready([key]).then(function (r) { draw(ctx, st, H, r[r.length - 1], key); });
  }

  function draw(ctx, st, H, im, key) {
    var artH = Math.round(H * (H > 1500 ? 0.45 : 0.4)), panelTop = artH - 64;
    // art
    ctx.fillStyle = C.tealD; ctx.fillRect(0, 0, W, H);
    cover(ctx, im, 0, 0, W, artH + 40, FOCUS[key] || 0.5);
    var g = ctx.createLinearGradient(0, 0, 0, artH);
    g.addColorStop(0, "rgba(14,37,39,.35)"); g.addColorStop(0.35, "rgba(14,37,39,0)"); g.addColorStop(1, "rgba(14,37,39,.38)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, artH + 40);
    var glow = ctx.createRadialGradient(W * 0.82, artH * 0.12, 10, W * 0.82, artH * 0.12, W * 0.7);
    glow.addColorStop(0, "rgba(255,214,150,.38)"); glow.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, artH + 40);
    // top label (kept inside the story-safe zone on the tall card)
    var tall = H > 1500, ty = tall ? 240 : 56, sb = tall ? 250 : 0;
    ctx.save(); setLS(ctx, 4); ctx.font = "700 26px Figtree, sans-serif"; var lab = "ABUNDANCE FOR ALL", lw = ctx.measureText(lab).width + 64;
    rr(ctx, 56, ty, lw, 56, 28); ctx.fillStyle = "rgba(14,37,39,.62)"; ctx.fill();
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(84, ty + 28, 8, 0, 7); ctx.fill();
    ctx.fillStyle = C.cream; ctx.textBaseline = "middle"; ctx.fillText(lab, 106, ty + 29); ctx.restore();
    // panel
    ctx.save(); ctx.shadowColor = "rgba(14,37,39,.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = -10;
    rr(ctx, 0, panelTop, W, H - panelTop + 80, 64); var pg = ctx.createLinearGradient(0, panelTop, 0, H);
    pg.addColorStop(0, C.cream); pg.addColorStop(0.7, C.paper); pg.addColorStop(1, "#ead2a4"); ctx.fillStyle = pg; ctx.fill(); ctx.restore();
    // content, shrinking until it fits above the footer
    var ks = [1.3, 1.22, 1.15, 1.08, 1, 0.92, 0.85, 0.78, 0.7, 0.62], i, used, limit = H - sb - 205;
    for (i = 0; i < ks.length; i++) { used = content(ctx, st, H, panelTop, ks[i], false); if (used <= limit) break; }
    i = Math.min(i, ks.length - 1);
    var off = Math.max(0, Math.min(used === undefined ? 0 : (limit - used) * 0.45, 80));
    content(ctx, st, H, panelTop + off, ks[i], true);
    // footer
    var fy = H - 100 - sb; ctx.strokeStyle = "rgba(42,29,18,.2)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(76, fy - 34); ctx.lineTo(W - 76, fy - 34); ctx.stroke();
    ctx.textBaseline = "alphabetic"; setLS(ctx, 0); ctx.fillStyle = C.ink; ctx.font = "700 32px Figtree, sans-serif"; ctx.fillText("What would yours be?", 76, fy + 12);
    ctx.fillStyle = C.terra; ctx.font = "600 30px Figtree, sans-serif"; ctx.fillText("leuklogic.com/day", 76, fy + 54);
    ctx.fillStyle = C.soft; ctx.font = "500 22px Figtree, sans-serif"; ctx.textAlign = "right"; ctx.fillText("Art: AI-generated", W - 76, fy + 54); ctx.textAlign = "left";
  }

  function content(ctx, st, H, panelTop, k, doDraw) {
    var padX = 76, maxW = W - padX * 2, y = panelTop + 96, name = cleanName(st.n), stacked = H > 1500;
    var maxRows = stacked ? 5 : 2, maxL = stacked ? 4 : 2;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    function fit(text, it, base) { var px = base; for (; px > 40; px -= 4) { ctx.font = (it ? "italic 500 " : "600 ") + px + "px Fraunces, Georgia, serif"; setLS(ctx, -1); if (ctx.measureText(text).width <= maxW) break; } return px; }
    // title: one line on the feed card when it fits, stacked on the story card
    var l1 = name ? name + "\u2019s" : "My", l2 = "abundant day", one = l1 + " " + l2;
    if (!stacked) {
      ctx.font = "600 100px Fraunces, Georgia, serif"; setLS(ctx, -1);
      var w1 = ctx.measureText(l1 + " ").width, w2; ctx.font = "italic 500 100px Fraunces, Georgia, serif"; w2 = ctx.measureText(l2).width;
      var ts1 = Math.min(132 * k, Math.floor(maxW / ((w1 + w2) / 100)));
      if (ts1 >= 92 * k) {
        if (doDraw) {
          ctx.font = "600 " + ts1 + "px Fraunces, Georgia, serif"; ctx.fillStyle = C.ink; ctx.fillText(l1 + " ", padX, y + ts1 * 0.8);
          var off = ctx.measureText(l1 + " ").width; ctx.font = "italic 500 " + ts1 + "px Fraunces, Georgia, serif"; ctx.fillStyle = C.terra; ctx.fillText(l2, padX + off, y + ts1 * 0.8);
        }
        y += ts1 * 1.0 + 40 * k; return rest(ctx, st, H, y, k, doDraw, padX, maxW, maxRows, maxL);
      }
    }
    var ts = Math.min(fit(l1, false, (stacked ? 168 : 124) * k), fit(l2, true, (stacked ? 168 : 124) * k));
    if (doDraw) {
      setLS(ctx, -1); ctx.fillStyle = C.ink; ctx.font = "600 " + ts + "px Fraunces, Georgia, serif"; ctx.fillText(l1, padX, y + ts * 0.82);
      ctx.fillStyle = C.terra; ctx.font = "italic 500 " + ts + "px Fraunces, Georgia, serif"; ctx.fillText(l2, padX, y + ts * 1.82);
    }
    y += ts * 1.95 + 36 * k;
    return rest(ctx, st, H, y, k, doDraw, padX, maxW, maxRows, maxL);
  }

  function rest(ctx, st, H, y, k, doDraw, padX, maxW, maxRows, maxL) {
    function label(t) { if (doDraw) { setLS(ctx, 3); ctx.fillStyle = C.amberInk; ctx.font = "700 " + (27 * k) + "px Figtree, sans-serif"; ctx.fillText(t.toUpperCase(), padX, y + 22 * k); setLS(ctx, 0); } y += 50 * k; }
    var chores = (st.c && st.c.length ? st.c : []).map(function (id) { return CH[id].short; });
    label("Robots and AI take care of");
    var pf = "600 " + (38 * k) + "px Figtree, sans-serif", ph = 78 * k, gap = 12 * k, pad = 28 * k;
    ctx.font = pf; setLS(ctx, 0);
    var items = chores.length ? chores.slice() : ["the tedious stuff"];
    function flow(arr) { var rows = [[]], x = 0; arr.forEach(function (t) { var pw = ctx.measureText(t).width + pad * 2; if (x + pw > maxW && rows[rows.length - 1].length) { rows.push([]); x = 0; } rows[rows.length - 1].push({ t: t, w: pw }); x += pw + gap; }); return rows; }
    var rows = flow(items);
    if (rows.length > maxRows) {
      items = items.slice(); rows = flow(items.concat(["and more"]));
      while (rows.length > maxRows && items.length > 1) { items.pop(); rows = flow(items.concat(["and more"])); }
      items.push("and more"); rows = flow(items);
    }
    rows.forEach(function (row) {
      var x = padX; row.forEach(function (p) {
        if (doDraw) { rr(ctx, x, y, p.w, ph, ph / 2); ctx.fillStyle = "rgba(27,74,77,.11)"; ctx.fill(); ctx.strokeStyle = "rgba(27,74,77,.38)"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = C.tealD; ctx.font = pf; ctx.textBaseline = "middle"; ctx.fillText(p.t, x + pad, y + ph / 2 + 2); ctx.textBaseline = "alphabetic"; }
        x += p.w + gap;
      }); y += ph + gap;
    });
    y += 22 * k;
    label("And I get my time back for");
    var times = (st.t && st.t.length ? st.t : []).map(function (id) { return TM[id].phrase; });
    var fs = 74 * k; ctx.font = "italic 500 " + fs + "px Fraunces, Georgia, serif"; setLS(ctx, -0.5);
    var lines, phrase, n = Math.min(times.length, 6), more = times.length > n;
    do {
      var part = times.slice(0, n);
      phrase = !times.length ? "the people and things I love" : more ? part.join(", ") + ", and more" : list(part);
      lines = wrap(ctx, phrase, maxW);
      if (lines.length <= maxL || n <= 1) break;
      n--; more = true;
    } while (true);
    lines.forEach(function (ln) { if (doDraw) { ctx.fillStyle = C.teal; ctx.fillText(ln, padX, y + fs * 0.85); } y += fs * 1.12; });
    setLS(ctx, 0);
    return y;
  }

  function renderPledge(canvas, name, w, h) {
    var s = w / W, H = h / s, ctx = canvas.getContext("2d"); name = cleanName(name);
    canvas.width = w; canvas.height = h; ctx.setTransform(s, 0, 0, s, 0, 0);
    return ready(["K6"]).then(function (r) {
      var im = r[r.length - 1];
      cover(ctx, im, 0, 0, W, H, 0.55);
      var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(14,37,39,.88)"); g.addColorStop(0.5, "rgba(14,37,39,.55)"); g.addColorStop(1, "rgba(14,37,39,.92)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic"; setLS(ctx, 5); ctx.fillStyle = C.amber; ctx.font = "700 28px Figtree, sans-serif"; ctx.fillText("ABUNDANCE FOR ALL", 84, 150); setLS(ctx, 0);
      var lines = ["I believe we", "should build it", "for everyone."], px = 128, y = 300;
      lines.forEach(function (ln, i) { ctx.font = (i === 2 ? "italic 500 " : "600 ") + px + "px Fraunces, Georgia, serif"; ctx.fillStyle = i === 2 ? "#f3b95f" : C.cream; setLS(ctx, -2); ctx.fillText(ln, 84, y); y += px * 1.08; });
      setLS(ctx, 0); ctx.fillStyle = C.mist; ctx.font = "500 40px Figtree, sans-serif";
      var sub = wrap(ctx, "Superintelligence and robotics for every need and every reasonable want.", W - 168), yy = y + 40;
      sub.forEach(function (ln) { ctx.fillText(ln, 84, yy); yy += 56; });
      if (name) { ctx.font = "italic 500 64px Fraunces, Georgia, serif"; ctx.fillStyle = C.cream; ctx.fillText("— " + name, 84, H - 250); }
      ctx.strokeStyle = "rgba(251,243,228,.3)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(84, H - 170); ctx.lineTo(W - 84, H - 170); ctx.stroke();
      ctx.fillStyle = C.cream; ctx.font = "700 34px Figtree, sans-serif"; ctx.fillText("leuklogic.com", 84, H - 108);
      ctx.fillStyle = C.mist; ctx.font = "500 22px Figtree, sans-serif"; ctx.textAlign = "right"; ctx.fillText("Art: AI-generated", W - 84, H - 108); ctx.textAlign = "left";
    });
  }

  function toBlob(canvas) { return new Promise(function (res) { canvas.toBlob(res, "image/png"); }); }

  window.AbundanceCard = { CHORES: CHORES, TIMES: TIMES, encode: encode, decode: decode, cleanName: cleanName, render: render, renderPledge: renderPledge, toBlob: toBlob, ready: ready };
})();

/* Abundance for All: shared page behaviour. Vanilla JS, no dependencies, no network calls. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nav = document.querySelector(".nav"), prog = document.getElementById("prog");
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || 0, max = document.documentElement.scrollHeight - innerHeight;
      if (nav) nav.classList.toggle("solid", y > 24);
      if (prog && max > 0) prog.style.transform = "scaleX(" + Math.min(1, y / max).toFixed(4) + ")";
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();

  // reveal on scroll
  var els = [].slice.call(document.querySelectorAll(".rv, .tile, .xcard"));
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(function (el) { el.classList.add("in"); });

  // sharing helpers (plain links, no SDKs)
  var S = window.AbundanceShare = {
    x: function (text, url) { return "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url); },
    fb: function (url) { return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url); },
    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return new Promise(function (res, rej) {
        var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
        document.body.appendChild(t); t.select(); try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); } document.body.removeChild(t);
      });
    },
    // Web Share with a file where supported; returns "shared" | "cancelled" | "unsupported"
    shareFile: function (blob, name, text, url) {
      try {
        var f = new File([blob], name, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          return navigator.share({ files: [f], title: "Abundance for All", text: text, url: url }).then(function () { return "shared"; }, function (e) { return e && e.name === "AbortError" ? "cancelled" : "unsupported"; });
        }
      } catch (e) { /* fall through */ }
      return Promise.resolve("unsupported");
    },
    download: function (blob, name) {
      var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 2000);
    }
  };
})();

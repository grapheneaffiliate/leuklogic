/* /needs/: accessible tabs over the six needs. Without JS every panel is simply shown, stacked. */
(function () {
  "use strict";
  var list = document.querySelector(".tablist"); if (!list) return;
  var tabs = [].slice.call(list.querySelectorAll('[role="tab"]')), panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
  document.querySelector(".xlayout").classList.add("tabs-on");
  function select(i, focus, push) {
    tabs.forEach(function (t, j) { var on = i === j; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; if (on) panels[j].classList.add("in"); });
    if (focus) tabs[i].focus();
    if (push) { try { history.replaceState(null, "", "#" + tabs[i].id.replace("tab-", "")); } catch (e) { /* ignore */ } }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(i, false, true); });
    t.addEventListener("keydown", function (e) {
      var k = e.key, n = tabs.length, j = null;
      if (k === "ArrowDown" || k === "ArrowRight") j = (i + 1) % n; else if (k === "ArrowUp" || k === "ArrowLeft") j = (i + n - 1) % n;
      else if (k === "Home") j = 0; else if (k === "End") j = n - 1;
      if (j !== null) { e.preventDefault(); select(j, true, true); }
    });
  });
  var h = location.hash.replace("#", ""), start = tabs.map(function (t) { return t.id.replace("tab-", ""); }).indexOf(h);
  select(start >= 0 ? start : 0, false, false);
  addEventListener("hashchange", function () { var k = tabs.map(function (t) { return t.id.replace("tab-", ""); }).indexOf(location.hash.replace("#", "")); if (k >= 0) select(k, false, false); });
})();

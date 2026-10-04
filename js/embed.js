/* /embed/: copy the iframe snippet. */
(function () {
  "use strict";
  var b = document.getElementById("copy-snip"), s = document.getElementById("snippet"), st = document.getElementById("copy-status");
  if (!b) return;
  b.addEventListener("click", function () {
    window.AbundanceShare.copy(s.textContent).then(function () { st.textContent = "Copied."; }, function () { st.textContent = "Select the text and copy it by hand."; });
  });
})();

// PATTY MELT — NOTHING STORED ON A PLAIN WEB VISIT (studio rule, 1125). Load FIRST on every live page.
// On a web host (not file://, localhost, 127.0.0.1) without ?save=on, `localStorage` (and sessionStorage) become an in-memory
// stand-in for this tab: every page keeps working (ranks, receipts, mute, rail, the MeltDome counter, high scores), and
// nothing lands on the visitor's machine. Studio launchers (localhost / file://) keep their saves. ?save=on opts a web visit in.
(function (root) {
  "use strict";
  if (!root.location) return;
  const L = root.location, h = L.hostname || "", local = L.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "";
  const Q = new URLSearchParams(L.search || "");
  const forceMem = Q.get("save") === "off";            // QA: prove the stand-in on a studio host
  if ((local && !forceMem) || Q.get("save") === "on") { root.PM_NOSTORE = false; return; }
  function mem() {
    const m = new Map();
    return { get length() { return m.size; }, key: (i) => Array.from(m.keys())[i] ?? null,
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: (k) => { m.delete(String(k)); }, clear: () => m.clear() };
  }
  for (const name of ["localStorage", "sessionStorage"]) {
    try { Object.defineProperty(root, name, { value: mem(), configurable: true, enumerable: true, writable: false }); } catch (e) {}
  }
  root.PM_NOSTORE = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

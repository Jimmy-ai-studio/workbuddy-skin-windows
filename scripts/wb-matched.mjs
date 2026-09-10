// Show every CSS rule matching a selector, in cascade order, via CDP.
// Usage: node wb-matched.mjs <port> "<css selector>" [property]
const port = Number(process.argv[2] ?? 9342);
const sel = process.argv[3];
const prop = process.argv[4] ?? "background";
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const t = list.find((x) => x.type === "page" && x.url.includes("renderer/index.html"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const myId = ++id;
  const h = (e) => { const m = JSON.parse(e.data); if (m.id === myId) { ws.removeEventListener("message", h); resolve(m.result); } };
  ws.addEventListener("message", h);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
await send("DOM.enable"); await send("CSS.enable");
const doc = await send("DOM.getDocument", { depth: -1 });
const node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: sel });
if (!node.nodeId) { console.error("selector not found: " + sel); process.exit(66); }
const m = await send("CSS.getMatchedStylesForNode", { nodeId: node.nodeId });
const clean = (v) => (v || "").replace(/local-file:[^)"]+/g, "<file>").replace(/data:[^)"]{20,}/g, "<data>").slice(0, 70);
console.log("=== inline ===");
console.log(clean(m.inlineStyle?.cssText) || "(none)");
console.log("\n=== matched rules (cascade order, later = higher priority) ===");
for (const e of m.matchedCSSRules || []) {
  const r = e.rule;
  const props = (r.style?.cssProperties || []).filter((p) => p.name.startsWith(prop));
  if (!props.length) continue;
  const origin = r.origin + (r.styleSheetId ? "" : "");
  console.log(`\n[${origin}] ${r.selectorList.text.slice(0, 80)}`);
  for (const p of props) console.log(`    ${p.name}: ${clean(p.value)}${p.important ? " !important" : ""}${p.disabled ? " (disabled)" : ""}`);
}
ws.close();

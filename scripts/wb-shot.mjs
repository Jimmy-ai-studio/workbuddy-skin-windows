// Screenshot the WorkBuddy renderer over CDP.
// Usage: node wb-shot.mjs <port> <outFile>
import { writeFileSync } from "node:fs";
const port = Number(process.argv[2] ?? 9342);
const out = process.argv[3] ?? "shot.png";
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === "page" && t.url.includes("renderer/index.html"));
if (!target) { console.error("no renderer target"); process.exit(69); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const send = (id, method, params = {}) => new Promise((resolve) => {
  const h = (e) => { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener("message", h); resolve(m); } };
  ws.addEventListener("message", h);
  ws.send(JSON.stringify({ id, method, params }));
});
await send(1, "Page.enable");
const shot = await send(2, "Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
ws.close();
if (!shot.result?.data) { console.error("capture failed:", JSON.stringify(shot).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(`saved ${out} (${(Buffer.from(shot.result.data, "base64").length / 1024).toFixed(0)} KB)`);

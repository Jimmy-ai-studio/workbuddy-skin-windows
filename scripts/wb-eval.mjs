// Evaluate JS inside the WorkBuddy renderer over CDP. Diagnostic tool.
// Usage: node wb-eval.mjs <port> "<expression>"
const port = Number(process.argv[2] ?? 9342);
const expression = process.argv[3];
if (!expression) { console.error('usage: node wb-eval.mjs <port> "<expr>"'); process.exit(64); }

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === "page" && t.url.includes("renderer/index.html"));
if (!target) { console.error("no renderer target"); process.exit(69); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const result = await new Promise((resolve, reject) => {
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) resolve(m); };
  ws.onerror = reject;
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
    params: { expression, returnByValue: true, awaitPromise: true } }));
});
ws.close();
const r = result.result?.result;
if (result.result?.exceptionDetails) { console.error("EXCEPTION:", JSON.stringify(result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails, null, 2)); process.exit(1); }
console.log(typeof r?.value === "string" ? r.value : JSON.stringify(r?.value, null, 2));

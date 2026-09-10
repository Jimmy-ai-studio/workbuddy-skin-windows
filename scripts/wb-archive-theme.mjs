// Archive the user's uploaded theme from localStorage onto disk.
//
// The theme menu stores an uploaded photo in localStorage under
// `heigeCodexCustomTheme` -- a single slot. It survives restarts, but uploading
// a second picture overwrites the first one permanently.
//
// This reads that slot over CDP and writes it out as a normal on-disk theme
// (<themesDir>/custom-<hash>/{theme.json,hero.webp}), so uploads accumulate
// instead of replacing each other, and can be backed up or copied elsewhere.
// Content-hashed, so re-running is a no-op for an already-archived image.
//
// --watch runs it as a background daemon: it polls a cheap fingerprint
// (length + tail of the stored string, a few dozen bytes) every few seconds and
// only pulls the full ~350KB payload when that changes. It exits on its own once
// WorkBuddy is gone, so nothing is left running.
//
// Usage:
//   node wb-archive-theme.mjs <themesDir> [--port 9342]            one shot
//   node wb-archive-theme.mjs <themesDir> [--port 9342] --watch    daemon
import { createHash } from "node:crypto";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const themesDir = process.argv[2];
if (!themesDir) { console.error("usage: node wb-archive-theme.mjs <themesDir> [--port N] [--watch]"); process.exit(64); }
const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 9342;
const watch = process.argv.includes("--watch");

const POLL_MS = 4000;
const MAX_MISSES = 4;   // ~16s of no renderer -> WorkBuddy is gone, exit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(4000) })).json();
  const page = list.find((t) => t.type === "page" && t.url.includes("renderer/index.html"));
  if (!page) throw new Error("no renderer");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("ws timeout")), 5000); });
    const out = await new Promise((res, rej) => {
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) res(m); };
      ws.onerror = rej;
      setTimeout(() => rej(new Error("eval timeout")), 8000);
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    return out.result?.result?.value ?? null;
  } finally { try { ws.close(); } catch {} }
}

// cheap change detector: never pulls the image itself
const fingerprint = () => evaluate(
  '(() => { const v = localStorage.getItem("heigeCodexCustomTheme"); return v ? v.length + ":" + v.slice(-48) : ""; })()'
);
const payload = () => evaluate('localStorage.getItem("heigeCodexCustomTheme")');

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(watch ? `[${t}] ${msg}` : msg);
}

async function archiveOnce() {
  const raw = await payload();
  if (!raw) { log("archive: nothing uploaded yet"); return null; }

  let theme;
  try { theme = JSON.parse(raw); } catch { log("archive: slot is not valid JSON"); return null; }
  const dataUrl = theme?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) { log("archive: no image in slot"); return null; }

  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(dataUrl);
  if (!m) { log("archive: unsupported image format"); return null; }
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const bytes = Buffer.from(m[2], "base64");
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const id = `custom-${hash}`;
  const dest = join(themesDir, id);

  if (existsSync(join(dest, `hero.${ext}`))) { log(`archive: ${id} already saved`); return id; }

  const colors = theme.colors ?? {};
  const surface = /^#([0-9a-f]{6})$/i.exec(colors.surface ?? "");
  let appearance = theme.appearance;
  if (appearance !== "light" && appearance !== "dark") {
    if (surface) {
      const n = parseInt(surface[1], 16);
      const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
      appearance = lum < 128 ? "dark" : "light";
    } else appearance = "dark";
  }

  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, `hero.${ext}`), bytes);
  await writeFile(join(dest, "theme.json"), JSON.stringify({
    schemaVersion: 1,
    id,
    name: theme.name || `我的主题 ${hash}`,
    hero: `hero.${ext}`,
    appearance,
    previewFocus: { x: 50, y: 30 },
    thumbnailFocus: { x: 50, y: 40 },
    thumbnailZoom: 100,
    colors: {
      accent: colors.accent ?? "#4f8ef7",
      secondary: colors.secondary ?? "#8e7cc3",
      surface: colors.surface ?? "#101018",
      text: colors.text ?? "#e8ecf5",
    },
  }, null, 2) + "\n", "utf8");

  const count = (await readdir(themesDir, { withFileTypes: true })).filter((d) => d.isDirectory()).length;
  log(`archive: saved "${theme.name || id}" -> ${id} (${Math.round(bytes.length / 1024)} KB), ${count} theme(s) on disk`);
  return id;
}

if (!watch) {
  try { await archiveOnce(); }
  catch { log("archive: could not reach the renderer, skipped"); }
  process.exit(0);
}

// ---- watch mode ----
log(`watching WorkBuddy on port ${port}, archiving uploads to ${themesDir}`);
let last = null;
let misses = 0;
try { last = await fingerprint(); await archiveOnce(); } catch { /* first poll may race the renderer */ }

for (;;) {
  await sleep(POLL_MS);
  let sig;
  try { sig = await fingerprint(); misses = 0; }
  catch {
    if (++misses >= MAX_MISSES) { log("WorkBuddy is gone, exiting"); process.exit(0); }
    continue;
  }
  if (sig === last) continue;
  last = sig;
  if (!sig) continue;                       // slot cleared
  try { await archiveOnce(); } catch { /* try again next tick */ }
}

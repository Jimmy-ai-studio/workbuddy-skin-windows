// Direct WorkBuddy skin injector for Windows.
//
// Why this exists: upstream's Windows runtime layer (src/windows-runtime.mjs) is
// Codex-only -- it never imports products.mjs and hardcodes
//   Get-CimInstance -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'"
//   Resolve-CodexApp
// so `cli.mjs apply --app workbuddy` dies during process discovery on Windows.
// That is what `windowsVerified: false` in products.mjs actually means.
//
// The engine itself is product-agnostic: applySkin() takes a `product` and picks
// buildCss via skinProfile(). So we skip the Codex-only discovery and drive
// applySkin() straight over the already-open CDP port.
//
// Usage:
//   node wb-inject.mjs <repoRoot> [themeId] [--port 9342] [--check] [--prefer-stored]
//
// --prefer-stored keeps whatever the user last picked in the theme menu -- including
// a photo they uploaded via "+ 自定义图片", which lives in localStorage under
// heigeCodexCustomTheme and survives restarts. Without it every run forces themeId
// back on them.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const repoRoot = args[0];
if (!repoRoot) { console.error("usage: node wb-inject.mjs <repoRoot> [themeId] [--port N] [--check]"); process.exit(64); }
const positional = args.slice(1).filter((a) => !a.startsWith("--"));
const themeId = positional[0] ?? "saint-gold";
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 9342;
const checkOnly = args.includes("--check");
const preferStored = args.includes("--prefer-stored");

const src = (f) => pathToFileURL(join(repoRoot, "src", f)).href;
const { applySkin } = await import(src("injector.mjs"));
const { listThemes } = await import(src("theme-store.mjs"));
const { loadTheme } = await import(src("theme-schema.mjs"));

// --- 1. is the CDP port actually open? ---
async function probe() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
const version = await probe();
if (!version) {
  console.error(`✗ no CDP endpoint on 127.0.0.1:${port}`);
  console.error(`  WorkBuddy must be started with WORKBUDDY_REMOTE_DEBUGGING_PORT=${port}.`);
  console.error(`  Chromium only accepts the debug port at launch, so WorkBuddy needs a restart.`);
  process.exit(69);
}
console.log(`✓ CDP endpoint alive: ${version.Browser ?? "unknown"}`);
if (checkOnly) process.exit(0);

// --- read what the user last picked, so we do not stomp on it ---
async function readSelected() {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === "page" && t.url.includes("renderer/index.html"));
    if (!page) return null;
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const res = await new Promise((resolve) => {
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) resolve(m); };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: {
        expression: 'localStorage.getItem("heigeCodexSkinSelected")', returnByValue: true } }));
    });
    ws.close();
    return res.result?.result?.value ?? null;
  } catch { return null; }
}

// --- 2. load themes from both roots (bundled + user) ---
const userThemesRoot = join(process.env.APPDATA, "HeiGeCodexSkinStudio", "themes");
const roots = [join(repoRoot, "themes"), userThemesRoot];
const themes = await listThemes({ roots });
const selected = themes.find((t) => t.id === themeId);
if (!selected) {
  console.error(`✗ theme not found: ${themeId}`);
  console.error(`  available: ${themes.map((t) => t.id).join(", ")}`);
  process.exit(66);
}
console.log(`✓ theme: ${selected.name} (${selected.id})${preferStored ? " [fallback; keeping user's last pick]" : ""}`);

const loadedTheme = await loadTheme(selected.path);
const menuThemes = [];
for (const t of themes) { try { menuThemes.push(await loadTheme(t.path)); } catch {} }

const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));

// The menu only honours preferStored when activeId is null (see skin-menu.mjs:
// "正式主题始终服从 controller 的 activeId"). So resolve the user's last pick first.
let activeId = selected.id;
if (preferStored) {
  const stored = await readSelected();
  if (stored === "custom-upload") {
    activeId = null;                       // let the menu restore their uploaded photo
    console.log("✓ keeping user's uploaded image (custom-upload)");
  } else if (stored && themes.some((t) => t.id === stored)) {
    activeId = stored;                     // keep whichever theme they had picked
    console.log(`✓ keeping user's pick: ${stored}`);
  } else {
    console.log(`✓ no stored pick, falling back to ${selected.id}`);
  }
}

// --- 3. inject ---
await applySkin({
  loadedTheme,
  themes: menuThemes,
  activeId,
  port,
  currentVersion: pkg.version,
  preferStored,
  product: "workbuddy",
});
console.log(`✓ injected into WorkBuddy on port ${port}`);

// Teach target-classifier.mjs the Windows WorkBuddy renderer path.
//
// Upstream hardcodes the macOS .app bundle layout:
//   /WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html
// On Windows the renderer lives at:
//   /<drive>:/<install dir>/WorkBuddy/resources/app.asar/renderer/index.html
// so the suffix check never matches and every target is classified "unknown"
// -> NO_MAIN_RENDERER.
//
// This keeps the original security properties: file: protocol only, no host/
// credentials/port, decoded pathname, ".." rejected, suffix (not substring) match.
//
// Usage: node patch-win-renderer.mjs <repoRoot> [--undo]
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const undo = process.argv.includes("--undo");
if (!root) { console.error("usage: node patch-win-renderer.mjs <repoRoot> [--undo]"); process.exit(64); }

const file = join(root, "src", "target-classifier.mjs");
const backup = file + ".orig";
if (!existsSync(file)) { console.error("not found: " + file); process.exit(66); }

if (undo) {
  if (!existsSync(backup)) { console.error("no backup to restore"); process.exit(66); }
  copyFileSync(backup, file);
  console.log("restored from " + backup);
  process.exit(0);
}

if (!existsSync(backup)) { copyFileSync(file, backup); console.log("backup -> " + backup); }
let src = readFileSync(file, "utf8");

if (src.includes("WORKBUDDY_MAIN_SUFFIXES")) { console.log("already patched"); process.exit(0); }

const declOld = 'const WORKBUDDY_MAIN_SUFFIX = "/WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html";';
const declNew = [
  'const WORKBUDDY_MAIN_SUFFIXES = [',
  '  // macOS bundle layout (upstream, verified on 5.3.11)',
  '  "/WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html",',
  '  // Windows install layout, e.g. E:/Program Files/WorkBuddy/resources/...',
  '  "/WorkBuddy/resources/app.asar/renderer/index.html",',
  '];',
].join("\n");

const checkOld = '!pathname.endsWith(WORKBUDDY_MAIN_SUFFIX)';
const checkNew = '!WORKBUDDY_MAIN_SUFFIXES.some((suffix) => pathname.endsWith(suffix))';

for (const [needle, label] of [[declOld, "declaration"], [checkOld, "suffix check"]]) {
  if (!src.includes(needle)) { console.error(`pattern not found (${label}) - upstream changed`); process.exit(65); }
}

src = src.replace(declOld, declNew).replace(checkOld, checkNew);
writeFileSync(file, src, "utf8");
console.log("patched: WorkBuddy renderer allowlist now accepts the Windows layout");

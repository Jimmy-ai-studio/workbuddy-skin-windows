// Make the skin survive WorkBuddy 5.5.x's native "appearance" themes.
//
// Two separate breakages, both found on WorkBuddy 5.5.3 (Windows):
//
// 1. Renamed container. Upstream neutralises the home surface as
//      .wb-home-page, .wb-home-page__main-content { background: transparent }
//    but 5.5.x renamed it to `.wb-home-route`, so those rules no longer match.
//
// 2. Specificity. The native theme (e.g. "涟漪 / Ripple", theme-tkbdzr) injects
//      :root .wb-home-route { background-color: #f5f9ff !important;
//                             background-image: var(--wb-home-bg-fallback) !important }
//    That selector is (0,2,0). A plain `.wb-home-route` is (0,1,0) and loses even
//    with !important, so we go to `:root:root` -> (0,3,0) and also blank the
//    fallback variable the native theme paints through.
//
// Usage: node patch-wb55.mjs <repoRoot> [--undo]
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const undo = process.argv.includes("--undo");
if (!root) { console.error("usage: node patch-wb55.mjs <repoRoot> [--undo]"); process.exit(64); }

const file = join(root, "src", "skin-css-workbuddy.mjs");
const backup = file + ".orig";
if (!existsSync(file)) { console.error("not found: " + file); process.exit(66); }
if (undo) {
  if (!existsSync(backup)) { console.error("no backup to restore"); process.exit(66); }
  copyFileSync(backup, file); console.log("restored from " + backup); process.exit(0);
}
if (!existsSync(backup)) { copyFileSync(file, backup); console.log("backup -> " + backup); }

let src = readFileSync(file, "utf8");
const MARK = "wb55-route-v2";
if (src.includes(MARK)) { console.log("already patched"); process.exit(0); }

const CSS = [
  "",
  "/* ---- wb55-route-v2: survive WorkBuddy 5.5.x native appearance themes ---- */",
  "/* 5.5.x 把 .wb-home-page 改名为 .wb-home-route，上游的透明规则全部失配；",
  "   而原生主题注入的是 :root .wb-home-route {...!important}，特异性 (0,2,0)，",
  "   单类选择器 (0,1,0) 即便带 !important 也压不过，所以提到 :root:root (0,3,0)。 */",
  ":root:root .wb-home-route,",
  ":root:root .wb-home-route__main-content,",
  ":root:root .wb-home-route__content {",
  "  background: transparent !important;",
  "}",
  "/* 釜底抽薪：原生主题的底图从这个变量取 */",
  ":root {",
  "  --wb-home-bg-fallback: none !important;",
  "}",
  "/* 原生主题（如 theme-tkbdzr「涟漪」）铺的循环视频层 */",
  ":root:root .wb-home-route__bg-video {",
  "  display: none !important;",
  "}",
  "",
].join("\n");

const anchor = "`;";
const idx = src.lastIndexOf(anchor);
if (idx < 0) { console.error("template tail not found"); process.exit(65); }
src = src.slice(0, idx) + "\n" + CSS + anchor + src.slice(idx + anchor.length);
writeFileSync(file, src, "utf8");
console.log("patched: wb55-route-v2 (high specificity)");

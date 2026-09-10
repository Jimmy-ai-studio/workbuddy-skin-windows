// Add a CSS animation layer to the WorkBuddy skin.
//
// Two counter-phase motions, both GPU-friendly (opacity/transform only):
//   heigeGlow  (::after, 4.5s)  warm-white highlight breathing over the character
//   heigeStars (::before, 3.2s) three star points pulsing in the dark sky, inverted
//
// Design notes, learned the hard way on this theme:
//
//  * Tinting with var(--heige-accent) is invisible on a same-hue hero -- a gold glow
//    over gold armour adds nothing. `mix-blend-mode: screen` with a warm-white core
//    brightens instead of tinting, so it reads on any hero.
//  * `screen` saturates fast in already-bright areas, so the highlight alone looked
//    static. The counter-phase starfield sits in the dark sky where screen has the
//    most headroom, which is what makes the motion actually legible.
//  * There is no background-position drift here on purpose. Upstream sets
//    `#root { background: ... !important }`, and CSS animations cannot override an
//    !important declaration, so any keyframe touching background-position is dead
//    code. Animate the pseudo-elements instead.
//
// Respects prefers-reduced-motion. Reversible: --undo restores the .orig backup.
//
// Usage: node patch-anim.mjs <repoRoot> [--undo]
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const undo = process.argv.includes("--undo");
if (!root) { console.error("usage: node patch-anim.mjs <repoRoot> [--undo]"); process.exit(64); }

const file = join(root, "src", "skin-css-workbuddy.mjs");
const backup = file + ".orig";
if (!existsSync(file)) { console.error("not found: " + file); process.exit(66); }
if (undo) {
  if (!existsSync(backup)) { console.error("no backup to restore"); process.exit(66); }
  copyFileSync(backup, file); console.log("restored from " + backup); process.exit(0);
}
if (!existsSync(backup)) { copyFileSync(file, backup); console.log("backup -> " + backup); }

let src = readFileSync(file, "utf8");
const MARK = "heige-anim-v3";
if (src.includes(MARK)) { console.log("already patched"); process.exit(0); }

const ANIM = [
  "",
  "/* ---- heige-anim-v3: motion layer ---- */",
  "/* 小宇宙：暖白高光走 screen 混合，提亮而非染色 */",
  "#root::after {",
  "  content: \"\";",
  "  position: fixed;",
  "  inset: 0;",
  "  pointer-events: none;",
  "  z-index: 0;",
  "  mix-blend-mode: screen;",
  "  background: radial-gradient(32% 36% at 82% 36%,",
  "    rgba(255, 248, 224, 0.78) 0%,",
  "    rgba(255, 224, 140, 0.34) 42%,",
  "    transparent 70%);",
  "  animation: heigeGlow 4.5s ease-in-out infinite;",
  "  will-change: opacity, transform;",
  "}",
  "@keyframes heigeGlow {",
  "  0%, 100% { opacity: .12; transform: scale(1); }",
  "  50%      { opacity: 1;   transform: scale(1.07); }",
  "}",
  "/* 星辉：暗部星点反相脉动。screen 在暗区余量最大，动态感主要靠这层 */",
  "#root::before {",
  "  content: \"\";",
  "  position: fixed;",
  "  inset: 0;",
  "  pointer-events: none;",
  "  z-index: 0;",
  "  mix-blend-mode: screen;",
  "  background:",
  "    radial-gradient(7% 9% at 62% 20%, rgba(190, 235, 255, 0.85) 0%, transparent 68%),",
  "    radial-gradient(5% 7% at 71% 12%, rgba(255, 255, 255, 0.80) 0%, transparent 66%),",
  "    radial-gradient(6% 8% at 55% 30%, rgba(255, 236, 190, 0.70) 0%, transparent 68%);",
  "  animation: heigeStars 3.2s ease-in-out infinite;",
  "  will-change: opacity;",
  "}",
  "@keyframes heigeStars {",
  "  0%, 100% { opacity: 1; }",
  "  50%      { opacity: .15; }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  #root::before, #root::after { animation: none !important; }",
  "}",
  "",
].join("\n");

const anchor = "`}`;";
const idx = src.lastIndexOf(anchor);
if (idx < 0) { console.error("template tail not found - upstream changed"); process.exit(65); }
src = src.slice(0, idx) + "`}\n" + ANIM + "`;" + src.slice(idx + anchor.length);
writeFileSync(file, src, "utf8");
console.log("patched: heige-anim-v3 (screen glow + counter-phase starfield)");

// Toggle WorkBuddy hero background between `cover` (upstream default) and `contain`.
// `cover`  : fills the window, crops the image  -> tall portraits get their head/feet cut
// `contain`: whole image, right-aligned, no distortion -> character sits on the right
// Usage: node patch-hero-fit.mjs <repoRoot> [contain|cover]
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const mode = (process.argv[3] || "contain").toLowerCase();
if (!root) { console.error("usage: node patch-hero-fit.mjs <repoRoot> [contain|cover]"); process.exit(64); }
if (!["contain", "cover"].includes(mode)) { console.error("mode must be contain or cover"); process.exit(64); }

const file = join(root, "src", "skin-css-workbuddy.mjs");
if (!existsSync(file)) { console.error("not found: " + file); process.exit(66); }

const backup = file + ".orig";
if (!existsSync(backup)) { copyFileSync(file, backup); console.log("backup -> " + backup); }

const src = readFileSync(file, "utf8");
const re = /(url\(\$\{JSON\.stringify\(heroDataUrl\)\}\) right center \/ )(cover|contain)( no-repeat)/;
const m = src.match(re);
if (!m) { console.error("hero background pattern not found - upstream may have changed"); process.exit(65); }

if (m[2] === mode) { console.log(`already \`${mode}\` - nothing to do`); process.exit(0); }
writeFileSync(file, src.replace(re, `$1${mode}$3`), "utf8");
console.log(`hero fit: ${m[2]} -> ${mode}`);

# workbuddy-skin-windows

在 **Windows** 上给腾讯 WorkBuddy 换肤的适配层。

[![latest release](https://img.shields.io/github/v/release/Jimmy-ai-studio/workbuddy-skin-windows?label=%E4%B8%8B%E8%BD%BD&style=for-the-badge)](https://github.com/Jimmy-ai-studio/workbuddy-skin-windows/releases/latest)
[![downloads](https://img.shields.io/github/downloads/Jimmy-ai-studio/workbuddy-skin-windows/total?style=for-the-badge)](https://github.com/Jimmy-ai-studio/workbuddy-skin-windows/releases)
[![license](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

## 📦 不懂代码？点这里下载即用

**[→ 前往下载页（Releases）](https://github.com/Jimmy-ai-studio/workbuddy-skin-windows/releases/latest)**，下载 `WorkBuddy-Skin-Windows-v1.0.0.zip`（34MB）。

**三步搞定，不需要安装任何东西**（Node.js 已内置在包里）：

1. 解压 zip
2. 先打开 WorkBuddy，把手头的活存一下
3. 双击 **`一键换肤.bat`** → 看到「按一下键盘」时按一下 → 等它跑完

不想要了：双击 `恢复原样.bat`，或直接把 WorkBuddy 关掉再正常打开。

**你上传的图会自动保存。** WorkBuddy 的「我的主题」只有一个槽位，传第二张图第一张就没了；
换肤后会在后台盯着这个槽位，你每传一张新图，几秒内就自动存成一个独立主题，
之后都能在「内置主题」列表里切回去。主题都放在 `mythemes\`，整个文件夹复制走就是备份。

> ⚠️ 两件必须知道的事：**每次重启 WorkBuddy 都要重新双击一次**（皮肤是内存里的，不支持常驻）；
> **用完请把 WorkBuddy 关掉再正常打开一次**，这会关闭换肤期间开启的调试端口。详见下方[安全须知](#-安全须知请务必读完)。

下面的内容是给开发者看的。

> ## 这不是一个换肤工具
>
> 真正做换肤的是 **[HeiGeAi/heige-codex-skin-studio](https://github.com/HeiGeAi/heige-codex-skin-studio)**（MIT）。
> CSS 生成、CDP 注入、主题菜单、图片取色——全部是它的实现，本仓库一行都没有重写。
>
> 本仓库只做两件事：**补上它缺失的 Windows 驱动层**，以及**修复 WorkBuddy 5.5.x 的版本漂移**。
> 代码量对比：上游 `src/` 约 32,000 行，本仓库约 600 行 + 74 行补丁。
>
> 如果你用 macOS，**请直接用上游**，不需要这个仓库。

---

## 它解决什么问题

上游同时支持 OpenAI Codex Desktop 和腾讯 WorkBuddy，但 WorkBuddy 那条线只在 **macOS** 上做过真机验证
（`products.mjs` 里标着 `windowsVerified: 未在真机验证`）。在 Windows 上会连续撞到几堵墙：

| # | 问题 | 本仓库的处理 |
|---|---|---|
| 1 | `windows-runtime.mjs` 从不 import `products.mjs`，PowerShell 快照写死 `Name='ChatGPT.exe' OR Name='Codex.exe'` | `scripts/wb-inject.mjs` 绕过该发现层，直连 CDP 驱动 `applySkin()` |
| 2 | WorkBuddy 靠环境变量 `WORKBUDDY_REMOTE_DEBUGGING_PORT` 开调试端口，且只能在启动时生效 | `scripts/relaunch-with-skin.ps1` 带变量重启并等待端口 |
| 3 | `target-classifier.mjs` 硬编码 macOS bundle 路径 `/WorkBuddy.app/Contents/Resources/...`，Windows 的 renderer 一律判为 `unknown` → `NO_MAIN_RENDERER` | `patches/patch-win-renderer.mjs` 增加 Windows 路径形态，保留全部安全校验 |
| 4 | 内联超大图片：2.6MB PNG 转 base64 后约 3.6MB，超出 Chromium 单条 CSS 声明上限，**整条 `background` 被静默丢弃**（样式表照常解析、`installed: true` 照常返回） | 压到 400KB 以内即可；官方「+ 自定义图片」入口会自动压成 WebP 0.8，不受影响 |
| — | 上传的图只存在 localStorage 单槽位，传第二张会永久覆盖第一张 | `wb-archive-theme.mjs --watch` 后台监听槽位指纹，变化即落盘为独立主题 |
| 5 | WorkBuddy 5.5.x 把 `.wb-home-page` 改名为 `.wb-home-route`，上游透明规则全部失配；且原生外观主题注入 `:root .wb-home-route {...!important}`（特异性 0,2,0），压过单类选择器 | `patches/patch-wb55.mjs` 提升到 `:root:root`（0,3,0）并置空 `--wb-home-bg-fallback` |

第 4、5 条**与平台无关**——macOS 上换一张 2.6MB 的图同样会静默失败，5.5.x 的类名变更同样会让原生主题盖住皮肤。

详细排查过程见 [docs/five-walls.md](docs/five-walls.md)。

---

## 快速开始（开发者）

> 只想用、不想折腾的，请直接下载 [Release 包](https://github.com/Jimmy-ai-studio/workbuddy-skin-windows/releases/latest)，
> 里面已包含 Node.js 与打好补丁的上游源码。

**前置条件**

- Windows 10/11
- WorkBuddy（本仓库验证于 **5.5.3**）
- [Node.js 22+](https://nodejs.org/)（上游 `assertNodeVersion()` 强制要求）

**步骤**

```powershell
# 1. 克隆本仓库
git clone https://github.com/Jimmy-ai-studio/workbuddy-skin-windows
cd workbuddy-skin-windows

# 2. 把上游源码放到仓库根目录，目录名保持 heige-codex-skin-studio-main
#    （从 https://github.com/HeiGeAi/heige-codex-skin-studio 下载 zip 解压）

# 3. 打补丁
node patches\patch-win-renderer.mjs heige-codex-skin-studio-main
node patches\patch-wb55.mjs         heige-codex-skin-studio-main
node patches\patch-anim.mjs         heige-codex-skin-studio-main   # 可选：呼吸光晕动画

# 4. 换肤（会重启 WorkBuddy）
.\scripts\relaunch-with-skin.ps1
```

或者双击 `一键换肤.bat`。恢复原样：双击 `恢复原样.bat`，或直接正常重启 WorkBuddy。

所有补丁都会自动备份 `.orig`，`--undo` 可还原。

---

## 做自己的主题

**推荐**：换肤成功后点顶部「主题」→「+ 自定义图片」，选一张图即可。
上传的图会自动缩放、压成 WebP 0.8、自动取色，存在 `localStorage` 里，**重启后仍在**。

**手写**：一个目录两个文件，放进 `%APPDATA%\HeiGeCodexSkinStudio\themes\<id>\`

```
themes/<id>/
  theme.json
  hero.jpg      # 横图，1920x1080 左右；压到 400KB 以内
```

字段见 `themes/example/theme.json`。手写的好处是能定 `copy.brand` / `copy.headline`（界面上的品牌文案），官方上传入口没有这两项。

> **注意**：手写这条路**绕过了官方的图片压缩流水线**，第 4 条那个坑就在这里等着。

---

## ⚠️ 安全须知（请务必读完）

换肤的原理是**打开 WorkBuddy 的 Chrome DevTools Protocol 调试端口**（默认 9342），
再通过它注入 CSS。上游 `SECURITY.md` 自己写明：

> CDP 即使只绑定本机回环也无认证机制，本机同权限进程在威胁边界内。

也就是说，**端口开着的时候，本机上任何以你身份运行的进程都能完全控制 WorkBuddy 的渲染进程**。
而 WorkBuddy 能读写本地文件、执行 shell 命令、接收微信远程指令、并绑定微信支付 AI 专属卡。

因此：

- 本仓库脚本**只设置会话级环境变量，不写入用户环境变量**
- **不要**设成开机自启
- 用完之后**正常重启一次 WorkBuddy**（不带环境变量），端口即关闭
- 不要使用来路不明的第三方打包版

皮肤本身是纯内存的（`persistenceEnabled: false`，WorkBuddy 不支持常驻），重启即失效——
这既是限制，也意味着"关掉端口"和"卸掉皮肤"是同一个动作。

---

## 兼容性与保质期

| 项 | 验证环境 |
|---|---|
| WorkBuddy | 5.5.3 |
| 系统 | Windows 11 |
| Node | 22.23.2 |
| 上游 | heige-codex-skin-studio 5.5.16 |

**这类补丁的保质期以周计。** WorkBuddy 三个月内从 4.5.0 走到 5.5.3，一次类名重命名就废掉了上游半年前逆向出的选择器。
补丁脚本在锚点失配时会报 `upstream changed` 并拒绝执行，不会破坏源码，但**不保证在更新版本上仍然有效**。

---

## 版权

- 本仓库代码：MIT，见 [LICENSE](LICENSE)
- 换肤引擎：[HeiGeAi/heige-codex-skin-studio](https://github.com/HeiGeAi/heige-codex-skin-studio)，MIT
- **主题图片不在任何许可范围内**。上游 `ASSET_PROVENANCE.md` 明确声明 MIT 只覆盖代码，
  不授权角色、商标或第三方视觉素材。`themes/example/hero.jpg` 为程序生成的渐变图，可自由使用；
  **请勿分发包含受版权保护形象的主题包**。
- 与腾讯、WorkBuddy 官方无任何关联。本仓库不修改 WorkBuddy 的任何文件、二进制或签名。

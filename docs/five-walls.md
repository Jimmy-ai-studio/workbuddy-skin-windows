# 在 Windows 上跑通 WorkBuddy 换肤：五道墙

验证环境：WorkBuddy 5.5.3 / Windows 11 / Node 22.23.2 / heige-codex-skin-studio 5.5.16

上游把 WorkBuddy 支持标为 `windowsVerified: 未在真机验证`。这份文档记录那句话具体意味着什么，
以及每一道障碍是怎么定位的。**第 4、5 道与平台无关，macOS 上同样会中招。**

---

## 第一道：进程发现层写死了 Codex

**现象**　`cli.mjs doctor --app workbuddy` 直接抛错，报文里是一段 PowerShell 脚本。

**根因**　`src/windows-runtime.mjs` 从不 `import` `products.mjs`，它生成的快照脚本硬编码：

```powershell
Get-CimInstance -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'"
$app = Resolve-CodexApp
```

`products.mjs` 里 WorkBuddy 的 Windows 路径（`WorkBuddy.exe`）其实已经定义好了，
只是 Windows 这条链上没人读它。macOS 走的是另一套 zsh 脚本，所以 5.3.11 能验通。

**修复**　不走它的发现层。`applySkin()` 本身是产品无关的（通过 `skinProfile(product)` 取 `buildCss`），
只需要一个开着的 CDP 端口。`scripts/wb-inject.mjs` 直接驱动它。

---

## 第二道：调试端口只能在启动时开

**现象**　CDP 端口 9342 连不上。

**根因**　Chromium 只在进程启动时接受调试端口参数。而 WorkBuddy 用的是**环境变量**
`WORKBUDDY_REMOTE_DEBUGGING_PORT`（Codex 用的是命令行 flag，两者不同）。

**修复**　`scripts/relaunch-with-skin.ps1` 设好环境变量后重启 WorkBuddy，再轮询等端口就绪。
只设会话级变量，不写入用户环境变量——避免留下一个长期敞开的后门。

---

## 第三道：renderer 白名单只认 macOS 的 .app 结构

**现象**　CDP 连上了，target 也找到了，但被 skip，报 `NO_MAIN_RENDERER`：

```
reason: 页面 URL 不属于已审核的 WorkBuddy renderer
url:    file:///E:/Program%20Files/WorkBuddy/resources/app.asar/renderer/index.html?...
```

**根因**　`src/target-classifier.mjs`：

```js
const WORKBUDDY_MAIN_SUFFIX = "/WorkBuddy.app/Contents/Resources/app.asar/renderer/index.html";
```

Windows 的安装路径里没有 `WorkBuddy.app/Contents/Resources` 这一段，后缀匹配永远失败。
作者注释写着「真机核对自 WorkBuddy 5.3.11」——那是台 Mac。

**修复**　`patches/patch-win-renderer.mjs` 把单个后缀改成数组，加上 Windows 形态。
其余安全检查（`file:` 协议、无 host/凭据/端口、解码后比对 pathname、拒绝 `..`）**原样保留**。

---

## 第四道：超大 data URL 被静默丢弃

**现象**　注入返回成功，`installed: true`、`menu: true`、样式表解析出 34 条规则、无任何报错。
主题中心里能看到自己的主题、缩略图正常、也打了勾。**但界面纹丝不动。**

**定位**　`#root` 的 computed `background-image` 是 `none`。二分测试逐层排除：

| 测试 | 结果 |
|---|---|
| 单层 `linear-gradient` | 生效 |
| `color-mix()` + `var()` | 生效 |
| **短** data URL | 生效 |
| 多层 + 值中注释 | 生效 |
| 真实规则（3.6MB data URL） | **`none`** |

唯一变量是长度。

**根因**　2.6MB 的 PNG 内联成 base64 是 3,629,142 字符，超出 Chromium 单条 CSS 声明的长度上限，
**整条 `background` 简写连同三层渐变一起被丢弃**，回落到 `none`。全程不报错、不警告。

**修复**　压到 400KB 以内。压成 JPEG q85（387KB → base64 528,539 字符）后立刻生效。

**为什么上游文档没写**　官方「+ 自定义图片」入口会先用 canvas 按
`processedCanvasSide: 2048` / `processedCanvasPixels: 4,000,000` 缩放，再 `toDataURL("image/webp", 0.8)`。
走那条路的人永远撞不上。内置 12 套 hero 全是 webp、54KB~421KB，正是这条流水线的产物。
**手写 `theme.json` + 自己放图，绕过的就是这条流水线。**

---

## 第五道：5.5.x 改名 + 原生主题的特异性压制

**现象**　启用 WorkBuddy 自带的外观主题（如「涟漪 / Ripple」）时，自定义皮肤完全被盖住。

**根因（两个问题叠在一起）**

1. **改名**：5.5.x 把 `.wb-home-page` 改成了 `.wb-home-route`，上游那批
   `background: transparent` 规则全部失配。
2. **特异性**：原生主题注入的是

   ```css
   :root .wb-home-route {                        /* (0,2,0) */
     background-color: rgb(245,249,255) !important;
     background-image: var(--wb-home-bg-fallback) !important;
   }
   ```

   第一版修复用的是 `.wb-home-route`，只有 **(0,1,0)**。
   **同样带 `!important` 时，特异性低的一方照样输。**

第一版失败得很有迷惑性：规则确实在样式表里、确实有 `!important`、
`.wb-home-route__bg-video` 也确实被 `display:none` 压住了（那条没有竞争者），
唯独底色纹丝不动。

**定位**　用 CDP 的 `CSS.getMatchedStylesForNode` 打出级联顺序，一眼看到赢家。
`scripts/wb-matched.mjs` 就是为此写的。

**修复**　`patches/patch-wb55.mjs`：选择器提到 `:root:root`（0,3,0），
并把原生主题取底图的 `--wb-home-bg-fallback` 变量置为 `none`。

**顺带**　原生主题的动画（涟漪）是一个 `<video class="wb-home-route__bg-video">`，
`src` 指向 `~/.workbuddy/appearance-resources/`，不是 CSS 动画。

---

## 番外：一个从来没生效过的动画

给皮肤加背景漂移时写了：

```css
#root { animation: heigeDrift 26s ease-in-out infinite !important; }
@keyframes heigeDrift { /* 改 background-position */ }
```

`document.getAnimations()` 报 `playState: "running"`，`currentTime` 一路涨到 200 万毫秒。
但采样 `backgroundPosition`，始终是 `100% 50%`，一动不动。

**原因**：上游写的是 `#root { background: ... !important }`，而
**CSS 动画无法覆盖 `!important` 声明**。keyframes 里任何触碰 `background-position` 的代码都是死代码。

伪元素上的 `opacity` / `transform` 没有 `!important`，所以能动。
现在的动画层（`patches/patch-anim.mjs`）只动伪元素。

---

## 共同点

第 4 道、第 5 道、番外这三处，**每一层都报告成功，只有最终画面是空的**：

- 注入器说 `installed: true`
- 样式表解析出全部规则，无错误
- 动画 `playState: "running"`，`currentTime` 正常推进

这类问题读代码看不出来，只能在真实运行时里量：
`getComputedStyle` 取实际值、`CSS.getMatchedStylesForNode` 看级联、二分法定位边界、
`Page.captureScreenshot` 直接看画面。

`scripts/` 下那几个诊断工具（`wb-eval` / `wb-matched` / `wb-shot` / `wb-status`）就是这么来的。

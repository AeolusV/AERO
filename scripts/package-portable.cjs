// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
// Unarchived resources/app intentionally keeps Python and PowerShell files executable.
const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { createHash } = require("node:crypto");

const runtimeFiles = [
  "electron/main.cjs", "electron/preload.cjs", "electron/startup.cjs",
  "electron/package-smoke.cjs",
  "electron/codex-bridge.cjs", "electron/window-spring.cjs",
  "electron/wake-listener-manager.cjs", "electron/wake-runtime-installer.cjs",
  "wake/wake_listener.py", "wake/install_runtime.ps1", "wake/runtime-sources.json",
  "public/aero-logo.svg", "public/aero-tray.png",
  "LICENSE", "THIRD_PARTY_NOTICES.md",
];

function packagePortable({ root, out, platform = process.platform, arch = process.arch }) {
  if (platform !== "win32" || arch !== "x64") throw new Error("This portable build currently targets Windows x64 only.");
  root = resolve(root);
  out = resolve(out);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const electronRoot = join(root, "node_modules", "electron", "dist");
  for (const file of [...runtimeFiles, "dist/index.html", "node_modules/electron/dist/electron.exe"]) {
    if (!existsSync(join(root, file))) throw new Error("Missing packaging input: " + file + ". Run npm.cmd run build first.");
  }
  const destination = join(out, "AERO-" + pkg.version + "-win-x64");
  if (existsSync(destination)) throw new Error("Output already exists; preserve it and choose another --out directory: " + destination);
  mkdirSync(destination, { recursive: true });
  cpSync(electronRoot, destination, { recursive: true });
  renameSync(join(destination, "electron.exe"), join(destination, "AERO.exe"));
  const appRoot = join(destination, "resources", "app");
  mkdirSync(appRoot, { recursive: true });
  for (const file of runtimeFiles) {
    const target = join(appRoot, file);
    mkdirSync(require("node:path").dirname(target), { recursive: true });
    cpSync(join(root, file), target);
  }
  cpSync(join(root, "dist"), join(appRoot, "dist"), { recursive: true });
  // Preserve the legacy package name: existing settings remain in the same userData location.
  writeFileSync(join(appRoot, "package.json"), JSON.stringify({
    name: pkg.name, productName: "AERO", version: pkg.version,
    main: "electron/main.cjs", type: "module", author: pkg.author, license: pkg.license,
  }, null, 2) + "\n");
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(join(root, file), join(destination, file));
  writeFileSync(join(destination, "BUILD-INFO.json"), JSON.stringify({
    version: pkg.version, platform: "win32", arch: "x64", signed: false,
    nodeVersion: process.version,
    electronVersion: JSON.parse(readFileSync(join(root, "node_modules", "electron", "package.json"), "utf8")).version,
    sourceCommit: /^[a-f0-9]{40}$/i.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : null,
    repository: process.env.GITHUB_REPOSITORY === "AeolusV/AERO" ? "AeolusV/AERO" : null,
    workflowRun: /^\d+$/.test(process.env.GITHUB_RUN_ID || "") ? process.env.GITHUB_RUN_ID : null,
    desktopEndToEndVerified: false,
  }, null, 2) + "\n");
  writeFileSync(join(destination, "START-HERE.txt"),
    "AERO by Aeolus — Windows x64 preview\r\n\r\n" +
    "解压完整文件夹后运行 AERO.exe，无需安装 Node.js。不要单独移动 exe。\r\n" +
    "Extract the entire folder and run AERO.exe. Node.js is not required. Keep all supporting files together.\r\n\r\n" +
    "需要已安装并登录的 Codex Desktop。语音唤醒首次配置需要联网，之后在本地识别。\r\n" +
    "Requires a signed-in Codex Desktop. Optional voice runtime setup needs internet access; wake recognition then runs locally.\r\n" +
    "Voice 结束后需手动重新监听。关闭窗口隐藏到托盘；退出请用托盘菜单。\r\n" +
    "Restart listening manually after Voice ends. Closing hides to tray; exit from its menu.\r\n\r\n" +
    "此预览未签名，Windows 可能提示未知发布者。请核对来源，不要关闭系统安全保护。\r\n" +
    "Unsigned preview: Windows may warn about an unknown publisher. Verify its source; do not disable system security.\r\n" +
    "Read LICENSE before reuse. https://github.com/AeolusV/AERO\r\n", "utf8");
  const hashes = [];
  function walk(dir, relative = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? relative + "/" + entry.name : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), name);
      else hashes.push(createHash("sha256").update(readFileSync(join(dir, entry.name))).digest("hex") + "  " + name);
    }
  }
  walk(destination);
  writeFileSync(join(destination, "SHA256SUMS.txt"), hashes.join("\n") + "\n");
  return destination;
}

if (require.main === module) {
  const index = process.argv.indexOf("--out");
  if (index < 0 || !process.argv[index + 1]) throw new Error("Specify a new output directory: npm.cmd run package:portable -- --out <directory>");
  console.log("PORTABLE_BUILD_OK " + packagePortable({ root: join(__dirname, ".."), out: process.argv[index + 1] }));
}
module.exports = { packagePortable, runtimeFiles };

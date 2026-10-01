// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
const { existsSync } = require("node:fs");
const { join } = require("node:path");

function resolveStartupTarget({ root, dev = false, devUrl = "", exists = existsSync }) {
  if (devUrl) return { url: devUrl };
  if (dev) return { url: "http://127.0.0.1:5173" };
  const file = join(root, "dist", "index.html");
  if (!exists(file)) {
    throw new Error("未找到已构建的 AERO 界面。请在项目目录运行 npm.cmd run build，再运行 npm.cmd start。开发模式请使用 npm.cmd run dev。");
  }
  return { file };
}

module.exports = { resolveStartupTarget };

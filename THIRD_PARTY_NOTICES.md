# 第三方内容 / Third-party materials

AERO 的原创部分由 Aeolus 署名。项目的作者授权许可不替代或限制第三方各自的许可，也不将第三方内容声明为 Aeolus 原创。

## 软件依赖 / Software dependencies

本地包元数据已核对：React / React DOM、Electron 和 Vite 为 MIT，lucide-react 为 ISC，TypeScript 为 Apache-2.0。完整依赖版本见 `package-lock.json`；分发时须遵守实际随包分发的各依赖许可证并保留所需声明。本文件不是完整传递依赖许可证清单。

离线语音使用 Vosk、sounddevice、Python、uv 和外部下载的模型；它们不受 AERO 作者许可约束。模型和独立运行环境不纳入源码仓库，安装与分发仍应遵守来源项目各自的条款。

## 从 Codex 提取的图标 / Extracted Codex icons

`public/codex-icons/*.svg` 来源于 Codex Desktop 安装包，提取路径和映射见 `scripts/mirror-codex-micro-icons.cjs`；本地 `manifest.json` 仅是资源路径索引，不是授权证明。

目前未确认这些图标的公开再分发许可。公开仓库或发布包前，应取得相应权利人许可，或用有明确许可的图标/原创图标替换；仅添加本声明不能解决授权问题。不得将这些图标或 OpenAI / Codex 标识归为 Aeolus 原创。

## 品牌和其他工作区内容 / Brands and workspace references

OpenAI、Codex 及第三方标识归各自权利人。本项目是独立项目，不声明获得 OpenAI 官方认可或与其关联。

工作区中的 Codex 接口提取、第三方参考项目与网页参考素材，不因与 AERO 共处同一目录而受到 AERO 许可覆盖。计划发布的仓库应以本应用仓库为边界，不将整个资料工作区直接上传。

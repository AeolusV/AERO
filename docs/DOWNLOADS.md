# 下载与核对

**简体中文** · [English](DOWNLOADS.en.md)

[使用指南](USAGE.md) · [开发指南](DEVELOPMENT.md) · [签名说明](SIGNING.md)

当前版本为 **0.1.0-beta.2**，面向愿意尝鲜的 Windows x64 用户。[了解这个 Beta](BETA.md)。下载包未签名，不代表稳定版本或全部桌面功能已经验证。

## 下载 Beta

在 [AERO 0.1.0 Beta 2](https://github.com/AeolusV/AERO/releases/tag/v0.1.0-beta.2) 页面的 **Assets** 中下载应用 ZIP。Release 附件没有 Actions 的 14 天自动过期限制；除非维护者删除或替换，会持续保留。

下载名称以 `AERO-0.1.0-beta.2-win-x64` 开头的 `.zip`，以及同名 `.sha256` 校验文件。`provenance.jsonl` 是构建来源证明；页面自动提供的 **Source code** 是源码，不是可直接运行的应用。

核对应用 ZIP 后完整解压，运行文件夹内 `AERO.exe`，不要单独移动 exe。便携版无需安装。

## Actions 候选包（维护者）

维护者在 [Actions](https://github.com/AeolusV/AERO/actions/workflows/portable-candidate.yml) 选择 **Windows portable candidate → Run workflow → main**。流程使用该次运行的源码提交，安装锁定依赖，完成回归、构建与隔离启动检查，再生成 ZIP、SHA-256 和构建来源证明。不会连接真实 Codex、录音、发送语音热键或修改用户设置。

运行成功后，从该次运行的 Artifacts 下载候选包（GitHub 可能要求登录）。产物保留 14 天，不能把 Actions 下载当作长期 Release 链接。下载项中包含：

- 完整应用 ZIP，名称带源码提交前缀。
- 同名 `.zip.sha256` 文件。
- `provenance.jsonl` 来源证明。

解开 Actions 下载的外层文件，再核对其中的应用 ZIP。核对后，将应用 ZIP 完整解压，运行文件夹内 `AERO.exe`；不要只取出 exe。

## 检查 ZIP

```powershell
Get-FileHash -LiteralPath '.\实际下载的应用.zip' -Algorithm SHA256
Get-Content -LiteralPath '.\实际下载的应用.zip.sha256'
```

两个哈希应一致。哈希比对可以检查文件是否改变，但如果文件和校验值都来自不可信来源，不能单凭比对认定安全。

安装 GitHub CLI 后，联网验证来源：

```powershell
gh attestation verify '.\实际下载的应用.zip' --repo AeolusV/AERO
```

检查输出是否对应 AERO 仓库、候选包工作流和你选择的源码提交。验证的是这份 ZIP，而非解压后单独拿出的 exe。包内 `BUILD-INFO.json` 记录版本和构建提交，`SHA256SUMS.txt` 列出文件校验值。

## 使用前了解

来源证明说明产物来自哪个构建流程，不是 Windows 发布者签名，也不是安全审计、可复现构建证明或功能验收。候选包仍可能触发 Windows 安全提示；不要关闭系统安全保护。本次 Beta 不以真人验收为发布前提：真实语音唤醒和完整桌面交互未做本轮端到端验收，这不影响尝鲜，但不应视为已验证的稳定体验。

Beta 以 GitHub 预发布（Pre-release）形式提供，不是稳定版本。构建工作流仍不自动创建 Release；公开附件由维护者单独发布。

依据：[GitHub 构建来源证明](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)。

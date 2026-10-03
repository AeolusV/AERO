# Windows 签名与发布

**简体中文** · [English](SIGNING.en.md)

[开发指南](DEVELOPMENT.md) · [产品介绍](../README.md)

签名流程已准备，但当前候选包仍未签名。公开发布还需要真实桌面功能与新用户环境验证；此文档不表示已经完成这些验证。

## 需要准备什么

- Windows SDK 中的 `signtool.exe`。脚本可以发现已安装的 x64 工具，也可通过 `-SignToolPath` 明确指定。
- 与正式发布者身份相符的代码签名证书，带可用私钥、Code Signing 用途且在有效期内。证书由用户明确选择，不自动挑选。
- 证书提供商支持的 HTTPS RFC 3161 时间戳服务地址。

优先使用 Windows 证书库及证书提供商的硬件或托管密钥接口，私钥不导出。当前脚本不接收 PFX、密码或云服务令牌；不能把这些内容放进仓库、日志、聊天或命令行。获取证书、开通服务和产生费用须由作者另行决定。自签名不等于面向公众的可信签名。

## 先预检，不签名

默认只读预检，不访问时间戳服务，也不修改候选包：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sign-portable.ps1 `
  -PackageDirectory '完整候选包目录'
```

脚本返回工具、证书、时间戳和输出目录的准备状态。这里的 `ExecutionPolicy Bypass` 只用于本次 PowerShell 进程，不修改系统策略；仅对你已检查且信任的仓库脚本使用。

## 指定证书后签名

证书指纹是公开标识，不是私钥。用实际指纹、提供商地址和新输出目录替换占位符。默认从 `CurrentUser\My` 查找，系统证书库需显式传 `-StoreLocation LocalMachine`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sign-portable.ps1 `
  -PackageDirectory '完整候选包目录' `
  -CertificateThumbprint '40位证书指纹' `
  -TimestampUrl 'https://证书提供商的时间戳地址' `
  -OutputDirectory '新的签名输出目录'
```

先确认预检显示 `ready: true`，再对同一命令添加 `-Execute`。执行时会校验候选包的文件哈希，复制到新文件夹，仅签名新副本的 `AERO.exe`。不会覆盖原包，也不会覆盖已有输出。

使用 SHA-256 文件摘要和 SHA-256 RFC 3161 时间戳；完成后执行 `signtool verify /pa /all`，同时要求 Windows 验签有效、签名证书匹配所选指纹且有时间戳。成功才更新入门说明与 `SHA256SUMS.txt`，输出 `SIGNED_PORTABLE_OK`。失败副本保留用于排查，不得分发。

## 不要混淆的边界

- 当前签名目标仅为 `AERO.exe`，不覆盖未归档的 JS、Python、PowerShell 等资源。逐文件校验用于完整性核对，不能替代签名覆盖或独立可信的校验值来源。
- exe 签名有效，不代表整个应用的功能已经测试通过，也不保证 Windows SmartScreen 不再提示。
- 当前没有自动更新、安装器或公开 Release。添加这些能力后需分别设计签名与验证流程。
- 文件图标与发布者元数据应在签名前完成；任何签名后的 exe 修改都会需要重新签名。
- 最终顺序：构建和品牌资源 → 桌面实测 → 签名和验签 → 更新哈希 → 完整文件夹压缩 → 压缩包哈希 → 经作者确认后发布。

依据：[Microsoft SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)、[Authenticode 时间戳](https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures)。

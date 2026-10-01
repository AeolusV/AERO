# Aero 桌面应用 / Aero Desktop App

作者 / Author：**Aeolus**。Copyright (c) 2026 Aeolus.

本项目采用源码公开、作者授权模式，而非宽松开源许可。复制、分发或改写 AERO 原创内容须事先获得 Aeolus 的明确书面授权；法律及托管平台已有授权的行为除外。保留作者署名不等于获得许可。详见 [LICENSE](LICENSE) 和 [第三方内容说明](THIRD_PARTY_NOTICES.md)。

Windows 上的 Codex Desktop 悬浮控制条原型。它不修改 Codex 安装包，也不依赖隐藏的 Codex Micro 设置页，而是通过本机 Codex `app-server` 读取任务元数据，并结合本地 rollout 增量判断 Desktop 任务的实时状态。

## 当前能力

- 自动发现本机 Codex 后端，优先使用 Desktop 安装包自带版本，避免全局 CLI 与 Desktop 的协议版本错配；可用 `CODEX_BIN` 显式指定，未安装 Desktop 时才选择 CLI
- 连接本机 `codex.exe app-server`
- 读取最近任务并映射六个可点击、可切换的状态灯；点击通过 `codex://threads/<id>` 打开对应 Desktop 任务
- 区分空闲、运行、等待批准/用户输入、完成和错误
- 默认槽位使用白色玻璃；仅在实时状态变化时着色
- 跟随 Codex Micro 官方状态色：空闲 `#FAFAFA`、运行 `#9CB6F6`、完成 `#B4E3BA`、等待 `#F6E19D`、错误 `#F0A2BB`
- 未读完成或错误状态在用户打开对应任务后恢复为白色
- 选择并打开任务、新建任务、继续任务、中断 turn
- 推理档位优先写入已加载任务；Desktop 独占当前 rollout 时回退到官方 `model_reasoning_effort` 配置，并通过 `config/read` 确认写入结果
- 处理与具体 JSON-RPC 请求绑定的批准/拒绝
- 自定义控件显示、顺序和密度，设置保存到本地
- 无边框、置顶、透明的 Windows 悬浮窗口
- 完整控制栏与迷你状态栏可双向切换；完整栏推到屏幕边缘时自动收缩
- 迷你状态栏固定为六个任务灯与一个返回键，七个圆形控件等距居中
- 迷你状态栏可在桌面自由拖动；释放时结合移动速度决定自由停放或边缘磁吸
- 大小 Bar 可分别选择冷白或深色玻璃材质，深色模式保留状态灯的下层光芒
- app-server 异常退出后自动退避重连；rollout 状态约每 2 秒增量刷新，任务元数据约每 15 秒刷新

## 开发运行

环境：Windows、Node.js 24 LTS、npm，以及已安装并登录的 Codex Desktop。首次获取源码：

```powershell
git clone https://github.com/AeolusV/AERO.git
Set-Location AERO
```

```powershell
npm.cmd install
npm.cmd run dev
```

生产构建：

```powershell
npm.cmd run build
```

构建后运行：

```powershell
npm.cmd start
```

## 接口边界

本项目使用实验性的 Codex `app-server` 协议，客户端更新后字段可能变化。独立 app-server 无法直接继承 Codex Desktop 进程内的 loaded/active 状态，因此 Aero 会把 app-server 元数据与本地 rollout 状态合并；等待输入、等待授权、长时间工具调用、完成与错误均由未读取对话正文的结构化事件判断。官方 Codex Micro 的推理旋钮实际执行 Desktop WebView 内部的 `composer.increaseReasoningEffort` / `composer.decreaseReasoningEffort` 命令，该命令未对外部进程开放；Aero 在当前 Desktop 任务被文件锁独占时改用 app-server 的官方配置写入接口，因此档位会作为 Codex 默认推理强度应用于后续提交。任务灯通过 `codex://threads/<id>` 交给 Desktop 打开。批准操作始终回复当前待处理请求的原始 JSON-RPC `id`，不会提供不区分请求的“全局批准”快捷键。本地语音唤醒不依赖 app-server 或 Codex 内部 push-to-talk，而是使用离线 sidecar 在释放麦克风后发送用户可见的 Voice 热键。

## 本地语音唤醒

Aero 可以在后台使用 Vosk 与 `sounddevice` 离线监听 `Hey Codex`。识别成功后，sidecar 会先关闭音频输入流，再向 Windows 发送界面中明确显示的 `Ctrl+Shift+V`，随后退出并把麦克风交给 Codex Voice。

- 不调用 OpenAI API，不上传音频，不产生 Codex token。
- Python 环境和英文 Vosk 模型使用外部路径；模型不进入仓库。新用户可在语音设置中点击“＋ 一键配置”，将隔离运行时安装到 AERO 用户数据目录。
- 一键配置使用固定版本的 Astral `uv` GitHub Release，引导隔离的 CPython 3.12.10，并从 Vosk 官方来源下载英文小模型；下载物均执行 SHA-256 校验。
- 设置页提供启用、唤醒词、麦克风、运行状态、配置检查和日志入口。
- 启动监听或点击语音前，检查本机 `keybindings.json` 是否显式绑定 Voice 到 `Ctrl+Shift+V`；缺失或禁用时报告具体原因，不修改 Codex 配置。热键发送确认不等于语音会话启动确认。
- 默认日志只记录状态与错误，不记录原始音频或未匹配的日常转写。
- Electron 与 Python 双层防止 AERO 重复启动监听器。
- Codex Voice 结束后的自动重新监听尚未实现；在没有可靠会话结束事件前不会使用固定延时或抢麦探测。

自动化验证：

```powershell
npm.cmd run test:wake-manager
npm.cmd run test:wake-runtime
npm.cmd run build
```

真实麦克风启停冒烟测试会短时访问所选输入设备，但禁用热键：

```powershell
npm.cmd run test:wake-live
```

## 阶段收口 / Compatibility baseline · 2026-10-02

- 当前主入口为本应用仓库根目录；使用自己的检出路径运行，不依赖作者机器上的旧工作区目录。
- 已核对 Codex Desktop `26.928.3736.0`，内置后端 `codex-cli 0.159.2`；自动发现并实际连接成功，任务列表、任务内容读取与远程控制状态查询通过。
- 当前协议保留 `thread/settings/update`、`config/value/write`、线程状态通知和任务列表字段。推理档位按默认模型的 `model/list` 声明显示；本机返回 Low / Medium / High / XHigh / Max / Ultra，不再把新版档位误显示为 Medium。不同线程使用不同模型时，档位列表目前仍以配置中的默认模型为准，服务器负责最终校验。
- 针对性检查：`node scripts/desktop-compatibility.test.cjs`、`node scripts/bridge-actions.test.cjs`、`node scripts/thread-status.test.cjs`；生产构建 `npm.cmd run build`。构建直接使用已纳入 Git 的 `vite.config.ts`，不再依赖未跟踪的生成 JS。
- 本机 Python 和英文模型路径仍有效；但当前 Codex 的 `composer.startVoiceMode` 与 `realtimeVoice` 绑定均为 null。新版 Windows 无默认 Voice 绑定，所以语音功能还需要用户在 Codex 快捷键设置中明确绑定 `Ctrl+Shift+V`。本轮未修改快捷键，未执行真人英文唤醒验收，也未发起付费模型任务。
- 仍保留的边界：Voice 会话结束后不自动重新监听；独立 app-server 不能继承 Desktop 的进程内状态，灯的状态继续结合本地结构化 rollout 事件；配置回退不代表已同步修改 Desktop 当前输入框的档位。
- 收口保留源码、Git 历史、宣传网页、设计截图、接口研究、外部模型和最新 `dist`；缓存与过期浏览器文本快照按本次授权移入 Windows 回收站。下一阶段从此仓库继续，不需要重建原型。

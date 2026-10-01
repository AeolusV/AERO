# 开发 AERO

**简体中文** · [English](DEVELOPMENT.en.md)

[返回产品介绍](../README.md) · [使用指南](USAGE.md)

本项目是源码公开、作者授权模式。开发、改写和分发前请确认 [LICENSE](../LICENSE) 中适用的授权范围；第三方内容见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

## 开发入口

Windows + Node.js 24 LTS，在仓库根目录运行：

```powershell
npm.cmd ci
npm.cmd run dev
```

开发命令启动本地 Vite 和 Electron，使用 `127.0.0.1:5173`。应用保持单实例，若已有 AERO 在运行，请从托盘明确退出后再启动开发实例，否则可能只显示已有窗口。

包名 `codex-micro-bar` 和既有存储键暂时保留，用于保持用户设置连续性；产品名称是 AERO。不要只为命名统一而改动这些标识。

## 代码导航

| 入口 | 职责 |
| --- | --- |
| `electron/main.cjs` | 窗口、托盘、生命周期与 IPC |
| `electron/startup.cjs` | 生产构建与开发服务的启动目标检查 |
| `electron/preload.cjs` | 隔离的渲染进程接口 |
| `electron/codex-bridge.cjs` | Codex app-server、任务状态与操作 |
| `electron/window-spring.cjs` | 窗口位置与运动计算 |
| `electron/wake-listener-manager.cjs` | 唤醒进程、设备、配置与日志 |
| `electron/wake-runtime-installer.cjs` | 本地运行环境配置 |
| `src/App.tsx` / `src/styles.css` | 控制栏、设置、主题与动画 |
| `src/WakeSettings.tsx` | 本地语音设置 |
| `wake/wake_listener.py` | 离线识别、释放麦克风、热键交接 |
| `scripts/` | 回归测试、诊断与素材工具 |

## 验证入口

```powershell
npm.cmd test          # 离线回归测试，不接触真实 Codex 或麦克风
npm.cmd run check     # 两个 TypeScript 配置的类型检查
npm.cmd run build     # 托盘素材、类型检查和生产构建
npm.cmd run verify    # 测试 + 生产构建
```

默认测试通过明确的名单运行，覆盖启动、桥接动作、档位兼容、控件排序、名称、任务状态、灯色和运动逻辑。部分测试检查源码约束，不等于实机交互或完整端到端验证。子测试失败或超时会让整体命令返回非零状态。

`test:wake-manager`、`test:wake-live`、`test:wake-ui`、`test:wake-runtime` 以及 `scripts/*smoke.cjs` 属于额外诊断，不包含在默认测试中。它们可能依赖本机模型、真实设备、Codex 或 Electron；运行前阅读对应脚本，确认数据目录、热键和麦克风影响。尤其旧的 wake-manager 测试含原型设备编号假设，不应作为新机器的通用验收。

不要把默认回归通过写成真人英文唤醒已经验证。语音端到端确认需要用户实际说出唤醒词，并观察 Codex Voice 启动与麦克风交接。

## 修改边界

- 保持 `contextIsolation`、渲染进程沙箱与 preload 边界，不把 Node 权限暴露给界面。
- 普通测试使用模拟状态；真实后端、语音、下载和热键测试单独显式运行。
- 唤醒监听只保留一个实例，触发后先释放麦克风；不要用定时猜测替代可靠会话结束信号来自动重启。
- 不提交模型、运行环境、日志、登录凭证或个人配置；不记录原始音频。
- 大小栏共享灯色语义，动画尊重减少动态效果偏好。涉及窗口运动时验证真实 Windows 表现，不能只依赖源码断言。

## 维护展示素材

`docs/images/aero-*.png` 是首页素材；`aero-promo-*` 是宣传视觉，其他四张是当前组件的演示截图。品牌方向见 [宣传视觉说明](promo-art-direction.md)。

需要重新渲染真实组件时，先构建，再为隔离的 Electron 配置指定任务专属临时目录：

```powershell
$env:AERO_DOCS_TEMP = 'C:\tmp\codex\YYYY-MM-DD-aero-docs'
New-Item -ItemType Directory -Force -Path $env:AERO_DOCS_TEMP
.\node_modules\electron\dist\electron.exe scripts/render-readme.cjs
```

脚本使用虚构线程，不启动真实后端或监听器，但会更新 `docs/images` 下四张演示截图。检查画面和差异后再提交。临时配置可在进程结束后按项目约定回收，正式素材与用户已有配置应保留。

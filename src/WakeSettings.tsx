import { useEffect, useMemo, useState } from "react";
import { CodexIcon } from "./CodexIcon";
import type { WakeConfig, WakeInputDevice, WakeListenerState, WakeRuntimeState } from "./types";

const statusLabels: Record<WakeListenerState["status"], string> = {
  testing: "测试中",
  "test-passed": "测试通过",
  "test-timeout": "未识别",
  disabled: "未启用",
  stopped: "已停止",
  starting: "启动中",
  listening: "监听中",
  stopping: "停止中",
  triggered: "已唤醒",
  "handed-off": "已交接",
  error: "异常",
};

function selectedDeviceId(config: WakeConfig | null) {
  if (config?.inputDevice == null) return "";
  return typeof config.inputDevice === "number"
    ? `legacy-index:${config.inputDevice}`
    : config.inputDevice.id;
}

export function WakeSettings() {
  const [state, setState] = useState<WakeListenerState | null>(null);
  const [draft, setDraft] = useState<WakeConfig | null>(null);
  const [devices, setDevices] = useState<WakeInputDevice[]>([]);
  const [runtime, setRuntime] = useState<WakeRuntimeState | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const deviceValue = selectedDeviceId(draft);
  const isRunning = ["starting", "listening", "testing", "stopping", "triggered"].includes(state?.status ?? "");
  const runtimeInstalling = ["checking", "downloading", "installing", "verifying"].includes(runtime?.status ?? "");
  const canEnable = Boolean(draft?.wakePhrase.trim() && draft.pythonPath && draft.modelPath && draft.inputDevice != null);
  const currentDevice = useMemo(() => {
    const selection = draft?.inputDevice;
    if (selection == null) return null;
    if (typeof selection === "number") {
      return devices.find((device) => device.index === selection) ?? null;
    }
    return devices.find((device) => device.id === selection.id) ?? selection;
  }, [devices, draft?.inputDevice]);

  const refreshDevices = async () => {
    if (!window.codexBar) return;
    setBusy("devices");
    setError("");
    try {
      const next = await window.codexBar.listWakeDevices();
      setDevices(next);
      setDraft((current) => {
        if (!current || typeof current.inputDevice !== "number") return current;
        const migrated = next.find((device) => device.index === current.inputDevice);
        return migrated ? { ...current, inputDevice: migrated } : current;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (!window.codexBar) return;
    let mounted = true;
    window.codexBar.getWakeState().then((next) => {
      if (!mounted) return;
      setState(next);
      setDraft(next.config);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    window.codexBar.getWakeRuntimeState().then((next) => {
      if (mounted) setRuntime(next);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    const unsubscribe = window.codexBar.subscribeWakeState((next) => {
      if (!mounted) return;
      setState(next);
      setDraft((current) => current ?? next.config);
    });
    const unsubscribeRuntime = window.codexBar.subscribeWakeRuntimeState((next) => {
      if (mounted) setRuntime(next);
    });
    void refreshDevices();
    return () => {
      mounted = false;
      unsubscribe();
      unsubscribeRuntime();
    };
  }, []);

  const updateDraft = (patch: Partial<WakeConfig>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setNotice("");
  };

  const save = async () => {
    if (!window.codexBar || !draft) return null;
    setBusy("save");
    setError("");
    try {
      const next = await window.codexBar.saveWakeConfig(draft);
      setState(next);
      setDraft(next.config);
      setNotice("本地唤醒设置已保存");
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy("");
    }
  };

  const toggleEnabled = async () => {
    if (!window.codexBar || !draft || busy) return;
    const enabled = !state?.config.enabled;
    if (enabled && !canEnable) {
      setError("请先填写唤醒词、Python、英文模型并选择麦克风");
      return;
    }
    setBusy("toggle");
    setError("");
    try {
      await window.codexBar.saveWakeConfig(draft);
      const next = await window.codexBar.setWakeEnabled(enabled);
      setState(next);
      setDraft(next.config);
      setNotice(enabled ? "正在启动本地监听" : "本地监听已关闭");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  const runCheck = async () => {
    if (!window.codexBar || !draft || busy) return;
    setBusy("check");
    setError("");
    try {
      await window.codexBar.saveWakeConfig(draft);
      const result = await window.codexBar.checkWake();
      setNotice(`检查通过 · ${result.device?.name || "系统默认麦克风"}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  const restart = async () => {
    if (!window.codexBar || busy) return;
    setBusy("restart");
    setError("");
    try {
      const next = await window.codexBar.startWake();
      setState(next);
      setNotice("正在重新启动本地监听");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  const choosePython = async () => {
    const path = await window.codexBar?.chooseWakePython();
    if (path) updateDraft({ pythonPath: path });
  };

  const testWake = async () => {
    if (!window.codexBar || !draft || busy || isRunning) return;
    setBusy("test");
    setError("");
    try {
      await window.codexBar.saveWakeConfig(draft);
      setState(await window.codexBar.testWake());
      setNotice("模型加载后，请在 30 秒内说出唤醒词。测试不会打开 Codex Voice。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  const chooseModel = async () => {
    const path = await window.codexBar?.chooseWakeModel();
    if (path) updateDraft({ modelPath: path });
  };

  const installRuntime = async () => {
    if (!window.codexBar || busy) return;
    setBusy("install");
    setError("");
    setNotice("");
    try {
      const result = await window.codexBar.installWakeRuntime();
      setRuntime(result.runtime);
      setState(result.wake);
      setDraft(result.wake.config);
      setNotice("本地运行环境已就绪 · 请选择麦克风后开启监听");
      await refreshDevices();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy("");
    }
  };

  if (!state || !draft) {
    return <section className="wake-panel"><div className="wake-loading">{window.codexBar ? "正在读取本地唤醒设置…" : "浏览器预览模式：语音监听与麦克风配置请在 AERO 桌面应用中使用。"}</div></section>;
  }

  return (
    <section className="wake-panel" aria-label="本地语音唤醒">
      <article className="settings-card wake-status-card">
        <span className={`wake-status-icon ${state.status}`}><CodexIcon name="mic" size={19} /></span>
        <span className="wake-status-copy">
          <span className="wake-status-eyebrow">LOCAL · OFFLINE</span>
          <strong>后台语音监听</strong>
          <small>{state.message}</small>
        </span>
        <span className="wake-status-control">
          <span className={`wake-status-pill ${state.status}`}>{statusLabels[state.status]}</span>
          <span className="wake-switch-label">监听</span>
          <button
            className={`switch ${state.config.enabled ? "on" : ""}`}
            data-sound="confirm"
            role="switch"
            aria-checked={state.config.enabled}
            aria-label={state.config.enabled ? "关闭本地语音唤醒" : "启用本地语音唤醒"}
            disabled={Boolean(busy) || state.status === "testing"}
            onClick={() => void toggleEnabled()}
          ><span /></button>
        </span>
      </article>

      <div className="wake-settings-grid">
        <article className="settings-card wake-config-card">
          <div className="settings-card-heading">
            <span><strong>唤醒与输入</strong><small>音频只在本机进入 Vosk，不上传、不调用 OpenAI API。</small></span>
          </div>
          <label className="wake-field">
            <span>唤醒词</span>
            <input value={draft.wakePhrase} onChange={(event) => updateDraft({ wakePhrase: event.target.value })} spellCheck={false} />
          </label>
          <label className="wake-field">
            <span>麦克风</span>
            <span className="wake-field-action">
              <select
                value={deviceValue}
                onChange={(event) => {
                  const next = devices.find((device) => device.id === event.target.value) ?? null;
                  updateDraft({ inputDevice: next });
                }}
              >
                <option value="">选择输入设备</option>
                {typeof draft.inputDevice === "number" && !currentDevice && (
                  <option value={`legacy-index:${draft.inputDevice}`}>原型设备 #{draft.inputDevice}（请重新选择）</option>
                )}
                {devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.hostApi}</option>)}
              </select>
              <button className="wake-mini-button" disabled={busy === "devices"} onClick={() => void refreshDevices()}><CodexIcon name="lightning-outline" size={14} />刷新</button>
            </span>
          </label>
          <div className="wake-hotkey-row">
            <span><strong>Codex Voice 热键</strong><small>请在 Codex 快捷键设置中绑定此组合。新版 Windows 无默认绑定；AERO 只检查，不修改。</small></span>
            <kbd>{draft.hotkey}</kbd>
          </div>
          <div className="wake-hotkey-row wake-resume-row">
            <span><strong>恢复监听</strong><small>语音结束后手动重新监听。自动模式入口已预留，尚未开放。</small></span>
            <div className="wake-resume-modes" role="group" aria-label="语音结束后的恢复模式">
              <span className="wake-resume-current">手动</span>
              <button className="wake-mini-button" type="button" disabled title="尚未开放：需要可靠的 Codex Voice 会话结束信号" aria-label="自动恢复监听（尚未开放）">自动 · 未开放</button>
            </div>
          </div>
        </article>

        <article className="settings-card wake-runtime-card">
          <div className="settings-card-heading">
            <span><strong>本地运行环境</strong><small>首次联网配置，之后离线监听；无需预装 Python。</small></span>
            <button
              className="wake-runtime-install"
              data-sound="confirm"
              disabled={Boolean(busy) || runtimeInstalling || isRunning}
              onClick={() => void installRuntime()}
              title="从经过校验的官方来源配置隔离运行环境"
            >
              <CodexIcon name="download" size={13} />
              {runtime?.status === "ready" ? "检查 / 修复" : runtimeInstalling ? "配置中" : "一键配置"}
            </button>
          </div>
          <div className="wake-runtime-trust" aria-label="一键配置安全说明">
            <span><CodexIcon name="check-circle" size={12} />官方来源</span>
            <span>SHA-256 校验</span>
            <span>隔离安装</span>
          </div>
          {runtime && runtime.status !== "idle" && (
            <div className={`wake-runtime-progress ${runtime.status}`} aria-live="polite">
              <span>
                <strong>{runtime.status === "ready" ? "托管环境已就绪" : runtime.status === "error" ? "配置未完成" : "正在配置本地环境"}</strong>
                <small>{runtime.message}</small>
              </span>
              <div
                className="wake-runtime-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(runtime.progress)}
              ><i style={{ width: `${Math.max(0, Math.min(100, runtime.progress))}%` }} /></div>
            </div>
          )}
          <label className="wake-field">
            <span>Python</span>
            <span className="wake-field-action">
              <input className="wake-path-input" title={draft.pythonPath} value={draft.pythonPath} onChange={(event) => updateDraft({ pythonPath: event.target.value })} spellCheck={false} />
              <button className="wake-mini-button" onClick={() => void choosePython()}>选择</button>
            </span>
          </label>
          <label className="wake-field">
            <span>英文模型</span>
            <span className="wake-field-action">
              <input className="wake-path-input" title={draft.modelPath} value={draft.modelPath} onChange={(event) => updateDraft({ modelPath: event.target.value })} spellCheck={false} />
              <button className="wake-mini-button" onClick={() => void chooseModel()}>选择</button>
            </span>
          </label>
          <div className="wake-runtime-note">
            <CodexIcon name="lightning-outline" size={15} />
            <span>触发后监听器会先释放麦克风，再发送热键并退出。Codex Voice 结束后的自动恢复尚未启用。</span>
          </div>
          <div className="wake-runtime-note">
            <CodexIcon name="flask" size={15} />
            <span>英文模型：vosk-model-small-en-us-0.15（约 40 MB）。一键配置会下载并填入路径；也可选择已有的解压目录。</span>
          </div>
        </article>
      </div>

      {!runtimeInstalling && (
        <div className="wake-actions">
          <button className="wake-primary-action" disabled={Boolean(busy)} onClick={() => void save()}><CodexIcon name="check" size={15} />保存设置</button>
          <button disabled={Boolean(busy) || !canEnable} onClick={() => void runCheck()}><CodexIcon name="flask" size={15} />检查配置</button>
          <button disabled={Boolean(busy) || !canEnable || isRunning || state.status === "handed-off"} onClick={() => void testWake()}><CodexIcon name="mic" size={15} />测试唤醒</button>
          {isRunning && <button disabled={Boolean(busy)} onClick={() => void window.codexBar?.stopWake().then(setState).catch((reason) => setError(String(reason)))}><CodexIcon name="x-circle" size={15} />停止监听 / 测试</button>}
          {state.status === "handed-off" && state.config.enabled && (
            <button disabled={Boolean(busy)} onClick={() => void restart()}><CodexIcon name="play-outline" size={15} />重新监听</button>
          )}
          <button disabled={Boolean(busy)} onClick={() => void window.codexBar?.openWakeLog()}><CodexIcon name="terminal" size={15} />打开日志</button>
          {isRunning && <span className="wake-live-note">PID {state.pid ?? "—"}</span>}
        </div>
      )}
      <p className="wake-feedback">先一键配置 → 选择麦克风 → 检查配置 → 测试唤醒。测试前请结束 Codex Voice；通过后再开启正式监听。</p>
      {(notice || error) && <p className={`wake-feedback ${error ? "error" : ""}`} role="status">{error || notice}</p>}
    </section>
  );
}

// AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE and THIRD_PARTY_NOTICES.md.
import {
  ChevronDown,
  GripVertical,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodexIcon, type CodexIconName } from "./CodexIcon";
import { BrandMark, type BrandPalette, type BrandSurface } from "./BrandMark";
import { WakeSettings } from "./WakeSettings";
import { SettingsDisclosure } from "./SettingsDisclosure";
import { moveControlBy, reorderControls } from "./control-order";
import { playInteractionSound, type InteractionSound } from "./interaction-sound";
import { workspaceNameFromCwd } from "./thread-display";
import {
  hasWorkingToCompleteTransition,
  type ThreadToneSnapshot,
} from "./thread-feedback";
import type {
  BridgeAction,
  BridgeState,
  CodexThread,
  ControlId,
  ControlPreference,
  ReasoningEffort,
  ThreadTone,
  WindowMode,
} from "./types";

const previewParams = new URLSearchParams(window.location.search);
const showDemoStates = previewParams.get("demoStates") === "1";
type SettingsTab = "appearance" | "controls" | "voice" | "connections";
type BarMaterial = "light" | "dark";
type LampPalette = Record<ThreadTone, string>;

const defaultLampPalette: LampPalette = {
  idle: "#E4E9F1",
  active: "#96B4EC",
  complete: "#A6D9B1",
  waiting: "#F1D78B",
  error: "#EEAEC3",
};

const previousDefaultLampPalette: LampPalette = {
  idle: "#DDE3EC",
  active: "#89A9E7",
  complete: "#98D0A5",
  waiting: "#EDCD7A",
  error: "#EAA0B8",
};

const legacyDefaultLampPalette: LampPalette = {
  idle: "#F1F3F6",
  active: "#ADC0E9",
  complete: "#B4D8BB",
  waiting: "#F1DDA4",
  error: "#EDAFC1",
};

const lampColorPresets = ["#E4E9F1", "#96B4EC", "#A6D9B1", "#F1D78B", "#EEAEC3", "#C5B1E5", "#99DBD2", "#F2B69C"];

const lampStatusMeta: Array<{ tone: ThreadTone; label: string; detail: string }> = [
  { tone: "idle", label: "空闲", detail: "没有活动回合，等待下一步。" },
  { tone: "active", label: "工作中", detail: "Codex 正在思考、执行或生成。" },
  { tone: "complete", label: "已完成", detail: "当前回合已经收束。" },
  { tone: "waiting", label: "需要输入", detail: "等待你的输入或批准。" },
  { tone: "error", label: "错误", detail: "线程或连接需要检查。" },
];

const demoThreads: CodexThread[] = [
  { id: "demo-1", name: "Aero", preview: "Implement adapter", cwd: "C:/Projects/Aero", tone: showDemoStates ? "active" : "idle" },
  { id: "demo-2", name: "UI system", preview: "Review liquid glass controls", cwd: "C:/Projects/UI", tone: showDemoStates ? "complete" : "idle" },
  { id: "demo-3", name: "Approval", preview: "Waiting for command approval", cwd: "C:/Projects/Agent", tone: showDemoStates ? "waiting" : "idle" },
  { id: "demo-4", name: "Build", preview: "Build failed", cwd: "C:/Projects/App", tone: showDemoStates ? "error" : "idle" },
  { id: "demo-5", name: "Research", preview: "Idle", cwd: "C:/Projects/Research", tone: "idle" },
  { id: "demo-6", name: "Draft", preview: "Idle", cwd: "C:/Projects/Draft", tone: "idle" },
];

const initialBridgeState: BridgeState = {
  connection: window.codexBar ? "connecting" : "disconnected",
  error: "",
  binaryPath: "",
  threads: window.codexBar ? [] : demoThreads,
  activeThreadId: window.codexBar ? null : "demo-1",
  activeTurnId: null,
  reasoningEffort: "medium",
  pendingApproval: null,
  remoteControl: {
    status: "disabled",
    serverName: "",
    installationId: "",
    environmentId: null,
    clients: [],
    pairing: null,
    error: "",
  },
};

const previewEdgeValue = previewParams.get("edge");
const previewToneValue = previewParams.get("tone");
const initialWindowMode: WindowMode = {
  edge: ["left", "right", "top", "bottom"].includes(previewEdgeValue ?? "") ? previewEdgeValue as WindowMode["edge"] : null,
  compact: previewParams.get("compact") === "1" || previewParams.get("hidden") === "1",
  hidden: previewParams.get("hidden") === "1",
  burst: previewParams.get("burst") === "1",
  dragging: false,
  tone: ["idle", "active", "waiting", "error", "complete"].includes(previewToneValue ?? "") ? previewToneValue as WindowMode["tone"] : "idle",
  slot: Number(previewParams.get("slot")) || null,
  label: previewParams.get("label") || "Codex",
};

const defaultControls: ControlPreference[] = [
  { id: "brand", enabled: false },
  { id: "connection", enabled: true },
  { id: "threadSlots", enabled: true },
  { id: "activeTask", enabled: false },
  { id: "reasoning", enabled: true },
  { id: "newTask", enabled: true },
  { id: "continue", enabled: true },
  { id: "interrupt", enabled: true },
  { id: "approve", enabled: true },
  { id: "reject", enabled: false },
  { id: "voice", enabled: false },
  { id: "project", enabled: false },
  { id: "openCodex", enabled: false },
  { id: "forkTask", enabled: false },
  { id: "copyMarkdown", enabled: false },
  { id: "archiveTask", enabled: false },
  { id: "openSettings", enabled: false },
  { id: "openFolder", enabled: false },
  { id: "openTerminal", enabled: false },
  { id: "openDocs", enabled: false },
];

const controlMeta: Record<ControlId, { label: string; detail: string; icon: CodexIconName; support: "direct" | "local" | "planned" }> = {
  brand: { label: "Aero 标志", detail: "原创品牌标志，可换配色与底色", icon: "codex", support: "local" },
  connection: { label: "连接状态", detail: "连接或刷新 Codex app-server", icon: "lightning-outline", support: "direct" },
  threadSlots: { label: "任务状态灯", detail: "官方六槽状态语义", icon: "all-products", support: "direct" },
  activeTask: { label: "当前任务", detail: "显示当前任务摘要", icon: "codex", support: "direct" },
  reasoning: { label: "推理强度", detail: "跟随当前 Codex 模型支持的档位", icon: "brain-medium", support: "direct" },
  newTask: { label: "新建任务", detail: "官方 newTask", icon: "compose", support: "direct" },
  continue: { label: "继续任务", detail: "通过 turn/start 推进当前任务", icon: "play-outline", support: "direct" },
  interrupt: { label: "中断", detail: "官方 turn/interrupt", icon: "x-circle", support: "direct" },
  approve: { label: "批准", detail: "批准当前待处理请求", icon: "check-circle", support: "direct" },
  reject: { label: "拒绝", detail: "拒绝当前待处理请求", icon: "x-circle", support: "direct" },
  voice: { label: "Codex Voice", detail: "点击立即打开语音；本地监听会先释放麦克风", icon: "mic", support: "local" },
  project: { label: "切换项目", detail: "在最近项目之间切换", icon: "folder-git", support: "local" },
  openCodex: { label: "打开 Codex", detail: "打开当前任务深链", icon: "codex", support: "direct" },
  forkTask: { label: "继续到新任务", detail: "官方 thread/fork", icon: "branch", support: "direct" },
  copyMarkdown: { label: "复制 Markdown", detail: "读取当前任务并复制为 Markdown", icon: "download", support: "direct" },
  archiveTask: { label: "归档任务", detail: "官方 thread/archive，操作前确认", icon: "trash", support: "direct" },
  openSettings: { label: "Codex 设置", detail: "打开 codex://settings", icon: "settings", support: "direct" },
  openFolder: { label: "打开文件夹", detail: "打开当前任务工作目录", icon: "folder-plus", support: "local" },
  openTerminal: { label: "打开终端", detail: "在当前任务目录启动终端", icon: "terminal", support: "local" },
  openDocs: { label: "Codex 文档", detail: "打开 OpenAI Codex 官方文档", icon: "openai", support: "direct" },
};

const densityMap = {
  0: "compact",
  1: "balanced",
  2: "comfortable",
} as const;

const toneLabels: Record<WindowMode["tone"], string> = {
  idle: "空闲",
  active: "工作中",
  waiting: "需要输入",
  error: "错误",
  complete: "已完成",
};

const supportLabels = {
  direct: "Codex 接口",
  local: "桌面适配",
  planned: "内部限定",
} as const;

const remoteStatusLabels = {
  disabled: "未启用",
  connecting: "连接中",
  connected: "已连接",
  errored: "连接异常",
  unavailable: "当前版本不可用",
} as const;

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("codex-bar-controls-v1") ?? "null");
    if (Array.isArray(saved)) {
      const defaults = new Map(defaultControls.map((control) => [control.id, control]));
      const seen = new Set<ControlId>();
      const ordered = saved.flatMap((item): ControlPreference[] => {
        if (
          !item
          || typeof item.id !== "string"
          || typeof item.enabled !== "boolean"
          || !defaults.has(item.id as ControlId)
          || seen.has(item.id as ControlId)
        ) return [];
        const id = item.id as ControlId;
        seen.add(id);
        return [{ id, enabled: item.enabled }];
      });
      return [
        ...ordered,
        ...defaultControls.filter((control) => !seen.has(control.id)),
      ];
    }
  } catch {
    // Fall back to the deliberate default control layout.
  }
  return defaultControls;
}

function readDensity() {
  const stored = localStorage.getItem("codex-bar-density-v1");
  if (stored == null) return 1;
  const value = Number(stored);
  return value >= 0 && value <= 2 ? value : 1;
}

function readSoundPreference() {
  return localStorage.getItem("codex-bar-sound-v1") !== "off";
}

function readBrandPalette(): BrandPalette {
  const stored = localStorage.getItem("aero-brand-palette-v1");
  return ["air", "mint", "sunset", "graphite"].includes(stored ?? "") ? stored as BrandPalette : "air";
}

function readBrandSurface(): BrandSurface {
  return localStorage.getItem("aero-brand-surface-v1") === "clear" ? "clear" : "soft";
}

function readBarMaterial(key: "large" | "compact", fallback: BarMaterial): BarMaterial {
  const stored = localStorage.getItem(`aero-${key}-bar-material-v1`);
  return stored === "light" || stored === "dark" ? stored : fallback;
}

function normalizeLampColor(value: string) {
  const hex = value.trim().replace(/^#/, "");
  return /^[\da-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : null;
}

function readLampPalette(): LampPalette {
  try {
    const stored = JSON.parse(localStorage.getItem("aero-lamp-palette-v1") ?? "null");
    const palette = lampStatusMeta.reduce<LampPalette>((next, { tone }) => {
      next[tone] = normalizeLampColor(String(stored?.[tone] ?? "")) ?? defaultLampPalette[tone];
      return next;
    }, { ...defaultLampPalette });
    const usesLegacyDefaults = lampStatusMeta.every(({ tone }) => palette[tone] === legacyDefaultLampPalette[tone]);
    const usesPreviousDefaults = lampStatusMeta.every(({ tone }) => palette[tone] === previousDefaultLampPalette[tone]);
    return usesLegacyDefaults || usesPreviousDefaults ? { ...defaultLampPalette } : palette;
  } catch {
    return { ...defaultLampPalette };
  }
}

function lampGlow(color: string, alpha: number) {
  const normalized = normalizeLampColor(color) ?? "#FFFFFF";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function StatusDot({ state }: { state: BridgeState["connection"] }) {
  return <span className={`connection-dot ${state}`} aria-hidden="true" />;
}

function ThreadTooltip({ id, thread }: { id: string; thread?: CodexThread }) {
  if (!thread) return null;
  return (
    <span className="thread-tooltip" id={id} role="tooltip">
      <span className="thread-tooltip-workspace">{workspaceNameFromCwd(thread.cwd)}</span>
      <strong>{thread.name}</strong>
      <span className="thread-tooltip-state">{toneLabels[thread.tone]}</span>
    </span>
  );
}

function ThreadLens({ thread, index, selected, onSelect }: { thread?: CodexThread; index: number; selected: boolean; onSelect: () => void }) {
  const tone = thread?.tone ?? "idle";
  const tooltipId = `thread-tooltip-full-${index}`;
  return (
    <button
      className={`thread-lens ${tone} ${selected ? "selected" : ""}`}
      data-sound="tick"
      data-slot={index + 1}
      onClick={onSelect}
      disabled={!thread}
      aria-pressed={selected}
      aria-label={thread ? `${index + 1}. ${workspaceNameFromCwd(thread.cwd)} · ${thread.name}，${toneLabels[thread.tone]}` : `空任务槽位 ${index + 1}`}
      aria-describedby={thread ? tooltipId : undefined}
    >
      <ThreadTooltip id={tooltipId} thread={thread} />
    </button>
  );
}

function IconButton({ label, className = "", disabled, danger, active, sound = "press", onClick, children }: { label: string; className?: string; disabled?: boolean; danger?: boolean; active?: boolean; sound?: InteractionSound; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`icon-button ${className} ${danger ? "danger" : ""} ${active ? "active" : ""}`} data-sound={sound} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export default function App() {
  const [bridge, setBridge] = useState(initialBridgeState);
  const [controls, setControls] = useState<ControlPreference[]>(readPreferences);
  const [density, setDensity] = useState(readDensity);
  const [expanded, setExpanded] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [pendingEffort, setPendingEffort] = useState<ReasoningEffort | null>(null);
  const [effortConfirming, setEffortConfirming] = useState(false);
  const [voiceActivating, setVoiceActivating] = useState(false);
  const [toast, setToast] = useState("");
  const [windowMode, setWindowMode] = useState<WindowMode>(initialWindowMode);
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [brandPalette, setBrandPalette] = useState<BrandPalette>(readBrandPalette);
  const [brandSurface, setBrandSurface] = useState<BrandSurface>(readBrandSurface);
  const [largeBarMaterial, setLargeBarMaterial] = useState<BarMaterial>(() => readBarMaterial("large", "light"));
  const [compactBarMaterial, setCompactBarMaterial] = useState<BarMaterial>(() => readBarMaterial("compact", "dark"));
  const [lampPalette, setLampPalette] = useState<LampPalette>(readLampPalette);
  const [lampHexDrafts, setLampHexDrafts] = useState<LampPalette>(readLampPalette);
  const [draggingControl, setDraggingControl] = useState<ControlId | null>(null);
  const closePanelTimer = useRef<number | null>(null);
  const effortConfirmTimer = useRef<number | null>(null);
  const edgeDrag = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const fullDrag = useRef<{ pointerId: number } | null>(null);
  const controlDrag = useRef<{ pointerId: number; controlId: ControlId } | null>(null);
  const controlRows = useRef(new Map<ControlId, HTMLDivElement>());
  const flipOrigins = useRef(new Map<ControlId, DOMRect>());
  const rowAnimations = useRef(new Map<ControlId, Animation>());
  const reorderSource = useRef<"pointer" | "keyboard" | null>(null);
  const suppressEdgeClick = useRef(false);
  const previousThreadTones = useRef<ThreadToneSnapshot[] | null>(null);

  useEffect(() => {
    if (!window.codexBar) return;
    window.codexBar.getState().then(setBridge).catch(() => undefined);
    window.codexBar.getWindowMode().then(setWindowMode).catch(() => undefined);
    const unsubscribeBridge = window.codexBar.subscribe(setBridge);
    const unsubscribeWindow = window.codexBar.subscribeWindowMode(setWindowMode);
    return () => {
      unsubscribeBridge();
      unsubscribeWindow();
    };
  }, []);

  useLayoutEffect(() => {
    const previous = previousThreadTones.current;
    const next = bridge.threads.map(({ id, tone }) => ({ id, tone }));
    previousThreadTones.current = next;
    if (!soundEnabled || !previous) return;
    if (hasWorkingToCompleteTransition(previous, next)) {
      playInteractionSound("complete");
    }
  }, [bridge.threads, soundEnabled]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(query.matches);
      void window.codexBar?.setReducedMotion(query.matches);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    localStorage.setItem("codex-bar-controls-v1", JSON.stringify(controls));
  }, [controls]);

  useEffect(() => {
    localStorage.setItem("codex-bar-density-v1", String(density));
  }, [density]);

  useEffect(() => {
    localStorage.setItem("codex-bar-sound-v1", soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("aero-brand-palette-v1", brandPalette);
  }, [brandPalette]);

  useEffect(() => {
    localStorage.setItem("aero-brand-surface-v1", brandSurface);
  }, [brandSurface]);

  useEffect(() => {
    localStorage.setItem("aero-large-bar-material-v1", largeBarMaterial);
  }, [largeBarMaterial]);

  useEffect(() => {
    localStorage.setItem("aero-compact-bar-material-v1", compactBarMaterial);
  }, [compactBarMaterial]);

  useEffect(() => {
    localStorage.setItem("aero-lamp-palette-v1", JSON.stringify(lampPalette));
  }, [lampPalette]);

  useEffect(() => {
    if (!windowMode.compact) return;
    setExpanded(false);
    setPanelMounted(false);
    if (closePanelTimer.current !== null) {
      window.clearTimeout(closePanelTimer.current);
      closePanelTimer.current = null;
    }
  }, [windowMode.compact]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => () => {
    if (closePanelTimer.current !== null) window.clearTimeout(closePanelTimer.current);
    if (effortConfirmTimer.current !== null) window.clearTimeout(effortConfirmTimer.current);
    rowAnimations.current.forEach((animation) => animation.cancel());
    rowAnimations.current.clear();
  }, []);

  useLayoutEffect(() => {
    const source = reorderSource.current;
    reorderSource.current = null;
    if (source !== "pointer" || reducedMotion) {
      flipOrigins.current.clear();
      return;
    }

    for (const [controlId, element] of controlRows.current) {
      const origin = flipOrigins.current.get(controlId);
      if (!origin) continue;
      const current = element.getBoundingClientRect();
      const deltaY = origin.top - current.top;
      if (Math.abs(deltaY) < 0.5) continue;

      rowAnimations.current.get(controlId)?.cancel();
      const animation = element.animate(
        [
          { transform: `translate3d(0, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 280,
          easing: "cubic-bezier(0.2, 0.82, 0.24, 1)",
          fill: "both",
        },
      );
      rowAnimations.current.set(controlId, animation);
      animation.addEventListener("finish", () => {
        if (rowAnimations.current.get(controlId) !== animation) return;
        animation.cancel();
        rowAnimations.current.delete(controlId);
      }, { once: true });
    }
    flipOrigins.current.clear();
  }, [controls, reducedMotion]);

  const invoke = useCallback(async (action: BridgeAction, payload: Record<string, unknown> = {}) => {
    if (!window.codexBar) {
      setToast("浏览器预览模式：桌面连接器未启动");
      return undefined;
    }
    try {
      const next = await window.codexBar.invoke(action, payload);
      setBridge(next);
      return next;
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }, []);

  useEffect(() => {
    const pairing = bridge.remoteControl.pairing;
    if (!pairing || pairing.claimed || !window.codexBar) return;
    const interval = window.setInterval(() => {
      void invoke("remotePairingStatus");
    }, 2400);
    return () => window.clearInterval(interval);
  }, [bridge.remoteControl.pairing, invoke]);

  const runAction = useCallback(async (
    action: BridgeAction,
    payload: Record<string, unknown> = {},
    successMessage = "",
  ) => {
    const next = await invoke(action, payload);
    if (next && successMessage) setToast(successMessage);
    return next;
  }, [invoke]);

  const activateVoice = useCallback(async () => {
    if (!window.codexBar || voiceActivating) return;
    setVoiceActivating(true);
    try {
      await window.codexBar.activateVoice();
      setToast("Codex Voice 已打开");
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      setVoiceActivating(false);
    }
  }, [voiceActivating]);

  const visible = useMemo(() => new Set(controls.filter((item) => item.enabled).map((item) => item.id)), [controls]);
  const activeThread = bridge.threads.find((thread) => thread.id === bridge.activeThreadId) ?? bridge.threads[0] ?? demoThreads[0];
  const slots = bridge.threads.length ? bridge.threads.slice(0, 6) : bridge.connection === "connected" ? [] : demoThreads;
  const connectedLabel = bridge.connection === "connected" ? "已连接" : bridge.connection === "connecting" ? "连接中" : bridge.connection === "error" ? "连接异常" : "未连接";
  const effortOrder: ReasoningEffort[] = bridge.reasoningEfforts ?? ["low", "medium", "high", "xhigh"];
  const effort = bridge.reasoningEffort;
  const displayedEffort = pendingEffort ?? effort;
  const edgeTone = windowMode.tone === "idle" ? activeThread?.tone ?? "idle" : windowMode.tone;
  const remoteControl = bridge.remoteControl;
  const remoteEnabled = remoteControl.status === "connected" || remoteControl.status === "connecting";
  const brandPalettes: Array<{ id: BrandPalette; label: string }> = [
    { id: "air", label: "Air" },
    { id: "mint", label: "Mint" },
    { id: "sunset", label: "Sunset" },
    { id: "graphite", label: "Mono" },
  ];
  const lampStyle = {
    "--lamp-idle": lampPalette.idle,
    "--lamp-working": lampPalette.active,
    "--lamp-complete": lampPalette.complete,
    "--lamp-waiting": lampPalette.waiting,
    "--lamp-error": lampPalette.error,
    "--lamp-idle-glow": lampGlow(lampPalette.idle, .08),
    "--lamp-active-glow": lampGlow(lampPalette.active, .1),
    "--lamp-complete-glow": lampGlow(lampPalette.complete, .08),
    "--lamp-waiting-glow": lampGlow(lampPalette.waiting, .08),
    "--lamp-error-glow": lampGlow(lampPalette.error, .09),
  } as CSSProperties & Record<string, string>;

  const setLampColor = (tone: ThreadTone, value: string) => {
    const color = normalizeLampColor(value);
    if (!color) return false;
    setLampPalette((current) => ({ ...current, [tone]: color }));
    setLampHexDrafts((current) => ({ ...current, [tone]: color }));
    return true;
  };

  const resetLampColors = () => {
    setLampPalette({ ...defaultLampPalette });
    setLampHexDrafts({ ...defaultLampPalette });
  };

  const selectEffort = async (next: ReasoningEffort) => {
    if (next === effort || pendingEffort) return;
    setPendingEffort(next);
    const updated = await invoke("setReasoningEffort", { effort: next });
    setPendingEffort(null);
    if (!updated) return;
    setEffortConfirming(true);
    if (effortConfirmTimer.current !== null) window.clearTimeout(effortConfirmTimer.current);
    effortConfirmTimer.current = window.setTimeout(() => {
      setEffortConfirming(false);
      effortConfirmTimer.current = null;
    }, 320);
    setToast(`推理档位已切换为 ${next === "xhigh" ? "XHigh" : next[0].toUpperCase() + next.slice(1)}`);
  };

  const toggleExpanded = () => {
    if (closePanelTimer.current !== null) {
      window.clearTimeout(closePanelTimer.current);
      closePanelTimer.current = null;
    }

    if (expanded) {
      setExpanded(false);
      void window.codexBar?.setExpanded(false);
      closePanelTimer.current = window.setTimeout(() => {
        setPanelMounted(false);
        closePanelTimer.current = null;
      }, 280);
      return;
    }

    setPanelMounted(true);
    void window.codexBar?.setExpanded(true);
    window.requestAnimationFrame(() => setExpanded(true));
  };

  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    if (!expanded) toggleExpanded();
  };

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>("button, [role='switch']");
    if (!control || control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return;

    control.dataset.pressing = "true";
    const release = () => {
      delete control.dataset.pressing;
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });

    if (!soundEnabled) return;
    playInteractionSound((control.dataset.sound as InteractionSound | undefined) ?? "press");
  }, [soundEnabled]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!soundEnabled || event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>("button, [role='switch']");
    if (!control || control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return;
    playInteractionSound((control.dataset.sound as InteractionSound | undefined) ?? "press");
  }, [soundEnabled]);

  const toggleSound = () => {
    if (!soundEnabled) playInteractionSound("confirm");
    setSoundEnabled((current) => !current);
  };

  const setCompactView = async (compact: boolean) => {
    if (compact) {
      setExpanded(false);
      setPanelMounted(false);
      if (closePanelTimer.current !== null) {
        window.clearTimeout(closePanelTimer.current);
        closePanelTimer.current = null;
      }
    }
    if (!window.codexBar) {
      setWindowMode((current) => ({ ...current, compact, hidden: false, edge: null }));
      return;
    }
    const next = await window.codexBar.setCompact(compact);
    setWindowMode(next);
  };

  const toggleControl = (id: ControlId) => {
    setControls((current) => current.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };

  const beginControlDrag = (event: ReactPointerEvent<HTMLButtonElement>, controlId: ControlId) => {
    if (event.button !== 0 || controlDrag.current) return;
    controlDrag.current = { pointerId: event.pointerId, controlId };
    setDraggingControl(controlId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveControlDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = controlDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-control-id]")
      ?.dataset.controlId as ControlId | undefined;
    if (!target || target === drag.controlId) return;
    flipOrigins.current = new Map(
      Array.from(controlRows.current, ([controlId, element]) => [controlId, element.getBoundingClientRect()]),
    );
    reorderSource.current = "pointer";
    setControls((current) => reorderControls(current, drag.controlId, target));
  };

  const finishControlDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = controlDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    controlDrag.current = null;
    setDraggingControl(null);
  };

  const handleControlDragKey = (event: ReactKeyboardEvent<HTMLButtonElement>, controlId: ControlId) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    reorderSource.current = "keyboard";
    setControls((current) => moveControlBy(current, controlId, event.key === "ArrowUp" ? -1 : 1));
    if (soundEnabled) playInteractionSound("tick");
  };

  const handleEdgePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !window.codexBar) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    edgeDrag.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    window.codexBar.edgeDrag("start", { screenX: event.screenX, screenY: event.screenY });
  };

  const handleFullPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !window.codexBar) return;
    if (event.target instanceof Element && event.target.closest("button, input, [role='switch']")) return;
    fullDrag.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    window.codexBar.fullDrag("start", { screenX: event.screenX, screenY: event.screenY });
  };

  const handleFullPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (fullDrag.current?.pointerId !== event.pointerId || !window.codexBar) return;
    window.codexBar.fullDrag("move", { screenX: event.screenX, screenY: event.screenY });
  };

  const finishFullDrag = (event: ReactPointerEvent<HTMLElement>, phase: "end" | "cancel") => {
    if (fullDrag.current?.pointerId !== event.pointerId || !window.codexBar) return;
    window.codexBar.fullDrag(phase, { screenX: event.screenX, screenY: event.screenY });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    fullDrag.current = null;
  };

  const handleEdgePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = edgeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !window.codexBar) return;
    if (Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) > 5) drag.moved = true;
    window.codexBar.edgeDrag("move", { screenX: event.screenX, screenY: event.screenY });
  };

  const finishEdgeDrag = (event: ReactPointerEvent<HTMLElement>, phase: "end" | "cancel") => {
    const drag = edgeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !window.codexBar) return;
    suppressEdgeClick.current = drag.moved;
    if (drag.moved) window.setTimeout(() => { suppressEdgeClick.current = false; }, 0);
    window.codexBar.edgeDrag(phase, { screenX: event.screenX, screenY: event.screenY });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    edgeDrag.current = null;
  };

  const selectThread = useCallback((thread: CodexThread) => {
    setBridge((current) => ({
      ...current,
      activeThreadId: thread.id,
      activeTurnId: null,
      threads: current.threads.map((item) => (
        item.id === thread.id && (item.tone === "complete" || item.tone === "error")
          ? { ...item, tone: "idle" }
          : item
      )),
    }));
    void invoke("selectThread", { threadId: thread.id });
  }, [invoke]);

  const renderControl = (id: ControlId) => {
    if (!visible.has(id)) return null;
    switch (id) {
      case "brand":
        return (
          <div className="brand-mark" title="Aero" aria-label="Aero">
            <BrandMark palette={brandPalette} surface={brandSurface} size={34} />
          </div>
        );
      case "connection":
        return (
          <button className="connection-control" onClick={() => invoke(bridge.connection === "connected" ? "refresh" : "connect")} title={bridge.error || bridge.binaryPath || connectedLabel}>
            <CodexIcon name="lightning-outline" size={16} />
            <StatusDot state={bridge.connection} />
            <span>{connectedLabel}</span>
          </button>
        );
      case "threadSlots":
        return (
          <div className="thread-slots" aria-label="最近任务状态">
            {Array.from({ length: 6 }, (_, index) => (
              <ThreadLens key={slots[index]?.id ?? index} thread={slots[index]} index={index} selected={slots[index]?.id === activeThread?.id} onSelect={() => slots[index] && selectThread(slots[index])} />
            ))}
          </div>
        );
      case "activeTask":
        return (
          <button className="active-task" onClick={() => invoke("openCodex")} title={`${activeThread?.name ?? "Codex"}\n${activeThread?.preview ?? ""}`}>
            <strong>{activeThread?.name ?? "Codex"}</strong>
            <span>{activeThread?.preview || "等待任务"}</span>
          </button>
        );
      case "reasoning":
        return (
          <div
            className={`reasoning-control ${effortConfirming ? "is-confirming" : ""} ${pendingEffort ? "is-pending" : ""}`}
            title={`推理强度：${effort}`}
            style={{ "--effort-index": Math.max(0, effortOrder.indexOf(displayedEffort)), "--effort-count": effortOrder.length } as CSSProperties}
          >
            <CodexIcon name="brain-medium" size={17} />
            <div className="reasoning-segments" role="group" aria-label="推理强度" aria-busy={Boolean(pendingEffort)}>
              <span className="reasoning-indicator" aria-hidden="true" />
              {effortOrder.map((option) => (
                <button
                  key={option}
                  className={option === displayedEffort ? "selected" : ""}
                  data-sound="tick"
                  aria-pressed={option === displayedEffort}
                  aria-label={option === "xhigh" ? "超高推理强度" : `${option} 推理强度`}
                  disabled={Boolean(pendingEffort)}
                  onClick={() => void selectEffort(option)}
                >
                  {option === "xhigh" ? "XH" : option === "max" ? "MAX" : option === "minimal" ? "MIN" : option.slice(0, 1).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        );
      case "newTask":
        return <IconButton label="新建任务" onClick={() => invoke("newThread")}><CodexIcon name="compose" /></IconButton>;
      case "continue":
        return <IconButton label="继续当前任务" disabled={bridge.connection !== "connected"} onClick={() => invoke("continue", { effort })}><CodexIcon name="play-outline" /></IconButton>;
      case "interrupt":
        return <IconButton label="中断当前任务" danger sound="destructive" active={Boolean(bridge.activeTurnId)} disabled={bridge.connection !== "connected"} onClick={() => invoke("interrupt")}><CodexIcon name="x-circle" /></IconButton>;
      case "approve":
        return <IconButton label="批准请求" sound="confirm" active={Boolean(bridge.pendingApproval)} disabled={!bridge.pendingApproval} onClick={() => invoke("approval", { decision: "accept" })}><CodexIcon name="check-circle" /></IconButton>;
      case "reject":
        return <IconButton label="拒绝请求" danger sound="destructive" disabled={!bridge.pendingApproval} onClick={() => invoke("approval", { decision: "decline" })}><CodexIcon name="x-circle" /></IconButton>;
      case "voice":
        return <IconButton label={voiceActivating ? "正在打开 Codex Voice" : "打开 Codex Voice"} active={voiceActivating} disabled={voiceActivating} sound="confirm" onClick={() => void activateVoice()}><CodexIcon name="mic" /></IconButton>;
      case "project":
        return <IconButton label="切换到下一个项目" disabled={bridge.connection !== "connected"} onClick={() => invoke("cycleProject")}><CodexIcon name="folder-git" /></IconButton>;
      case "openCodex":
        return <IconButton label="打开 Codex" onClick={() => invoke("openCodex")}><CodexIcon name="codex" /></IconButton>;
      case "forkTask":
        return <IconButton label="继续到新任务" disabled={bridge.connection !== "connected"} onClick={() => runAction("forkThread")}><CodexIcon name="branch" /></IconButton>;
      case "copyMarkdown":
        return <IconButton label="复制当前任务为 Markdown" disabled={bridge.connection !== "connected"} onClick={() => runAction("copyMarkdown", {}, "已复制 Markdown")}><CodexIcon name="download" /></IconButton>;
      case "archiveTask":
        return (
          <IconButton
            label="归档当前任务"
            danger
            sound="destructive"
            disabled={bridge.connection !== "connected"}
            onClick={() => {
              if (window.confirm(`归档“${activeThread?.name ?? "当前任务"}”？`)) {
                void runAction("archiveThread", {}, "任务已归档");
              }
            }}
          >
            <CodexIcon name="trash" />
          </IconButton>
        );
      case "openSettings":
        return <IconButton label="打开 Codex 设置" onClick={() => invoke("openSettings")}><CodexIcon name="settings" /></IconButton>;
      case "openFolder":
        return <IconButton label="打开当前工作目录" onClick={() => invoke("openFolder")}><CodexIcon name="folder-plus" /></IconButton>;
      case "openTerminal":
        return <IconButton label="在当前目录打开终端" onClick={() => invoke("openTerminal")}><CodexIcon name="terminal" /></IconButton>;
      case "openDocs":
        return <IconButton label="打开 Codex 官方文档" onClick={() => invoke("openDocs")}><CodexIcon name="openai" /></IconButton>;
    }
  };

  return (
    <main
      className={`app density-${densityMap[density as keyof typeof densityMap]} view-${windowMode.compact ? "compact" : "full"} large-material-${largeBarMaterial} compact-material-${compactBarMaterial} ${windowMode.edge ? `edge-${windowMode.edge}` : ""}`}
      style={lampStyle}
      data-sound={soundEnabled ? "on" : "off"}
      onPointerDownCapture={handlePointerDown}
      onKeyDownCapture={handleKeyDown}
      onMouseEnter={() => {
        if (!windowMode.compact) void window.codexBar?.setPointerPresence(true);
      }}
      onMouseLeave={() => {
        if (!windowMode.compact) void window.codexBar?.setPointerPresence(false);
      }}
    >
      <section
        className={`floating-rail ${windowMode.dragging ? "is-dragging" : ""}`}
        onPointerDown={handleFullPointerDown}
        onPointerMove={handleFullPointerMove}
        onPointerUp={(event) => finishFullDrag(event, "end")}
        onPointerCancel={(event) => finishFullDrag(event, "cancel")}
      >
        <div className="rail-content">
          {controls.map((control) => <div className={`control-slot slot-${control.id}`} key={control.id}>{renderControl(control.id)}</div>)}
        </div>
        <div className="window-controls">
          <IconButton className="compact-trigger" label="切换到迷你状态栏" onClick={() => void setCompactView(true)}><CodexIcon name="all-products" size={17} /></IconButton>
          <IconButton className="settings-trigger" label="自定义控件" active={expanded} onClick={toggleExpanded}><CodexIcon name="settings" size={18} /></IconButton>
          <button className="close-button" aria-label="隐藏到系统托盘" title="隐藏到系统托盘" onClick={() => window.codexBar?.close()}><CodexIcon name="x" size={14} /></button>
        </div>
      </section>

      {panelMounted && (
        <section className={`customizer ${expanded ? "is-open" : "is-closed"}`} aria-label="自定义控件" aria-hidden={!expanded} inert={!expanded}>
          <header className="customizer-header">
            <div>
              <h1>Aero</h1>
              <p>为 Codex Desktop 设计的轻量桌面伴侣</p>
            </div>
            <div className="customizer-actions">
              <button
                className={`plain-icon ${soundEnabled ? "active" : ""}`}
                data-sound="confirm"
                aria-label={soundEnabled ? "关闭按键声音" : "开启按键声音"}
                aria-pressed={soundEnabled}
                title={soundEnabled ? "按键声音：开" : "按键声音：关"}
                onClick={toggleSound}
              >
                {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <button className="plain-icon" aria-label="收起自定义面板" onClick={toggleExpanded}><ChevronDown size={18} /></button>
            </div>
          </header>

          <nav className="settings-tabs" aria-label="设置分类">
            {([
              ["appearance", "paint", "外观"],
              ["controls", "all-products", "控件"],
              ["voice", "mic", "语音"],
              ["connections", "pointer-outline", "连接"],
            ] as Array<[SettingsTab, CodexIconName, string]>).map(([id, icon, label]) => (
              <button
                key={id}
                className={settingsTab === id ? "active" : ""}
                data-sound="tick"
                aria-pressed={settingsTab === id}
                onClick={() => setSettingsTab(id)}
              >
                <CodexIcon name={icon} size={15} />
                {label}
              </button>
            ))}
          </nav>

          {settingsTab === "appearance" && (
            <section className="appearance-panel" aria-label="外观设置">
              <article className="settings-card appearance-options">
                <div className="setting-row">
                  <span><strong>控制栏外观</strong><small>完整控制栏的明暗风格</small></span>
                  <div className="segmented-setting material-segments" role="group" aria-label="大 Bar 材质">
                    <button className={largeBarMaterial === "light" ? "active" : ""} data-sound="tick" aria-pressed={largeBarMaterial === "light"} onClick={() => setLargeBarMaterial("light")}>冷白</button>
                    <button className={largeBarMaterial === "dark" ? "active" : ""} data-sound="tick" aria-pressed={largeBarMaterial === "dark"} onClick={() => setLargeBarMaterial("dark")}>深色</button>
                  </div>
                </div>
                <div className="setting-row">
                  <span><strong>迷你栏外观</strong><small>状态栏的明暗风格</small></span>
                  <div className="segmented-setting material-segments" role="group" aria-label="小 Bar 材质">
                    <button className={compactBarMaterial === "light" ? "active" : ""} data-sound="tick" aria-pressed={compactBarMaterial === "light"} onClick={() => setCompactBarMaterial("light")}>冷白</button>
                    <button className={compactBarMaterial === "dark" ? "active" : ""} data-sound="tick" aria-pressed={compactBarMaterial === "dark"} onClick={() => setCompactBarMaterial("dark")}>深色</button>
                  </div>
                </div>
                <div className="setting-row">
                  <span><strong>界面密度</strong><small>让控制栏更紧凑，或更舒展</small></span>
                  <div className="segmented-setting density-segments" role="group" aria-label="界面密度">
                    {["紧凑", "平衡", "舒展"].map((label, value) => (
                      <button key={label} className={density === value ? "active" : ""} data-sound="tick" aria-pressed={density === value} onClick={() => setDensity(value)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span><strong>交互声音</strong><small>为每次轻触添一点回应</small></span>
                  <button
                    className={`switch ${soundEnabled ? "on" : ""}`}
                    data-sound="confirm"
                    role="switch"
                    aria-checked={soundEnabled}
                    aria-label={soundEnabled ? "关闭按键声音" : "开启按键声音"}
                    onClick={toggleSound}
                  >
                    <span />
                  </button>
                </div>
              </article>

              <SettingsDisclosure title="标志与配色" description="选择喜欢的色彩与标志风格">
                <article className="settings-card brand-showcase">
                  <BrandMark palette={brandPalette} surface={brandSurface} size={76} />
                  <span><strong>Aero</strong><small>流动、状态与轻量控制</small></span>
                </article>
                <article className="settings-card palette-card">
                  <div className="settings-card-heading">
                    <span><strong>标志配色</strong><small>主 Bar 与设置页同步</small></span>
                    <span className="setting-value">{brandPalettes.find(item => item.id === brandPalette)?.label}</span>
                  </div>
                  <div className="palette-options">
                    {brandPalettes.map(palette => (
                      <button key={palette.id} className={brandPalette === palette.id ? "active" : ""}
                        data-sound="tick" aria-label={`使用 ${palette.label} 配色`}
                        aria-pressed={brandPalette === palette.id} onClick={() => setBrandPalette(palette.id)}>
                        <BrandMark palette={palette.id} surface="clear" size={28} />
                        <span>{palette.label}</span>
                      </button>
                    ))}
                  </div>
                </article>
                <div className="setting-row">
                  <span><strong>标志底色</strong><small>柔和卡片，或只保留标志</small></span>
                  <div className="segmented-setting" role="group" aria-label="标志底色">
                    <button className={brandSurface === "soft" ? "active" : ""} data-sound="tick" aria-pressed={brandSurface === "soft"} onClick={() => setBrandSurface("soft")}>柔和</button>
                    <button className={brandSurface === "clear" ? "active" : ""} data-sound="tick" aria-pressed={brandSurface === "clear"} onClick={() => setBrandSurface("clear")}>透明</button>
                  </div>
                </div>
              </SettingsDisclosure>

              <SettingsDisclosure title="状态灯颜色" description="了解五种状态，或调出自己的颜色">
              <article className="settings-card lamp-color-card">
                <div className="settings-card-heading">
                  <span><strong>状态灯颜色</strong><small>默认遵循 Codex 五种状态；自定义会实时同步到大 Bar 与小 Bar。</small></span>
                  <button className="lamp-reset" data-sound="tick" onClick={resetLampColors}>恢复默认</button>
                </div>
                <div className="lamp-color-grid">
                  {lampStatusMeta.map(({ tone, label, detail }) => (
                    <section className="lamp-color-item" key={tone}>
                      <div className="lamp-color-copy">
                        <span className="lamp-color-preview" style={{ "--lamp-swatch": lampPalette[tone] } as CSSProperties} />
                        <span><strong>{label}</strong><small>{detail}</small></span>
                      </div>
                      <div className="lamp-preset-row" role="group" aria-label={`${label} 预设颜色`}>
                        {lampColorPresets.map((color) => (
                          <button
                            key={color}
                            className={lampPalette[tone] === color ? "active" : ""}
                            style={{ "--lamp-swatch": color } as CSSProperties}
                            data-sound="tick"
                            aria-label={`将${label}设为${color}`}
                            aria-pressed={lampPalette[tone] === color}
                            onClick={() => setLampColor(tone, color)}
                          />
                        ))}
                      </div>
                      <label className="lamp-hex-field">
                        <span>HEX</span>
                        <input
                          value={lampHexDrafts[tone]}
                          maxLength={7}
                          inputMode="text"
                          spellCheck={false}
                          aria-label={`${label} 颜色代码`}
                          onChange={(event) => setLampHexDrafts((current) => ({ ...current, [tone]: event.target.value }))}
                          onBlur={() => {
                            if (!setLampColor(tone, lampHexDrafts[tone])) {
                              setLampHexDrafts((current) => ({ ...current, [tone]: lampPalette[tone] }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      </label>
                    </section>
                  ))}
                </div>
              </article>
              </SettingsDisclosure>
            </section>
          )}

          {settingsTab === "connections" && (
            <section className="connections-panel" aria-label="实验连接">
              <div className="experimental-note">
                <span className="experimental-note-icon"><CodexIcon name="pointer-outline" size={18} /></span>
                <span><strong>跨设备连接</strong><small>管理 Codex 的远程设备。只在这台电脑使用 AERO 时，无需开启。</small></span>
                <span className="experimental-badge">Experimental</span>
              </div>

          <section className="remote-card" aria-label="Codex 远程控制">
            <div className="remote-card-heading">
              <span className={`remote-card-icon ${remoteControl.status}`}>
                <CodexIcon name="pointer-outline" size={19} />
              </span>
              <span>
                <strong>Remote Control</strong>
                <small>{remoteStatusLabels[remoteControl.status]}{remoteControl.serverName ? ` · ${remoteControl.serverName}` : ""}</small>
              </span>
              <button
                className={`switch ${remoteEnabled ? "on" : ""}`}
                data-sound="tick"
                role="switch"
                aria-checked={remoteEnabled}
                aria-label={remoteEnabled ? "关闭 Codex 远程控制" : "启用 Codex 远程控制"}
                disabled={remoteControl.status === "connecting"}
                onClick={() => runAction(remoteEnabled ? "remoteDisable" : "remoteEnable")}
              >
                <span />
              </button>
            </div>

            <div className="remote-card-actions">
              <button disabled={!remoteEnabled} onClick={() => runAction("remotePairingStart")}>
                <CodexIcon name="all-products" size={16} />
                配对设备
              </button>
              <button disabled={!remoteEnabled} onClick={() => runAction("remoteClients")}>
                <CodexIcon name="lightning-outline" size={16} />
                {remoteControl.clients.length ? `${remoteControl.clients.length} 台设备` : "刷新设备"}
              </button>
              <button onClick={() => runAction("remoteStatus")}>
                <CodexIcon name="clock" size={16} />
                检查状态
              </button>
            </div>

            {remoteControl.pairing && (
              <div className={`pairing-card ${remoteControl.pairing.claimed ? "claimed" : ""}`}>
                <span>
                  <small>{remoteControl.pairing.claimed ? "已完成配对" : "配对码"}</small>
                  <strong>{remoteControl.pairing.manualPairingCode || remoteControl.pairing.pairingCode}</strong>
                </span>
                <CodexIcon name={remoteControl.pairing.claimed ? "check-circle" : "clock"} size={19} />
              </div>
            )}

            {remoteControl.clients.length > 0 && (
              <div className="remote-client-list">
                {remoteControl.clients.map((client) => (
                  <div className="remote-client" key={client.clientId}>
                    <CodexIcon name="pointer-outline" size={15} />
                    <span>
                      <strong>{client.displayName || client.deviceModel || "已配对设备"}</strong>
                      <small>{[client.platform, client.appVersion].filter(Boolean).join(" · ") || client.clientId.slice(0, 8)}</small>
                    </span>
                    <button
                      className="remote-revoke"
                      aria-label={`撤销 ${client.displayName || "设备"} 的配对`}
                      title="撤销配对"
                      onClick={() => {
                        if (window.confirm(`撤销“${client.displayName || client.deviceModel || "该设备"}”的远程控制权限？`)) {
                          void runAction("remoteRevoke", { clientId: client.clientId }, "已撤销设备");
                        }
                      }}
                    >
                      <CodexIcon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {remoteControl.error && <p className="remote-error">{remoteControl.error}</p>}
          </section>
            </section>
          )}

          {settingsTab === "voice" && <WakeSettings />}

          {settingsTab === "controls" && (
          <div className="control-table">
            <div className="table-head"><span>拖拽排列控件</span><span>来源</span><span>显示</span></div>
            {controls.map((control, index) => {
              const meta = controlMeta[control.id];
              return (
                <div
                  className={`control-row ${draggingControl === control.id ? "is-dragging" : ""}`}
                  data-control-id={control.id}
                  key={control.id}
                  ref={(element) => {
                    if (element) controlRows.current.set(control.id, element);
                    else controlRows.current.delete(control.id);
                  }}
                  style={{ "--row-index": index } as CSSProperties}
                >
                  <button
                    className="drag-handle"
                    data-sound="tick"
                    aria-label={`拖动${meta.label}；也可使用上下方向键`}
                    aria-grabbed={draggingControl === control.id}
                    onPointerDown={(event) => beginControlDrag(event, control.id)}
                    onPointerMove={moveControlDrag}
                    onPointerUp={finishControlDrag}
                    onPointerCancel={finishControlDrag}
                    onKeyDown={(event) => handleControlDragKey(event, control.id)}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span className="control-preview">
                    {control.id === "brand"
                      ? <BrandMark palette={brandPalette} surface="clear" size={22} />
                      : <CodexIcon name={meta.icon} size={18} />}
                  </span>
                  <span className="control-copy"><strong>{meta.label}</strong><small>{meta.detail}</small></span>
                  <span className={`support-badge ${meta.support}`}>{supportLabels[meta.support]}</span>
                  <button
                    className={`switch ${control.enabled ? "on" : ""}`}
                    data-sound="tick"
                    role="switch"
                    aria-checked={control.enabled}
                    aria-label={`${control.enabled ? "隐藏" : "显示"}${meta.label}`}
                    disabled={meta.support === "planned"}
                    onClick={() => toggleControl(control.id)}
                  >
                    <span />
                  </button>
                </div>
              );
            })}
          </div>
          )}
        </section>
      )}

      {bridge.pendingApproval && <div className="approval-toast"><span className="approval-lens" /><strong>Codex 等待批准</strong><span>{bridge.pendingApproval.title}</span></div>}
      {toast && <div className="toast">{toast}</div>}
      <div
        className={`compact-monitor ${edgeTone} ${windowMode.burst ? "burst" : ""} ${windowMode.dragging ? "dragging" : ""}`}
        aria-label="Codex 迷你线程状态栏"
        title="拖动到任意位置；靠近边缘时自动吸附"
        onPointerDown={handleEdgePointerDown}
        onPointerMove={handleEdgePointerMove}
        onPointerUp={(event) => finishEdgeDrag(event, "end")}
        onPointerCancel={(event) => finishEdgeDrag(event, "cancel")}
        onPointerEnter={() => void window.codexBar?.setEdgePointerPresence(true)}
        onPointerLeave={() => void window.codexBar?.setEdgePointerPresence(false)}
      >
        <span className="compact-bar-surface">
          {Array.from({ length: 6 }, (_, index) => {
            const thread = slots[index];
            const tone = thread?.tone ?? "idle";
            const selected = thread?.id === activeThread?.id;
            const updated = windowMode.burst && windowMode.slot === index + 1;
            return (
              <button
                key={thread?.id ?? `compact-slot-${index}`}
                className={`edge-thread-light ${tone} ${selected ? "selected" : ""} ${updated ? "is-updated" : ""}`}
                data-sound="tick"
                data-slot={index + 1}
                disabled={!thread}
                aria-pressed={selected}
                aria-label={thread ? `${index + 1}. ${workspaceNameFromCwd(thread.cwd)} · ${thread.name}，${toneLabels[tone]}` : `空任务槽位 ${index + 1}`}
                aria-describedby={thread ? `thread-tooltip-compact-${index}` : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!thread) return;
                  if (suppressEdgeClick.current) {
                    suppressEdgeClick.current = false;
                    return;
                  }
                  selectThread(thread);
                }}
              >
                <ThreadTooltip id={`thread-tooltip-compact-${index}`} thread={thread} />
              </button>
            );
          })}
          <button
            className="compact-return"
            data-sound="confirm"
            aria-label="返回完整控制栏"
            title="返回完整控制栏"
            onClick={(event) => {
              event.stopPropagation();
              void setCompactView(false);
            }}
          >
            <CodexIcon name="all-products" size={14} />
          </button>
        </span>
      </div>
    </main>
  );
}

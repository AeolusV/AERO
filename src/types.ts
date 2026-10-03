export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type ThreadTone = "idle" | "active" | "waiting" | "error" | "complete";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type ScreenEdge = "left" | "right" | "top" | "bottom";

export type CodexThread = {
  id: string;
  name: string;
  preview: string;
  cwd: string;
  rolloutPath?: string;
  updatedAt?: number;
  tone: ThreadTone;
  status?: {
    type?: string;
    activeFlags?: string[];
  } | string | null;
  reasoningEffort?: ReasoningEffort | null;
};

export type PendingApproval = {
  requestId: string | number;
  method: string;
  title: string;
  detail: string;
  threadId?: string;
};

export type RemoteControlStatus = "disabled" | "connecting" | "connected" | "errored" | "unavailable";

export type RemoteControlClient = {
  clientId: string;
  displayName: string | null;
  deviceType: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  appVersion: string | null;
  lastSeenAt: number | string | null;
};

export type RemoteControlPairing = {
  pairingCode: string;
  manualPairingCode: string | null;
  environmentId: string;
  expiresAt: number | string;
  claimed: boolean;
};

export type RemoteControlState = {
  status: RemoteControlStatus;
  serverName: string;
  installationId: string;
  environmentId: string | null;
  clients: RemoteControlClient[];
  pairing: RemoteControlPairing | null;
  error: string;
};

export type BridgeState = {
  connection: ConnectionState;
  error: string;
  binaryPath: string;
  threads: CodexThread[];
  activeThreadId: string | null;
  activeTurnId: string | null;
  reasoningEffort: ReasoningEffort;
  reasoningEfforts?: ReasoningEffort[];
  pendingApproval: PendingApproval | null;
  remoteControl: RemoteControlState;
};

export type BridgeAction =
  | "connect"
  | "refresh"
  | "selectThread"
  | "newThread"
  | "setReasoningEffort"
  | "continue"
  | "interrupt"
  | "approval"
  | "openCodex"
  | "openSettings"
  | "cycleProject"
  | "forkThread"
  | "archiveThread"
  | "copyMarkdown"
  | "openFolder"
  | "openTerminal"
  | "openDocs"
  | "remoteStatus"
  | "remoteEnable"
  | "remoteDisable"
  | "remotePairingStart"
  | "remotePairingStatus"
  | "remoteClients"
  | "remoteRevoke";

export type WindowMode = {
  edge: ScreenEdge | null;
  compact: boolean;
  hidden: boolean;
  burst: boolean;
  dragging: boolean;
  tone: ThreadTone;
  slot: number | null;
  label: string;
};

export type WakeListenerStatus =
  | "testing"
  | "test-passed"
  | "test-timeout"
  | "disabled"
  | "stopped"
  | "starting"
  | "listening"
  | "stopping"
  | "triggered"
  | "handed-off"
  | "error";

export type WakeInputDevice = {
  id: string;
  index: number;
  name: string;
  hostApi: string;
  channels?: number;
  defaultSampleRate?: number;
};

export type WakeConfig = {
  version: number;
  enabled: boolean;
  wakePhrase: string;
  pythonPath: string;
  modelPath: string;
  inputDevice: WakeInputDevice | number | null;
  sampleRate: number;
  hotkey: "Ctrl+Shift+V";
  diagnosticTranscripts: boolean;
};

export type WakeListenerState = {
  status: WakeListenerStatus;
  message: string;
  pid: number | null;
  device: WakeInputDevice | null;
  lastEventAt: string | null;
  config: WakeConfig;
  logPath: string;
};

export type WakeCheckResult = {
  modelPath: string;
  deviceIndex: number | null;
  device: WakeInputDevice | null;
};

export type WakeRuntimeStatus = "idle" | "checking" | "downloading" | "installing" | "verifying" | "ready" | "error";

export type WakeRuntimeState = {
  status: WakeRuntimeStatus;
  progress: number;
  message: string;
  pythonPath: string;
  modelPath: string;
  runtimeRoot: string;
};

export type WakeRuntimeInstallResult = {
  runtime: WakeRuntimeState;
  wake: WakeListenerState;
};

export type ControlId =
  | "brand"
  | "connection"
  | "threadSlots"
  | "activeTask"
  | "reasoning"
  | "newTask"
  | "continue"
  | "interrupt"
  | "approve"
  | "reject"
  | "voice"
  | "project"
  | "openCodex"
  | "forkTask"
  | "copyMarkdown"
  | "archiveTask"
  | "openSettings"
  | "openFolder"
  | "openTerminal"
  | "openDocs";

export type ControlPreference = {
  id: ControlId;
  enabled: boolean;
};

export type CodexBarApi = {
  getState: () => Promise<BridgeState>;
  getWindowMode: () => Promise<WindowMode>;
  invoke: (action: BridgeAction, payload?: Record<string, unknown>) => Promise<BridgeState>;
  subscribe: (listener: (state: BridgeState) => void) => () => void;
  subscribeWindowMode: (listener: (state: WindowMode) => void) => () => void;
  setReducedMotion: (reduced: boolean) => Promise<void>;
  setPointerPresence: (present: boolean) => Promise<void>;
  setEdgePointerPresence: (present: boolean) => Promise<void>;
  reveal: () => Promise<void>;
  edgeDrag: (phase: "start" | "move" | "end" | "cancel", point: { screenX: number; screenY: number }) => void;
  fullDrag: (phase: "start" | "move" | "end" | "cancel", point: { screenX: number; screenY: number }) => void;
  setCompact: (compact: boolean) => Promise<WindowMode>;
  setExpanded: (expanded: boolean) => Promise<void>;
  close: () => Promise<void>;
  getWakeState: () => Promise<WakeListenerState>;
  saveWakeConfig: (patch: Partial<WakeConfig>) => Promise<WakeListenerState>;
  setWakeEnabled: (enabled: boolean) => Promise<WakeListenerState>;
  startWake: () => Promise<WakeListenerState>;
  testWake: () => Promise<WakeListenerState>;
  stopWake: () => Promise<WakeListenerState>;
  activateVoice: () => Promise<WakeListenerState>;
  listWakeDevices: () => Promise<WakeInputDevice[]>;
  checkWake: () => Promise<WakeCheckResult>;
  openWakeLog: () => Promise<string>;
  chooseWakePython: () => Promise<string | null>;
  chooseWakeModel: () => Promise<string | null>;
  getWakeRuntimeState: () => Promise<WakeRuntimeState>;
  installWakeRuntime: () => Promise<WakeRuntimeInstallResult>;
  subscribeWakeState: (listener: (state: WakeListenerState) => void) => () => void;
  subscribeWakeRuntimeState: (listener: (state: WakeRuntimeState) => void) => () => void;
};

declare global {
  interface Window {
    codexBar?: CodexBarApi;
  }
}

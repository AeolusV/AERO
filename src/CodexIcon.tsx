import type { CSSProperties } from "react";

export type CodexIconName =
  | "all-products"
  | "branch"
  | "brain-medium"
  | "brain-outline"
  | "bug"
  | "check"
  | "check-circle"
  | "clock"
  | "cloud-upload"
  | "codex"
  | "compose"
  | "confetti"
  | "cursor"
  | "diff"
  | "download"
  | "flask"
  | "folder"
  | "folder-git"
  | "folder-plus"
  | "lightning"
  | "lightning-outline"
  | "mic"
  | "openai"
  | "paint"
  | "play"
  | "play-outline"
  | "pointer-outline"
  | "pull-request"
  | "pull-request-draft"
  | "pull-request-merged"
  | "settings"
  | "star"
  | "terminal"
  | "trash"
  | "x"
  | "x-circle";

export function CodexIcon({
  name,
  size = 20,
  className = "",
}: {
  name: CodexIconName;
  size?: number;
  className?: string;
}) {
  const source = `url("./codex-icons/${name}.svg")`;
  const style = {
    width: size,
    height: size,
    WebkitMaskImage: source,
    maskImage: source,
  } as CSSProperties;

  return <span className={`codex-icon ${className}`} style={style} aria-hidden="true" />;
}

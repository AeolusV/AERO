export function workspaceNameFromCwd(cwd?: string) {
  const normalized = String(cwd ?? "").trim().replace(/[\\/]+$/, "");
  const name = normalized.split(/[\\/]/).filter(Boolean).at(-1);
  return name && name !== "." ? name : "Codex 工作区";
}

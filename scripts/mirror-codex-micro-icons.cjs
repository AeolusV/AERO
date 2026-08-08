const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "research", "codex-desktop-26.715.10079", "webview", "assets");
const keycapPreview = path.join(sourceRoot, "codex-micro-keycap-preview-B8ae6Qrb.js");
const outputRoot = path.join(projectRoot, "public", "codex-icons");

const iconSources = {
  "all-products": { file: keycapPreview, variable: "Be" },
  branch: { file: "branch-BhFdFVXs.js", variable: "i" },
  "brain-medium": { file: keycapPreview, variable: "Ue" },
  "brain-outline": { file: "reasoning-minimal-16gvI2L7.js", variable: "i" },
  bug: { file: keycapPreview, variable: "Ge" },
  check: { file: "check-lg-yAelK4fg.js", variable: "i" },
  "check-circle": { file: "check-circle-DiLHxgMj.js", variable: "i" },
  clock: { file: "clock-tGPSbttX.js", variable: "i" },
  "cloud-upload": { file: "send-to-cloud-Da6fmNQk.js", variable: "i" },
  codex: { file: "codex-B9QwqP5X.js", variable: "i" },
  compose: { file: "compose-CbSq3dOj.js", variable: "i" },
  confetti: { file: keycapPreview, variable: "qe" },
  cursor: { file: "cursor-D-L4qANK.js", variable: "i" },
  diff: { file: "diff-C33dKAMO.js", variable: "i" },
  download: { file: "download-CWo9EqH8.js", variable: "i" },
  flask: { file: "flask-DzKVn9ek.js", variable: "i" },
  folder: { file: "folder-NW-5nuMc.js", variable: "i" },
  "folder-plus": { file: "folder-plus-BbkpuoQG.js", variable: "i" },
  "folder-git": { file: "folder-git-C1P1nxpA.js", variable: "i" },
  lightning: { file: "lightning-bolt-DHNwJb9q.js", variable: "i" },
  "lightning-outline": { file: keycapPreview, variable: "$e" },
  mic: { file: "mic-A09aqMpT.js", variable: "i" },
  openai: { file: "openai-blossom-BBua0Vzz.js", variable: "i" },
  paint: { file: keycapPreview, variable: "Xe" },
  play: { file: "play-CqsgL8Mq.js", variable: "i" },
  "play-outline": { file: "play-outline-D2l6c2hs.js", variable: "i" },
  "pointer-outline": { file: "pointer-outline-Fy2x665R.js", variable: "i" },
  "pull-request": { file: "pull-request-open-BYX2rg3F.js", variable: "u" },
  "pull-request-draft": { file: "pull-request-open-BYX2rg3F.js", variable: "i" },
  "pull-request-merged": { file: "pull-request-open-BYX2rg3F.js", variable: "s" },
  settings: { file: "settings.cog-DSmiyHSC.js", variable: "i" },
  star: { file: "star-BKBj0V98.js", variable: "i" },
  terminal: { file: "terminal-BE22qAVo.js", variable: "i" },
  trash: { file: "trash-JtdCCqJp.js", variable: "i" },
  x: { file: "x-Brtwy3q3.js", variable: "i" },
  "x-circle": { file: "x-circle-P_QDU-sq.js", variable: "i" },
};

function resolveSource(file) {
  return path.isAbsolute(file) ? file : path.join(sourceRoot, file);
}

function extractArrow(source, variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[,;])${escaped}=([A-Za-z_$][\\w$]*)=>`).exec(source);
  if (!match) throw new Error(`Component ${variable} was not found`);

  const bodyStart = match.index + match[0].length;
  const arrowStart = bodyStart - match[1].length - 2;
  const opener = source[bodyStart];
  if (!"([{".includes(opener)) throw new Error(`Unsupported component body for ${variable}`);

  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let quote = null;
  let escapedCharacter = false;
  let bodyEnd = -1;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escapedCharacter) {
        escapedCharacter = false;
        continue;
      }
      if (character === "\\") {
        escapedCharacter = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === "\"" || character === "`") {
      quote = character;
      continue;
    }
    if (pairs[character]) {
      stack.push(pairs[character]);
      continue;
    }
    if (stack.at(-1) === character) {
      stack.pop();
      if (stack.length === 0) {
        let nextIndex = index + 1;
        while (/\s/.test(source[nextIndex] ?? "")) nextIndex += 1;
        if (source[nextIndex] !== "(" && source[nextIndex] !== "[") {
          bodyEnd = index + 1;
          break;
        }
      }
    }
  }

  if (bodyEnd < 0) throw new Error(`Component ${variable} body is incomplete`);
  return source.slice(arrowStart, bodyEnd);
}

function renderComponent(source, variable) {
  const runtime = {
    jsx: (tag, props) => ({ tag, props: props ?? {} }),
    jsxs: (tag, props) => ({ tag, props: props ?? {} }),
  };
  const arrow = extractArrow(source, variable)
    .replace(/\(0,[A-Za-z_$][\w$]*\.(jsx|jsxs)\)/g, "runtime.$1");
  const component = Function("runtime", `"use strict"; return (${arrow});`)(runtime);
  return component({});
}

const attributeNames = {
  className: "class",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  fillRule: "fill-rule",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeWidth: "stroke-width",
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serialize(node, isRoot = false) {
  if (node == null || node === false) return "";
  if (Array.isArray(node)) return node.map((child) => serialize(child)).join("");
  if (typeof node !== "object") return escapeXml(node);

  const { tag, props = {} } = node;
  const attributes = [];
  if (isRoot) attributes.push('aria-hidden="true"', 'focusable="false"');
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || value == null || value === false || typeof value === "function") continue;
    const attributeName = attributeNames[name] ?? name;
    attributes.push(`${attributeName}="${escapeXml(value === true ? "" : value)}"`);
  }
  const children = serialize(props.children);
  const suffix = attributes.length ? ` ${attributes.join(" ")}` : "";
  return children ? `<${tag}${suffix}>${children}</${tag}>` : `<${tag}${suffix}/>`;
}

fs.mkdirSync(outputRoot, { recursive: true });
const manifest = {};
for (const [name, source] of Object.entries(iconSources)) {
  const sourcePath = resolveSource(source.file);
  const content = fs.readFileSync(sourcePath, "utf8");
  const tree = renderComponent(content, source.variable);
  if (tree.tag !== "svg") throw new Error(`${name} did not produce an SVG root`);
  const svg = `${serialize(tree, true)}\n`;
  const destination = path.join(outputRoot, `${name}.svg`);
  fs.writeFileSync(destination, svg, "utf8");
  manifest[name] = `/codex-icons/${name}.svg`;
}
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Mirrored ${Object.keys(manifest).length} Codex Micro icons to ${outputRoot}`);

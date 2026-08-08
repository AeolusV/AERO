const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const styles = readFileSync(join(root, "src", "styles.css"), "utf8");
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
const main = readFileSync(join(root, "electron", "main.cjs"), "utf8");
const preload = readFileSync(join(root, "electron", "preload.cjs"), "utf8");
const edgeStyles = styles.slice(styles.indexOf(".compact-monitor {"), styles.indexOf(".density-compact"));

assert.doesNotMatch(styles, /lens-breathe|island-status-pulse/);
assert.doesNotMatch(styles, /\.edge-signal|\.edge-island-/);
assert.match(styles, /@starting-style\s*\{/);
assert.match(app, /duration:\s*280/);
assert.match(app, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
assert.match(preload, /codex-bar:set-reduced-motion/);
assert.match(main, /createBoundsSpringState[\s\S]*projectCompactPlacement/);
assert.match(main, /function setCompactMode\(nextCompact/);
assert.match(main, /const BAR_MORPH_DURATION = 420;/);
assert.match(main, /function easeInOutMorph\(progress\)/);
assert.match(main, /if \(preset === "morph"\)[\s\S]*interpolateBounds\(from, bounds, easeInOutMorph\(progress\)\)/);
assert.doesNotMatch(main, /morph:\s*\{/);
assert.match(main, /animateWindowBounds\(target,\s*\{\s*preset:\s*"morph"/);
assert.match(main, /if \(!compactMode \|\| !window \|\| window\.isDestroyed\(\)\) return;/);
assert.match(main, /if \(nextPointerInside === pointerInside\) return;/);
assert.match(main, /burst:\s*edgeBurstActive/);
assert.doesNotMatch(main, /burst:\s*Boolean\(burstTimer\)/);
assert.match(main, /edgePointerInside \|\| edgeDragging/);
assert.match(preload, /codex-bar:edge-pointer-presence/);
assert.match(preload, /codex-bar:full-drag/);
assert.match(main, /function beginFullDrag\(screenX, screenY\)/);
assert.match(main, /function finishFullDrag\(cancelled = false\)/);
assert.match(main, /if \(!compactMode\) return;/);
assert.match(app, /setEdgePointerPresence\(true\)/);
assert.match(app, /setEdgePointerPresence\(false\)/);
assert.match(app, /className="compact-bar-surface"/);
assert.match(app, /Array\.from\(\{\s*length:\s*6\s*\}/);
assert.match(app, /className="compact-return"/);
assert.match(app, /selectThread\(thread\)/);
assert.match(app, /closest\("button"\)/);
assert.match(edgeStyles, /grid-template-columns:\s*repeat\(7,\s*28px\)/);
assert.match(edgeStyles, /width:\s*248px/);
assert.match(edgeStyles, /\.view-compact \.compact-monitor\s*\{[\s\S]*opacity:\s*1/);
assert.match(styles, /--duration-bar-morph:\s*420ms/);
assert.match(styles, /--duration-bar-crossfade:\s*220ms/);
assert.match(styles, /--delay-bar-reveal:\s*54ms/);
assert.match(styles, /\.view-full \.floating-rail\s*\{\s*opacity:\s*1;\s*transform:\s*scale\(1\)/);
assert.match(edgeStyles, /\.view-compact \.compact-bar-surface\s*\{\s*transform:\s*scale\(1\)/);
assert.match(edgeStyles, /\.view-compact \.compact-monitor\s*\{[\s\S]*transition-delay:\s*var\(--delay-bar-reveal\)/);
assert.match(styles, /\.appearance-panel,\s*\.connections-panel,\s*\.wake-panel,\s*\.control-table\s*\{[\s\S]*scrollbar-width:\s*thin/);
assert.match(styles, /\.appearance-panel::-webkit-scrollbar-thumb,[\s\S]*\.control-table::-webkit-scrollbar-thumb\s*\{/);
assert.match(edgeStyles, /\.compact-material-light \.compact-bar-surface/);
assert.match(styles, /\.large-material-dark \.floating-rail/);
assert.match(styles, /\.large-material-dark \.customizer/);
assert.match(styles, /\.thread-lens\.active,\s*\.edge-thread-light\.active[\s\S]*\.thread-lens\.complete,\s*\.edge-thread-light\.complete/);
assert.match(styles, /\.thread-lens\.waiting,\s*\.edge-thread-light\.waiting[\s\S]*\.thread-lens\.error,\s*\.edge-thread-light\.error/);
const hoverBlocks = [...styles.matchAll(/([^{}]+:hover[^{}]*)\{([^{}]*)\}/g)];
for (const [selector, body] of hoverBlocks.map((match) => [match[1], match[2]])) {
  if (
    (selector.includes(".edge-thread-light:hover") || selector.includes(".thread-lens:hover"))
    && !selector.includes(".thread-tooltip")
  ) {
    assert.doesNotMatch(body, /transform:/);
  }
  if (selector.includes(".icon-button:hover")) assert.doesNotMatch(body, /transform:/);
}
assert.match(app, /className="reasoning-indicator"/);
assert.match(app, /settingsTab === "connections"/);
assert.match(preload, /codex-bar:set-compact/);
assert.match(main, /ipcMain\.handle\("codex-bar:set-compact"/);
assert.match(main, /internalMoveUntil = Date\.now\(\) \+ 1200/);
assert.match(main, /internalMoveUntil = Date\.now\(\) \+ 650/);

console.log("motion-source: 55 assertions passed");

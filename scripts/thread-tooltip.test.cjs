const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
const styles = readFileSync(join(root, "src", "styles.css"), "utf8");

assert.match(app, /function ThreadTooltip\(/);
assert.match(app, /className="thread-tooltip"/);
assert.match(app, /workspaceNameFromCwd\(thread\.cwd\)/);
assert.match(app, /className="thread-tooltip-workspace"/);
assert.match(app, /className="thread-tooltip-state"/);
assert.match(app, /role="tooltip"/);
assert.match(app, /aria-describedby=\{thread \? tooltipId : undefined\}/);
assert.match(app, /aria-describedby=\{thread \? `thread-tooltip-compact-\$\{index\}` : undefined\}/);
assert.doesNotMatch(app, /title=\{thread \?/);
assert.match(styles, /\.thread-tooltip\s*\{[\s\S]*border-radius:\s*10px/);
assert.match(styles, /\.thread-tooltip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
assert.match(styles, /\.thread-tooltip-workspace\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
assert.match(styles, /\.thread-tooltip\s*\{[\s\S]*max-width:\s*min\(360px, calc\(100vw - 24px\)\)/);
assert.match(styles, /\.thread-tooltip strong\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
assert.match(styles, /\.edge-thread-light \.thread-tooltip\s*\{[\s\S]*max-width:\s*min\(262px, calc\(100vw - 24px\)\)/);
assert.match(styles, /\.thread-lens:hover:not\(:disabled\) \.thread-tooltip[\s\S]*transition-delay:\s*260ms/);
assert.match(styles, /\.thread-lens:focus-visible \.thread-tooltip[\s\S]*transition:\s*none/);
assert.match(styles, /\.edge-thread-light \.thread-tooltip\s*\{[\s\S]*bottom:\s*calc\(100% - 6px\)/);
assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*\.thread-tooltip/);
assert.doesNotMatch(styles, /\.thread-tooltip\s*\{[^}]*transition:\s*all/s);

console.log("thread-tooltip: 20 assertions passed");

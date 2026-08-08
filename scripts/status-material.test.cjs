const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const styles = readFileSync(join(__dirname, "..", "src", "styles.css"), "utf8");

assert.match(styles, /--lamp-working:\s*#96b4ec/);
assert.match(styles, /\.thread-lens::before\s*\{[\s\S]*background-color:\s*var\(--lamp-color\)/);
assert.match(styles, /\.thread-lens::after\s*\{[\s\S]*backdrop-filter:\s*blur\(\.75px\) saturate\(106%\)/);
assert.match(styles, /\.edge-thread-light::before\s*\{[\s\S]*background-color:\s*var\(--lamp-color\)/);
assert.match(styles, /\.edge-thread-light::after\s*\{[\s\S]*backdrop-filter:\s*blur\(\.75px\) saturate\(106%\)/);
assert.match(styles, /\.compact-return\s*\{[\s\S]*radial-gradient/);
assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*\.thread-lens::after/);
assert.doesNotMatch(styles, /\.thread-lens\s*\{[^}]*linear-gradient/s);
assert.doesNotMatch(styles, /\.edge-thread-light\s*\{[^}]*color-mix/s);
assert.doesNotMatch(styles, /\.thread-lens\s*>\s*span/);
assert.doesNotMatch(styles, /\.edge-thread-light\s*>\s*span/);
assert.match(styles, /\.thread-lens,\s*\.edge-thread-light\s*\{[\s\S]*--lamp-glass-border:[\s\S]*--lamp-selection-ring:/);
assert.match(styles, /\.thread-lens\.active,\s*\.edge-thread-light\.active\s*\{/);
assert.match(styles, /\.thread-lens\.complete,\s*\.edge-thread-light\.complete\s*\{/);
assert.doesNotMatch(styles, /\.large-material-dark \.floating-rail \.thread-lens::after/);

console.log("status-material: 15 assertions passed");

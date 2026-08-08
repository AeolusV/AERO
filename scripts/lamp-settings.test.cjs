const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
const styles = readFileSync(join(root, "src", "styles.css"), "utf8");

assert.match(app, /const defaultLampPalette: LampPalette/);
assert.match(app, /const previousDefaultLampPalette: LampPalette/);
assert.match(app, /const legacyDefaultLampPalette: LampPalette/);
assert.match(app, /usesLegacyDefaults/);
assert.match(app, /usesPreviousDefaults/);
assert.match(app, /aero-lamp-palette-v1/);
assert.match(app, /style=\{lampStyle\}/);
assert.match(app, /const lampStatusMeta/);
assert.match(app, /className="lamp-color-grid"/);
assert.match(app, /className="lamp-hex-field"/);
assert.match(app, /恢复默认/);
assert.match(app, /"--lamp-working": lampPalette\.active/);
assert.match(styles, /\.lamp-color-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(5/);
assert.match(styles, /\.lamp-preset-row button\s*\{/);
assert.match(styles, /\.lamp-hex-field input\s*\{/);
assert.match(styles, /\.compact-monitor\.active\s*\{\s*--edge-color:\s*var\(--lamp-working\)/);

console.log("lamp-settings: 12 assertions passed");

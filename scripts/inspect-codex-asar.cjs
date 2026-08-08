const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function usage() {
  console.error("Usage: electron scripts/inspect-codex-asar.cjs <app.asar> <pattern> [output-directory]");
  process.exitCode = 2;
}

function walk(root, current = "", results = []) {
  const absolute = path.join(root, current);
  let entries;
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const relative = path.join(current, entry.name);
    if (entry.isDirectory()) walk(root, relative, results);
    else if (entry.isFile()) results.push(relative);
  }
  return results;
}

app.whenReady().then(() => {
  const asarPath = process.argv[2];
  const patternSource = process.argv[3];
  const outputDirectory = process.argv[4];
  if (!asarPath || !patternSource) {
    usage();
    app.quit();
    return;
  }

  let pattern;
  try {
    pattern = new RegExp(patternSource, "i");
  } catch (error) {
    console.error(`Invalid pattern: ${error.message}`);
    process.exitCode = 2;
    app.quit();
    return;
  }

  const matches = walk(asarPath).filter((relative) => pattern.test(relative));
  if (!outputDirectory) {
    for (const relative of matches) console.log(relative.replaceAll("\\", "/"));
    app.quit();
    return;
  }

  for (const relative of matches) {
    const source = path.join(asarPath, relative);
    const destination = path.join(outputDirectory, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    console.log(destination);
  }
  app.quit();
});

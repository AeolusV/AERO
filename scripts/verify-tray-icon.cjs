const { app, nativeImage } = require("electron");
const { join } = require("node:path");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const iconPath = join(__dirname, "..", "public", "aero-tray.png");
  const image = nativeImage.createFromPath(iconPath);
  const size = image.getSize();
  const valid = !image.isEmpty() && size.width === 64 && size.height === 64 && image.toPNG().length > 0;
  console.log(JSON.stringify({
    valid,
    empty: image.isEmpty(),
    width: size.width,
    height: size.height,
    pngBytes: image.toPNG().length,
  }));
  app.exit(valid ? 0 : 1);
});

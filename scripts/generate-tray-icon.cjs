const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { deflateSync } = require("node:zlib");

const SIZE = 64;
const SUPERSAMPLE = 4;
const outputPath = join(__dirname, "..", "public", "aero-tray.png");

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(left, right, amount) {
  return left + (right - left) * amount;
}

function segmentDistance(x, y, startX, startY, endX, endY) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const amount = clamp(((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared);
  return Math.hypot(x - mix(startX, endX, amount), y - mix(startY, endY, amount));
}

function sample(x, y) {
  const deltaX = x - 30;
  const deltaY = y - 30;
  const angle = (Math.atan2(deltaY, deltaX) + Math.PI * 2) % (Math.PI * 2);
  const arcDistance = Math.abs(Math.hypot(deltaX, deltaY) - 20);
  const inArc = angle < 0.23 || angle > 1.36;
  const tailDistance = segmentDistance(x, y, 50, 29.8, 50, 51);
  const markDistance = Math.min(inArc ? arcDistance : Infinity, tailDistance);
  const outlineAlpha = clamp(6.4 - markDistance);
  const inkAlpha = clamp(4.7 - markDistance);
  if (outlineAlpha === 0) return [0, 0, 0, 0];

  const ink = clamp(inkAlpha / Math.max(outlineAlpha, 0.001));
  const tone = Math.round(mix(255, 18, ink));
  return [tone, tone, tone, outlineAlpha];
}

function renderPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE;

  for (let pixelY = 0; pixelY < SIZE; pixelY += 1) {
    for (let pixelX = 0; pixelX < SIZE; pixelX += 1) {
      let alpha = 0;
      let premultipliedRed = 0;
      let premultipliedGreen = 0;
      let premultipliedBlue = 0;

      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const x = pixelX + (sampleX + 0.5) / SUPERSAMPLE;
          const y = pixelY + (sampleY + 0.5) / SUPERSAMPLE;
          const [red, green, blue, sampleAlpha] = sample(x, y);
          alpha += sampleAlpha;
          premultipliedRed += red * sampleAlpha;
          premultipliedGreen += green * sampleAlpha;
          premultipliedBlue += blue * sampleAlpha;
        }
      }

      alpha /= samplesPerPixel;
      const index = (pixelY * SIZE + pixelX) * 4;
      pixels[index] = alpha > 0 ? Math.round(premultipliedRed / samplesPerPixel / alpha) : 0;
      pixels[index + 1] = alpha > 0 ? Math.round(premultipliedGreen / samplesPerPixel / alpha) : 0;
      pixels[index + 2] = alpha > 0 ? Math.round(premultipliedBlue / samplesPerPixel / alpha) : 0;
      pixels[index + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowOffset = y * (SIZE * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = encodePng(renderPixels());
writeFileSync(outputPath, png);
console.log(`Generated ${outputPath} (${SIZE}x${SIZE}, ${png.length} bytes)`);

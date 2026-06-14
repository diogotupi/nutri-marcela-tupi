import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'logo.png');

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.from(data);
const [r, g, b] = [0x2d, 0x6a, 0x4f];

for (let i = 0; i < out.length; i += 4) {
  const pr = out[i];
  const pg = out[i + 1];
  const pb = out[i + 2];
  const lum = (pr + pg + pb) / 3;

  if (lum < 40) {
    out[i + 3] = 0;
    continue;
  }

  const alpha = Math.min(255, Math.round(((lum - 40) / 215) * 255));
  out[i] = r;
  out[i + 1] = g;
  out[i + 2] = b;
  out[i + 3] = alpha;
}

const base = sharp(out, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

const whiteOut = Buffer.from(data);
for (let i = 0; i < whiteOut.length; i += 4) {
  const lum = (whiteOut[i] + whiteOut[i + 1] + whiteOut[i + 2]) / 3;
  if (lum < 40) {
    whiteOut[i + 3] = 0;
    continue;
  }
  const alpha = Math.min(255, Math.round(((lum - 40) / 215) * 255));
  whiteOut[i] = 255;
  whiteOut[i + 1] = 255;
  whiteOut[i + 2] = 255;
  whiteOut[i + 3] = alpha;
}

const whiteBase = sharp(whiteOut, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

await base.clone().png().toFile(join(root, 'assets', 'logo-transparent.png'));
await whiteBase.clone().png().toFile(join(root, 'assets', 'logo-white-transparent.png'));
await base.clone().resize(512, 512).png().toFile(join(root, 'assets', 'apple-touch-icon.png'));
await base.clone().resize(32, 32).png().toFile(join(root, 'assets', 'favicon-32.png'));
await base.clone().resize(16, 16).png().toFile(join(root, 'assets', 'favicon-16.png'));

console.log('Logo processada: transparente verde, branca, favicons');

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'logo.png');

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.from(data);
// logo.png now contains the original black PDF artwork with its own alpha.
// Keep those pixels instead of deriving transparency from brightness.

const base = sharp(out, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

const whiteOut = Buffer.from(data);
for (let i = 0; i < whiteOut.length; i += 4) {
  whiteOut[i] = 255;
  whiteOut[i + 1] = 255;
  whiteOut[i + 2] = 255;
}

const whiteBase = sharp(whiteOut, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

await base.clone().png().toFile(join(root, 'assets', 'logo-transparent.png'));
await whiteBase.clone().png().toFile(join(root, 'assets', 'logo-white-transparent.png'));
console.log('Geradas as versões transparente e branca da logo.');

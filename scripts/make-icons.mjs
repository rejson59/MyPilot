import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'public/icons/icon.svg');
const outDir = path.join(root, 'public/icons');

await mkdir(outDir, { recursive: true });

// Ikony PWA + apple-touch
await sharp(source, { density: 384 }).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'));
await sharp(source, { density: 384 }).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
await sharp(source, { density: 384 }).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'));

// Ikona maskable — bezpieczny margines 20%
const inner = await sharp(source, { density: 384 }).resize(308, 308).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0b0b0d' },
})
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(path.join(outDir, 'icon-maskable-512.png'));

console.log('Ikony wygenerowane w public/icons');

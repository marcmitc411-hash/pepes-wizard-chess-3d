import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'node_modules', 'stockfish', 'bin');
const DEST_DIR = path.join(ROOT, 'public', 'stockfish');

const FILES = [
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
];

fs.mkdirSync(DEST_DIR, { recursive: true });

for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  const dest = path.join(DEST_DIR, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing Stockfish asset: ${src}`);
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied ${file} -> public/stockfish/${file}`);
}

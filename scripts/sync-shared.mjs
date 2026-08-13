import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { from: 'packages/types/src', to: 'apps/miniprogram/miniprogram/lib/shared/types' },
  { from: 'packages/design-tokens/src', to: 'apps/miniprogram/miniprogram/lib/shared/tokens' },
];

let failed = false;
for (const { from, to } of targets) {
  const fromDir = path.join(root, from);
  const toDir = path.join(root, to);
  if (!existsSync(fromDir)) {
    console.error(`[sync] 源目录不存在: ${from}`);
    failed = true;
    continue;
  }
  mkdirSync(toDir, { recursive: true });
  cpSync(fromDir, toDir, { recursive: true });
  console.log(`[sync] ${from} -> ${to}`);
}

if (failed) process.exit(1);
console.log('[sync] 共享代码同步完成');

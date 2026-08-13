import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cloudRoot = path.join(root, 'apps', 'miniprogram', 'cloudfunctions');

try {
  await import('esbuild');
} catch {
  console.error('[build] 未找到 esbuild，请先在项目根目录执行 npm install');
  process.exit(1);
}

const functionNames = readdirSync(cloudRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .filter((d) => existsSync(path.join(cloudRoot, d.name, 'src', 'index.ts')))
  .map((d) => d.name);

if (functionNames.length === 0) {
  console.error('[build] 未找到任何云函数（需要 cloudfunctions/<name>/src/index.ts）');
  process.exit(1);
}

for (const name of functionNames) {
  const funcDir = path.join(cloudRoot, name);
  console.log(`[build] ${name}`);
  await build({
    entryPoints: [path.join(funcDir, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['wx-server-sdk'],
    outfile: path.join(funcDir, 'dist', 'index.js'),
    sourcemap: true,
    logLevel: 'info',
  });
}

console.log('[build] 完成：可在微信开发者工具中右键上传各云函数（上传并部署：云端安装依赖）');

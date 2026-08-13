import { execSync } from 'node:child_process';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

console.log('Node:', run('node -v') ?? '缺失');
console.log('npm:', run('npm -v') ?? '缺失');
console.log('Git:', run('git --version') ?? '缺失');
console.log('CloudBase CLI:', run('tcb -v') ?? '缺失');

const devtoolsCandidates = [
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat',
];
const found = devtoolsCandidates.find((p) => {
  try {
    return execSync(`if exist "${p}" echo yes`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().includes('yes');
  } catch {
    return false;
  }
});
console.log('微信开发者工具:', found ? `已安装（${found}）` : '未安装，请到官方下载页安装稳定版');

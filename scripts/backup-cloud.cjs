/**
 * 数据备份（1.1.0）：把云数据库全部集合导出为本地 JSON 到 outputs/backup/<日期>/。
 *
 * 运行前先获取临时密钥（与云端 E2E 相同方式）：
 *   $raw = tcb secrets get -e <环境ID> --json | ConvertFrom-Json
 *   $env:TENCENTCLOUD_SECRETID = $raw.data.secretId
 *   $env:TENCENTCLOUD_SECRETKEY = $raw.data.secretKey
 *   $env:TENCENTCLOUD_SESSIONTOKEN = $raw.data.token
 *   $env:TENCENTCLOUD_TOKEN = $raw.data.token
 *   $env:CLOUDBASE_ENV_ID = $raw.data.envId
 * 然后：node scripts/backup-cloud.cjs
 */
const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID，请先设置临时密钥');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();

const COLLECTIONS = [
  'users',
  'user_identities',
  'spaces',
  'space_members',
  'audit_logs',
  'todos',
  'calendar_events',
  'period_records',
  'holiday_calendar',
  'space_settings',
  'meal_templates',
  'meal_plans',
  'trash_records',
  'restaurants',
  'restaurant_visits',
  'anniversaries',
  'trips',
  'trip_plans',
  'rate_limits',
  'subscribe_grants',
];

async function dumpCollection(name) {
  const out = [];
  const PAGE = 1000;
  for (let skip = 0; ; skip += PAGE) {
    const res = await db.collection(name).skip(skip).limit(PAGE).get();
    out.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  return out;
}

async function main() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dir = path.join(process.cwd(), 'outputs', 'backup', stamp);
  fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      const docs = await dumpCollection(name);
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
      total += docs.length;
      console.log(`[备份] ${name}: ${docs.length} 条`);
    } catch (err) {
      console.log(`[备份] ${name}: 跳过（${String((err && err.message) || err)}）`);
    }
  }
  fs.writeFileSync(
    path.join(dir, 'summary.json'),
    JSON.stringify({ envId, exportedAt: new Date().toISOString(), total }, null, 2),
    'utf8',
  );
  console.log(`\n===== 备份完成：${dir}（共 ${total} 条）=====`);
}

main().catch((err) => {
  console.error('备份异常:', String((err && err.message) || err));
  process.exit(1);
});

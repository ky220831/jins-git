/**
 * 一次性工具：用临时密钥 + wx-server-sdk 在云环境创建 5 个第一阶段集合。
 * 用法：
 *   $env:TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN 来自 `tcb secrets get`
 *   $env:CLOUDBASE_ENV_ID = 环境 ID
 *   node scripts/db-bootstrap.cjs
 */
const cloud = require('wx-server-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
const names = [
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
  'subscribe_grants',
  'rate_limits',
  'client_logs',
  'backup_meta',
];

if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();

function errorText(err) {
  const e = err || {};
  return String(e.message || e.errMsg || e.errCode || e);
}

async function main() {
  console.log(`环境: ${envId}`);
  for (const name of names) {
    try {
      await db.createCollection(name);
      console.log(`[创建] ${name}: 成功`);
    } catch (err) {
      console.log(`[创建] ${name}: ${errorText(err)}`);
    }
  }

  for (const name of names) {
    try {
      const res = await db.collection(name).count();
      console.log(`[验证] ${name}: 存在（count=${res.total}）`);
    } catch (err) {
      console.log(`[验证] ${name}: 不可访问 -> ${errorText(err)}`);
    }
  }
}

main().catch((err) => {
  console.error('脚本执行失败:', errorText(err));
  process.exit(1);
});

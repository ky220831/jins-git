/**
 * 第六阶段一次性工具：创建 纪念日/旅行资料/临时行程 三个集合。
 * 用法（与 db-bootstrap.cjs 相同）：
 *   $env:TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN 来自 `tcb secrets get`
 *   $env:CLOUDBASE_ENV_ID = 环境 ID
 *   node scripts/db-bootstrap-phase6.cjs
 */
const cloud = require('wx-server-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
const names = ['anniversaries', 'trips', 'trip_plans'];

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
      await db.collection(name).count();
      console.log(`[验证] ${name}: 存在`);
    } catch (err) {
      console.log(`[验证] ${name}: 不可访问 -> ${errorText(err)}`);
    }
  }

  // 索引（数据量小，失败不影响功能，尽力而为）
  const indexes = [
    { collection: 'anniversaries', keys: { spaceId: 1 }, name: 'idx_space' },
    { collection: 'trips', keys: { spaceId: 1 }, name: 'idx_space' },
    { collection: 'trip_plans', keys: { spaceId: 1, startDate: 1 }, name: 'idx_space_start' },
    { collection: 'trip_plans', keys: { expireAt: 1 }, name: 'idx_expire' },
  ];
  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex({ keys: idx.keys, name: idx.name });
      console.log(`[索引] ${idx.collection}.${idx.name}: 成功`);
    } catch (err) {
      console.log(`[索引] ${idx.collection}.${idx.name}: ${errorText(err)}`);
    }
  }
}

main().catch((err) => {
  console.error('脚本执行失败:', errorText(err));
  process.exit(1);
});

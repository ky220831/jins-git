/**
 * 设置文档数据库集合权限为 ADMINONLY（仅云函数/管理员可读写）。
 * 用法：先执行 . .\work\set-env.ps1（提供 TENCENTCLOUD_SECRETID/SECRETKEY/SESSIONTOKEN 与 CLOUDBASE_ENV_ID）
 *   node scripts/set-db-acl.cjs [collectionName...]
 * 不带参数时对全部业务集合执行。
 */
const CloudBase = require('@cloudbase/manager-node');

const envId = process.env.CLOUDBASE_ENV_ID;
const secretId = process.env.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
const token = process.env.TENCENTCLOUD_SESSIONTOKEN;

const ALL_COLLECTIONS = [
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
];

const app = CloudBase.init({
  secretId,
  secretKey,
  token,
  envId,
});
const manager = app.commonService();

async function main() {
  if (!envId || !secretId || !secretKey) {
    console.error('缺少临时密钥或环境 ID（先执行 . .\\work\\set-env.ps1）');
    process.exit(1);
  }
  const targets = process.argv.slice(2);
  const names = targets.length > 0 ? targets : ALL_COLLECTIONS;
  for (const name of names) {
    try {
      await manager.call({
        Action: 'ModifyDatabaseACL',
        Param: {
          EnvId: envId,
          CollectionName: name,
          AclTag: 'ADMINONLY',
        },
      });
      console.log(`[${name}] ADMINONLY: 成功`);
    } catch (err) {
      console.log(`[${name}] 异常: ${String(err.message || err)}`);
    }
  }
}

main().catch((err) => {
  console.error('脚本执行失败:', String(err));
  process.exit(1);
});

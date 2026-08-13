/**
 * 第一阶段验收自动化：
 * 1) 5 个集合权限 → ADMINONLY（所有用户不可读写，仅云函数可访问）
 * 2) 3 组唯一索引
 * 运行前需要 TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN 与 CLOUDBASE_ENV_ID。
 */
const CloudBase = require('@cloudbase/manager-node');

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

const app = new CloudBase({
  secretId: process.env.TENCENTCLOUD_SECRETID,
  secretKey: process.env.TENCENTCLOUD_SECRETKEY,
  token: process.env.TENCENTCLOUD_SESSIONTOKEN || process.env.TENCENTCLOUD_TOKEN,
  envId,
  region: 'ap-shanghai',
});

const db = app.database;
const permission = app.permission;

const collections = [
  'users',
  'user_identities',
  'spaces',
  'space_members',
  'audit_logs',
  'todos',
  'calendar_events',
];

const indexDefs = {
  user_identities: [
    {
      IndexName: 'idx_provider_providerUserId',
      MgoKeySchema: {
        MgoIndexKeys: [
          { Name: 'provider', Direction: '1' },
          { Name: 'providerUserId', Direction: '1' },
        ],
        MgoIsUnique: true,
      },
    },
  ],
  spaces: [
    {
      IndexName: 'idx_ownerUserId',
      MgoKeySchema: {
        MgoIndexKeys: [{ Name: 'ownerUserId', Direction: '1' }],
        MgoIsUnique: true,
      },
    },
  ],
  space_members: [
    {
      IndexName: 'idx_spaceId_userId',
      MgoKeySchema: {
        MgoIndexKeys: [
          { Name: 'spaceId', Direction: '1' },
          { Name: 'userId', Direction: '1' },
        ],
        MgoIsUnique: true,
      },
    },
  ],
  todos: [
    {
      IndexName: 'idx_spaceId_date',
      MgoKeySchema: {
        MgoIndexKeys: [
          { Name: 'spaceId', Direction: '1' },
          { Name: 'date', Direction: '1' },
        ],
        MgoIsUnique: false,
      },
    },
  ],
  calendar_events: [
    {
      IndexName: 'idx_spaceId_startTime',
      MgoKeySchema: {
        MgoIndexKeys: [
          { Name: 'spaceId', Direction: '1' },
          { Name: 'startTime', Direction: '1' },
        ],
        MgoIsUnique: false,
      },
    },
  ],
};

async function main() {
  console.log(`环境: ${envId}`);

  // ---- 1. 权限 ----
  for (const coll of collections) {
    try {
      const res = await permission.modifyResourcePermission({
        resourceType: 'collection',
        resource: coll,
        permission: 'ADMINONLY',
      });
      console.log(`[权限] ${coll}: ${JSON.stringify(res.Data || res)}`);
    } catch (err) {
      console.log(`[权限] ${coll} 失败: ${String((err && err.message) || err)}`);
    }
  }

  try {
    const desc = await permission.describeResourcePermission({
      resourceType: 'collection',
      resources: collections,
    });
    console.log('[权限验证]', JSON.stringify(desc.Data, null, 2));
  } catch (err) {
    console.log('[权限验证] 失败:', String((err && err.message) || err));
  }

  // ---- 2. 索引 ----
  for (const [coll, defs] of Object.entries(indexDefs)) {
    try {
      const res = await db.updateCollection(coll, { CreateIndexes: defs });
      console.log(`[索引] ${coll}: ${JSON.stringify(res)}`);
    } catch (err) {
      console.log(`[索引] ${coll} 失败: ${String((err && err.message) || err)}`);
    }
  }

  for (const coll of Object.keys(indexDefs)) {
    try {
      const info = await db.describeCollection(coll);
      console.log(`[索引验证] ${coll}:`);
      console.log(JSON.stringify(info.Indexes || info, null, 2));
    } catch (err) {
      console.log(`[索引验证] ${coll} 失败: ${String((err && err.message) || err)}`);
    }
  }
}

main().catch((err) => {
  console.error('执行异常:', String((err && err.message) || err));
  process.exit(1);
});

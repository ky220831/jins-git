/**
 * 一次性诊断工具：只读查看 5 个集合的概况（脱敏）。
 * 用法与 db-bootstrap.cjs 相同：需要 TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN 与 CLOUDBASE_ENV_ID。
 */
const cloud = require('wx-server-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();

function mask(value) {
  if (typeof value !== 'string' || value.length <= 6) return value;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

async function dump(name) {
  try {
    const res = await db.collection(name).limit(20).get();
    console.log(`\n=== ${name}（${res.data.length} 条，最多显示 20 条）===`);
    for (const doc of res.data) {
      const { _id, id, providerUserId, userId, spaceId, ownerUserId, role, status, memberCount, name: spaceName, action, result } = doc;
      console.log(JSON.stringify({
        id: id || _id,
        providerUserId: providerUserId ? mask(providerUserId) : undefined,
        userId: userId ? mask(userId) : undefined,
        spaceId: spaceId ? mask(spaceId) : undefined,
        ownerUserId: ownerUserId ? mask(ownerUserId) : undefined,
        role,
        status,
        memberCount,
        spaceName,
        action,
        result,
        inviteCodeUsedAt: doc.inviteCodeUsedAt ? 'yes' : undefined,
        inviteCode: doc.inviteCode ? 'set' : undefined,
      }));
    }
  } catch (err) {
    console.log(`\n=== ${name} === 访问失败: ${String(err.message || err)}`);
  }
}

async function main() {
  console.log(`环境: ${envId}`);
  for (const name of ['users', 'user_identities', 'spaces', 'space_members', 'audit_logs']) {
    await dump(name);
  }
}

main().catch((err) => {
  console.error('诊断失败:', err);
  process.exit(1);
});

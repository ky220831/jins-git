/**
 * 双账号端到端验证（本地运行，连真实云环境）：
 * A 登录 → 创建临时空间 → B 用邀请码加入 → 验证角色/满员/跨空间拦截 → 清理全部临时数据。
 */
import cloud from 'wx-server-sdk';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import type { Repo } from '../apps/miniprogram/cloudfunctions/_shared/repo';

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();
const _ = db.command;

const repo: Repo = new CloudRepo();
const service = new SpaceService(repo);

const OPENID_A = `e2e-user-a-${Date.now()}`;
const OPENID_B = `e2e-user-b-${Date.now()}`;
const OPENID_C = `e2e-user-c-${Date.now()}`;
let testSpaceId = '';

async function expectError(promise: Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await promise;
    console.log(`[失败] ${label}: 预期抛出 ${code} 但没有抛错`);
    process.exitCode = 1;
  } catch (err) {
    const got = (err as { code?: string }).code;
    if (got === code) {
      console.log(`[通过] ${label}（${code}）`);
    } else {
      console.log(`[失败] ${label}: 预期 ${code}，实际 ${got}（${(err as Error).message}）`);
      process.exitCode = 1;
    }
  }
}

async function cleanup(): Promise<void> {
  const openids = [OPENID_A, OPENID_B, OPENID_C];
  try {
    const identityRes = await db
      .collection('user_identities')
      .where({ providerUserId: _.in(openids) })
      .get();
    const userIds = identityRes.data.map((d) => d.userId as string);
    if (userIds.length > 0) {
      await db.collection('user_identities').where({ providerUserId: _.in(openids) }).remove();
      await db.collection('users').where({ id: _.in(userIds) }).remove();
      await db.collection('space_members').where({ userId: _.in(userIds) }).remove();
      await db.collection('audit_logs').where({ actorUserId: _.in(userIds) }).remove();
    }
    if (testSpaceId) {
      await db.collection('spaces').doc(testSpaceId).remove();
    }
    console.log('[清理] 临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  console.log(`环境: ${envId}`);

  const loginA = await service.login(OPENID_A);
  console.log(`[通过] A 首次登录：hasSpace=${loginA.hasSpace}`);

  const created = await service.createSpace(OPENID_A, { name: 'E2E临时空间' });
  testSpaceId = created.space.spaceId;
  console.log(`[通过] A 创建空间：${created.space.spaceId}，邀请码 ${created.inviteCode}`);

  const joined = await service.joinSpace(OPENID_B, { inviteCode: created.inviteCode });
  console.log(
    `[通过] B 用邀请码加入：myRole=${joined.space.myRole}，成员数=${joined.space.members.length}`,
  );
  if (joined.space.myRole !== 'member' || joined.space.members.length !== 2) {
    console.log('[失败] B 加入后应为 member 且成员数为 2');
    process.exitCode = 1;
  }

  const spaceAfter = await repo.findSpaceById(testSpaceId);
  if (spaceAfter && spaceAfter.inviteCode === null && spaceAfter.memberCount === 2) {
    console.log('[通过] 加入后邀请码已失效、memberCount=2');
  } else {
    console.log('[失败] 邀请码失效/成员数状态不正确');
    process.exitCode = 1;
  }

  await expectError(
    service.joinSpace(OPENID_C, { inviteCode: created.inviteCode }),
    ErrorCodes.INVITE_INVALID,
    '第三人 C 使用已用过的邀请码加入被拒绝',
  );

  await expectError(
    service.getMySpace(OPENID_C),
    ErrorCodes.NOT_IN_SPACE,
    '第三人 C 无法访问空间（NOT_IN_SPACE）',
  );

  const viewB = await service.getMySpace(OPENID_B);
  console.log(`[通过] B 查询自己的空间：myRole=${viewB.space.myRole}`);
  if (viewB.space.inviteCode !== undefined) {
    console.log('[失败] MEMBER 不应看到邀请码');
    process.exitCode = 1;
  } else {
    console.log('[通过] MEMBER 看不到邀请码（权限最小化）');
  }

  const loginA2 = await service.login(OPENID_A);
  console.log(`[通过] A 再次登录：hasSpace=${loginA2.hasSpace}，myRole=${loginA2.space?.myRole}`);

  console.log(process.exitCode ? '\n===== 存在失败项 =====' : '\n===== 双账号绑定流程全部通过 =====');
}

main()
  .catch((err) => {
    console.error('E2E 执行异常:', String((err as Error).message || err));
    process.exitCode = 1;
  })
  .finally(cleanup);

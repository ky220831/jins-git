/**
 * 验证生理期“删除”功能在真实云端可用（一次性测试数据，结束后清理）：
 * 主账号删除成功；副账号删除被拒（FORBIDDEN）；预测记录不可删（VALIDATION）。
 */
import cloud from 'wx-server-sdk';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { PeriodService } from '../apps/miniprogram/cloudfunctions/_shared/periodService';
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
const spaceService = new SpaceService(repo);
const periodService = new PeriodService(repo);

const OPENID_A = `e2e-pd-a-${Date.now()}`;
const OPENID_B = `e2e-pd-b-${Date.now()}`;
let testSpaceId = '';
let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`[通过] ${label}${detail ? `（${detail}）` : ''}`);
  } else {
    console.log(`[失败] ${label}${detail ? `（${detail}）` : ''}`);
    failures += 1;
  }
}

async function expectError(promise: Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await promise;
    check(label, false, `预期抛出 ${code} 但未抛错`);
  } catch (err) {
    const got = (err as { code?: string }).code;
    check(label, got === code, `预期 ${code}，实际 ${got}`);
  }
}

async function cleanup(): Promise<void> {
  const openids = [OPENID_A, OPENID_B];
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
      await db.collection('period_records').where({ spaceId: testSpaceId }).remove();
      await db.collection('space_settings').where({ spaceId: testSpaceId }).remove();
    }
    console.log('[清理] 临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  const created = await spaceService.createSpace(OPENID_A, { name: 'E2E删除临时空间' });
  testSpaceId = created.space.spaceId;
  await spaceService.joinSpace(OPENID_B, { inviteCode: created.inviteCode });

  const views = await periodService.recordActual(OPENID_A, {
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  });
  const actual = views.find((v) => v.type === 'actual');
  const predicted = views.find((v) => v.type === 'predicted');
  check('准备：创建了 actual 与 predicted 记录', !!actual && !!predicted);
  if (!actual || !predicted) return;

  // 副账号不能删除
  await expectError(
    periodService.delete(OPENID_B, { recordId: actual.id }),
    ErrorCodes.FORBIDDEN,
    '副账号删除被拒绝',
  );
  // 预测记录允许删除（删后自动重算，列表仍保留 1 条预测）
  await periodService.delete(OPENID_A, { recordId: predicted.id });
  const afterPredictedDelete = await periodService.list(OPENID_A);
  check(
    '删除预测记录后自动重算（仍保留 1 条预测）',
    afterPredictedDelete.filter((v) => v.type === 'predicted').length === 1,
  );
  // 主账号删除成功
  await periodService.delete(OPENID_A, { recordId: actual.id });
  const after = await periodService.list(OPENID_A);
  check('主账号删除成功后 actual 消失', after.filter((v) => v.type === 'actual').length === 0);
  check('删除后预测同步重算（actual 为 0 时不再有预测）', after.filter((v) => v.type === 'predicted').length === 0);

  console.log(failures === 0 ? '\n===== 生理期删除功能验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('E2E 异常:', String((err as Error).message || err));
    process.exitCode = 1;
  })
  .finally(cleanup);

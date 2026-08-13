/**
 * 第四阶段云端端到端验证（连真实云环境）：
 * 素材库增删改 → 今日菜单上架/下架/日历联动 → 回收站恢复/永久删除 →
 * 14 天自动过期 → 72 小时自动清除 → 跨空间隔离 → 清理全部临时数据。
 *
 * 运行：npx esbuild scripts/e2e-meal-trash.ts --bundle --platform=node --target=node18
 *       --format=cjs --outfile=work/e2e-meal-trash.cjs --external:wx-server-sdk
 * 然后设置密钥后 node work/e2e-meal-trash.cjs
 */
import cloud from 'wx-server-sdk';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
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
const mealService = new MealService(repo);
const trashService = new TrashService(repo);
const calendarService = new CalendarService(repo);

const OPENID_A = `e2e4-a-${Date.now()}`;
const OPENID_B = `e2e4-b-${Date.now()}`;
const OPENID_C = `e2e4-c-${Date.now()}`;
let testSpaceId = '';
let cTestSpaceId = '';

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
      await db.collection('meal_templates').where({ spaceId: testSpaceId }).remove();
      await db.collection('meal_plans').where({ spaceId: testSpaceId }).remove();
      await db.collection('trash_records').where({ spaceId: testSpaceId }).remove();
      await db.collection('calendar_events').where({ spaceId: testSpaceId }).remove();
      await db.collection('todos').where({ spaceId: testSpaceId }).remove();
    }
    if (cTestSpaceId) {
      await db.collection('spaces').doc(cTestSpaceId).remove();
      await db.collection('space_members').where({ spaceId: cTestSpaceId }).remove();
      await db.collection('audit_logs').where({ spaceId: cTestSpaceId }).remove();
    }
    console.log('[清理] 第四阶段临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  console.log(`环境: ${envId}`);

  const created = await spaceService.createSpace(OPENID_A, { name: 'E2E4临时空间' });
  testSpaceId = created.space.spaceId;
  await spaceService.joinSpace(OPENID_B, { inviteCode: created.inviteCode });
  const cSpace = await spaceService.createSpace(OPENID_C, { name: 'E2E4-C空间' });
  cTestSpaceId = cSpace.space.spaceId;

  // ---- 素材库 ----
  const t1 = await mealService.createTemplate(OPENID_A, { name: '番茄炒蛋', category: '家常菜' });
  const t2 = await mealService.createTemplate(OPENID_A, { name: '红烧排骨' });
  await mealService.createTemplate(OPENID_B, { name: '清蒸鲈鱼' });
  check(
    '素材库：双人可新增，列表 3 条',
    (await mealService.listTemplates(OPENID_A)).length === 3,
  );

  const updatedT = await mealService.updateTemplate(OPENID_B, {
    templateId: t1.id,
    category: '快手菜',
  });
  check('素材库：副账号可编辑', updatedT.category === '快手菜');
  await expectError(
    mealService.deleteTemplate(OPENID_B, { templateId: t2.id }),
    ErrorCodes.FORBIDDEN,
    '副账号不能删除素材',
  );
  await mealService.deleteTemplate(OPENID_A, { templateId: t2.id });
  const trashAfterTemplateDelete = await trashService.list(OPENID_A);
  check(
    '主账号删除素材后进入回收站（permanent）',
    trashAfterTemplateDelete.length === 1 &&
      trashAfterTemplateDelete[0].collection === 'meal_templates',
    JSON.stringify(trashAfterTemplateDelete.map((t) => t.collection)),
  );

  // ---- 今日菜单 + 日历联动 ----
  const plan = await mealService.createPlan(OPENID_A, {
    date: '2026-10-01',
    time: '18:30',
    templateId: t1.id,
    note: '少油',
  });
  const oct = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
  const mealEvent = oct.events.find((e) => e.sourceId === plan.id);
  check(
    '上架带时间菜单自动生成 🍴 日历事件',
    !!mealEvent && mealEvent.title === '🍴 番茄炒蛋' && mealEvent.colorToken === 'accent',
    mealEvent ? mealEvent.title : '无事件',
  );

  await mealService.offlinePlan(OPENID_B, { planId: plan.id });
  const octAfterOffline = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
  check(
    '下架后日历事件移除、月列表不显示',
    !octAfterOffline.events.some((e) => e.sourceId === plan.id) &&
      !(await mealService.listPlansByMonth(OPENID_A, { year: 2026, month: 10 })).some((p) => p.id === plan.id),
  );

  // ---- 回收站：删除 → 恢复 ----
  await mealService.updatePlan(OPENID_B, { planId: plan.id, status: 'published' });
  await mealService.updatePlan(OPENID_A, { planId: plan.id, time: '19:00' });
  await expectError(
    mealService.deletePlan(OPENID_B, { planId: plan.id }),
    ErrorCodes.FORBIDDEN,
    '副账号不能删除菜单',
  );
  await mealService.deletePlan(OPENID_A, { planId: plan.id });
  const trashAfterPlanDelete = await trashService.list(OPENID_A);
  check(
    '主账号删除菜单后进入回收站（temporary）且日历事件移除',
    trashAfterPlanDelete.length === 2 &&
      trashAfterPlanDelete.some((t) => t.collection === 'meal_plans') &&
      !(await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 })).events.some(
        (e) => e.sourceId === plan.id,
      ),
    `trash=${trashAfterPlanDelete.length}`,
  );

  const trashPlan = trashAfterPlanDelete.find((t) => t.collection === 'meal_plans');
  if (trashPlan) {
    await trashService.restore(OPENID_A, { trashId: trashPlan.id });
    const restored = await mealService.listPlansByMonth(OPENID_A, { year: 2026, month: 10 });
    const restoredOct = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
    check(
      '恢复菜单后回到原状态并重建日历事件',
      restored.some((p) => p.id === plan.id && p.time === '19:00') &&
        restoredOct.events.some((e) => e.sourceId === plan.id),
      `plans=${restored.length}, events=${restoredOct.events.filter((e) => e.sourceId === plan.id).length}`,
    );
  } else {
    check('找到回收站中的菜单记录', false);
  }

  // ---- 14 天自动过期 + 72 小时自动清除 ----
  const expiring = await mealService.createPlan(OPENID_A, {
    date: '2026-09-01',
    name: '即将过期的菜单',
  });
  const now = new Date();
  await db.collection('meal_plans').doc(expiring.id).update({
    data: { expireAt: new Date(now.getTime() - 3600000) },
  });
  const moved = await mealService.autoExpire(new Date(now.getTime() + 3600000));
  check('14 天到期菜单被自动移入回收站', moved === 1, `moved=${moved}`);
  const trashAfterExpire = await trashService.list(OPENID_A);
  const expiredTrash = trashAfterExpire.find((t) => t.recordId === expiring.id);
  check(
    '过期记录删除原记录且原因标记 auto_expire',
    !!expiredTrash && expiredTrash.deleteReason === 'auto_expire',
  );
  if (expiredTrash) {
    await db.collection('trash_records').doc(expiredTrash.id).update({
      data: { purgeAt: new Date(now.getTime() - 3600000) },
    });
    const purged = await trashService.autoPurge(new Date(now.getTime() + 3600000));
    check('72 小时到期回收站记录被永久删除', purged === 1, `purged=${purged}`);
  }

  // ---- 跨空间 ----
  check(
    'C（独立空间）看不到 A 的素材/菜单/回收站',
    (await mealService.listTemplates(OPENID_C)).length === 0 &&
      (await mealService.listPlansByMonth(OPENID_C, { year: 2026, month: 10 })).length === 0 &&
      (await trashService.list(OPENID_C)).length === 0,
  );
  await expectError(
    mealService.updateTemplate(OPENID_C, { templateId: t1.id, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
    'C 不能篡改 A 的素材',
  );

  console.log(failures === 0 ? '\n===== 第四阶段云端 E2E 全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .then(cleanup)
  .catch((err) => {
    console.error('E2E 异常:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));

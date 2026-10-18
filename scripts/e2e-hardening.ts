/**
 * 1.0.2 架构加固云端端到端验证（连真实云环境）：
 * 事务化联动写（上架/编辑/下架/删除/恢复）→ 乐观锁冲突（CONFLICT）→ 审计日志 → 清理。
 *
 * 运行：
 *   npx esbuild scripts/e2e-hardening.ts --bundle --platform=node --target=node18
 *     --format=cjs --outfile=work/e2e-hardening.cjs --external:wx-server-sdk
 *   powershell -File work/set-env.ps1
 *   node work/e2e-hardening.cjs
 */
import cloud from 'wx-server-sdk';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { ManageService } from '../apps/miniprogram/cloudfunctions/_shared/manageService';
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
const manageService = new ManageService(repo);

const OPENID_A = `e2e-h-a-${Date.now()}`;
const OPENID_B = `e2e-h-b-${Date.now()}`;
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
    check(label, got === code, `预期 ${code}，实际 ${got}（${(err as Error).message}）`);
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
      await db.collection('meal_plans').where({ spaceId: testSpaceId }).remove();
      await db.collection('meal_templates').where({ spaceId: testSpaceId }).remove();
      await db.collection('trash_records').where({ spaceId: testSpaceId }).remove();
      await db.collection('calendar_events').where({ spaceId: testSpaceId }).remove();
    }
    console.log('[清理] 临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  console.log(`环境: ${envId}`);

  const created = await spaceService.createSpace(OPENID_A, { name: 'E2E加固临时空间' });
  testSpaceId = created.space.spaceId;
  await spaceService.joinSpace(OPENID_B, { inviteCode: created.inviteCode });
  console.log(`[准备] 空间 ${testSpaceId}，A/B 已绑定`);

  // 1) 事务：上架带时间的今日菜单 → 日历事件同事务创建
  const plan = await mealService.createPlan(OPENID_A, {
    date: '2026-08-20',
    time: '18:30',
    name: 'E2E晚餐',
  });
  const eventAfterCreate = await repo.findCalendarEventBySource(testSpaceId, 'meal', plan.id);
  check(
    '事务-上架：菜单与日历事件同事务写入',
    !!eventAfterCreate && eventAfterCreate.title === '🍚 E2E晚餐',
    eventAfterCreate?.title ?? '无事件',
  );
  check('事务-上架：初始版本为 1', plan.version === 1, `version=${plan.version}`);

  // 2) 事务：编辑（v1→v2），日历事件时间同步
  const updated = await mealService.updatePlan(OPENID_B, {
    planId: plan.id,
    version: 1,
    time: '19:00',
  });
  const eventAfterUpdate = await repo.findCalendarEventBySource(testSpaceId, 'meal', plan.id);
  check(
    '事务-编辑：v1 修改成功且版本递增',
    updated.version === 2,
    `version=${updated.version}`,
  );
  check(
    '事务-编辑：日历事件时间同步为 19:00',
    eventAfterUpdate?.startTime.toISOString() ===
      new Date('2026-08-20T19:00:00+08:00').toISOString(),
    eventAfterUpdate?.startTime.toISOString() ?? '无事件',
  );

  // 3) 乐观锁：旧版本 1 再次修改 → CONFLICT
  await expectError(
    mealService.updatePlan(OPENID_B, { planId: plan.id, version: 1, time: '20:00' }),
    ErrorCodes.CONFLICT,
    '乐观锁：旧版本 1 修改被拒绝（当前已是 2）',
  );

  // 4) 乐观锁：新版本 2 成功 → v3
  const updated2 = await mealService.updatePlan(OPENID_B, {
    planId: plan.id,
    version: 2,
    time: '20:00',
  });
  check('乐观锁：新版本 2 修改成功且版本递增', updated2.version === 3, `version=${updated2.version}`);

  // 5) 事务：下架 → 日历事件同事务删除
  await mealService.offlinePlan(OPENID_B, { planId: plan.id, version: 3 });
  const eventAfterOffline = await repo.findCalendarEventBySource(testSpaceId, 'meal', plan.id);
  check('事务-下架：日历事件随之下架', eventAfterOffline === null);

  // 6) 事务：删除（已下架快照）→ 回收站；恢复后保持下架状态，不应重建事件
  await mealService.deletePlan(OPENID_A, { planId: plan.id });
  const trash = await trashService.list(OPENID_A);
  const trashed = trash.find((t) => t.recordId === plan.id);
  check(
    '事务-删除：菜单进入回收站',
    !!trashed && trashed.collection === 'meal_plans' && trashed.deleteReason === 'manual_delete',
    trashed?.deleteReason ?? '未找到',
  );
  if (trashed) {
    await trashService.restore(OPENID_A, { trashId: trashed.id });
    const eventAfterRestore = await repo.findCalendarEventBySource(testSpaceId, 'meal', plan.id);
    check(
      '事务-恢复：已下架快照恢复后不重建日历事件（状态一致）',
      eventAfterRestore === null,
    );
  }

  // 7) 事务-恢复（上架快照）：删除后恢复 → 日历事件重建
  const planB = await mealService.createPlan(OPENID_A, {
    date: '2026-08-21',
    time: '12:00',
    name: 'E2E午餐',
  });
  await mealService.deletePlan(OPENID_A, { planId: planB.id });
  const trashB = (await trashService.list(OPENID_A)).find((t) => t.recordId === planB.id);
  check('事务-删除：第二个菜单进入回收站', !!trashB);
  if (trashB) {
    await trashService.restore(OPENID_A, { trashId: trashB.id });
    const eventB = await repo.findCalendarEventBySource(testSpaceId, 'meal', planB.id);
    check(
      '事务-恢复：上架快照恢复后重建日历事件',
      !!eventB && eventB.title === '🍚 E2E午餐',
      eventB?.title ?? '无事件',
    );
  }

  // 8) 审计日志：主账号可读且包含关键动作
  const audit = await manageService.listAuditLogs(OPENID_A);
  const actions = audit.logs.map((l) => l.action);
  check(
    '审计：包含 meal.plan.create/update/offline/delete/trash.restore',
    ['meal.plan.create', 'meal.plan.update', 'meal.plan.offline', 'meal.plan.delete', 'trash.restore'].every(
      (a) => actions.includes(a),
    ),
    actions.join(','),
  );

  // 9) 月视图聚合仍正常（回归）
  const month = await calendarService.getMonth(OPENID_A, { year: 2026, month: 8 });
  check('回归：日历月视图正常返回', Array.isArray(month.events));

  console.log(
    failures === 0 ? '\n===== 1.0.2 云端加固测试全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('E2E 执行异常:', String((err as Error).message || err));
    process.exitCode = 1;
  })
  .finally(cleanup);

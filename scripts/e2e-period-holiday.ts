/**
 * 第三阶段云端端到端验证（连真实云环境）：
 * A 建空间 → B 加入 → 记录生理期（预测/滚动/休息日）→ 节假日聚合 →
 * 显示开关 → MEMBER 删除被拒 → 跨空间隔离 → 清理全部临时数据。
 *
 * 运行：npx esbuild scripts/e2e-period-holiday.ts --bundle --platform=node --target=node18
 *       --format=cjs --outfile=work/e2e-phase3.cjs --external:wx-server-sdk
 * 然后设置密钥后 node work/e2e-phase3.cjs
 */
import cloud from 'wx-server-sdk';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
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
const calendarService = new CalendarService(repo);

const OPENID_A = `e2e3-a-${Date.now()}`;
const OPENID_B = `e2e3-b-${Date.now()}`;
const OPENID_C = `e2e3-c-${Date.now()}`;
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

async function expectError(
  promise: Promise<unknown>,
  code: string,
  label: string,
): Promise<void> {
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
      await db.collection('period_records').where({ spaceId: testSpaceId }).remove();
      await db.collection('space_settings').where({ spaceId: testSpaceId }).remove();
      await db.collection('calendar_events').where({ spaceId: testSpaceId }).remove();
      await db.collection('todos').where({ spaceId: testSpaceId }).remove();
    }
    if (cTestSpaceId) {
      await db.collection('spaces').doc(cTestSpaceId).remove();
      await db.collection('space_members').where({ spaceId: cTestSpaceId }).remove();
      await db.collection('audit_logs').where({ spaceId: cTestSpaceId }).remove();
    }
    console.log('[清理] 第三阶段临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  console.log(`环境: ${envId}`);

  const created = await spaceService.createSpace(OPENID_A, { name: 'E2E3临时空间' });
  testSpaceId = created.space.spaceId;
  await spaceService.joinSpace(OPENID_B, { inviteCode: created.inviteCode });
  const cSpace = await spaceService.createSpace(OPENID_C, { name: 'E2E3-C空间' });
  const cSpaceId = cSpace.space.spaceId;
  cTestSpaceId = cSpaceId;
  console.log(`[准备] A/B 同一空间 ${testSpaceId}，C 独立空间 ${cSpaceId}`);

  // ---- 生理期记录与预测 ----
  const first = await periodService.recordActual(OPENID_A, {
    startDate: '2026-07-23',
    endDate: '2026-07-27',
  });
  const predicted1 = first.find((v) => v.type === 'predicted');
  check(
    '第一次记录生成预测：结束日 07-27 + 22 天 = 08-18~08-24',
    !!predicted1 && predicted1.startDate === '2026-08-18' && predicted1.endDate === '2026-08-24',
    predicted1 ? `${predicted1.startDate}~${predicted1.endDate}` : '无预测',
  );

  const third = await periodService.recordActual(OPENID_A, {
    startDate: '2026-06-01',
    endDate: '2026-06-05',
  });
  const viewsAfterRoll = await periodService.recordActual(OPENID_A, {
    startDate: '2026-08-14',
    endDate: '2026-08-18',
  });
  const actuals = viewsAfterRoll.filter((v) => v.type === 'actual');
  const predictedAfter = viewsAfterRoll.find((v) => v.type === 'predicted');
  check(
    '滚动：只保留最近 2 条 actual + 1 条 predicted',
    actuals.length === 2 &&
      viewsAfterRoll.filter((v) => v.type === 'predicted').length === 1 &&
      predictedAfter?.startDate === '2026-09-09' &&
      predictedAfter?.endDate === '2026-09-15',
    actuals.map((v) => v.startDate).join(', ') +
      (predictedAfter ? ` / 预测 ${predictedAfter.startDate}~${predictedAfter.endDate}` : ''),
  );
  void third;

  // ---- 月视图聚合 ----
  const aug = await calendarService.getMonth(OPENID_A, { year: 2026, month: 8 });
  const augByDate = new Map(aug.periodDays.map((d) => [d.date, d]));
  check(
    '8 月日历含生理期 08-14~18 与休息 08-19',
      augByDate.get('2026-08-14')?.kind === 'period' &&
      augByDate.get('2026-08-18')?.kind === 'period' &&
      augByDate.get('2026-08-19')?.kind === 'rest' &&
      augByDate.get('2026-08-20') === undefined,
    [...aug.periodDays.map((d) => `${d.date}:${d.kind}`)].join(', '),
  );

  const oct = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
  const octHoliday = oct.holidays.find((h) => h.date === '2026-10-01');
  const octMakeup = oct.holidays.find((h) => h.date === '2026-10-10');
  check(
    '10 月日历显示国庆 10-01 放假、10-10 调休上班',
    !!octHoliday && octHoliday.name === '国庆节' && octHoliday.isHoliday &&
      !!octMakeup && octMakeup.isMakeupWorkday && octMakeup.isWorkday,
    octHoliday && octMakeup ? `${octHoliday.name} / ${octMakeup.name}` : '缺少节假日数据',
  );

  const sep = await calendarService.getMonth(OPENID_A, { year: 2026, month: 9 });
  check(
    '9 月日历显示 09-20 调休上班（国庆补班）',
    sep.holidays.some((h) => h.date === '2026-09-20' && h.isMakeupWorkday),
  );

  // ---- 显示开关 ----
  const infoBefore = await periodService.info(OPENID_A);
  check('默认显示生理期为开', infoBefore.calendarVisible === true);
  await periodService.setCalendarVisible(OPENID_B, { visible: false });
  const infoAfter = await periodService.info(OPENID_A);
  check(
    '关闭开关后 info.calendarVisible=false 且数据保留',
    infoAfter.calendarVisible === false && infoAfter.records.length === 3,
    `records=${infoAfter.records.length}`,
  );

  // ---- 权限 ----
  const anActual = viewsAfterRoll.find((v) => v.type === 'actual');
  if (anActual) {
    await expectError(
      periodService.delete(OPENID_B, { recordId: anActual.id }),
      ErrorCodes.FORBIDDEN,
      'MEMBER 删除生理期记录被拒',
    );
    await periodService.delete(OPENID_A, { recordId: anActual.id });
    const afterDelete = await periodService.list(OPENID_A);
    check(
      'OWNER 删除后重新计算预测（1 actual + 1 predicted）',
      afterDelete.filter((v) => v.type === 'actual').length === 1 &&
        afterDelete.filter((v) => v.type === 'predicted').length === 1,
      `actual=${afterDelete.filter((v) => v.type === 'actual').length}, predicted=${afterDelete.filter((v) => v.type === 'predicted').length}`,
    );
  } else {
    check('找到可删除的 actual 记录', false);
  }

  // ---- 跨空间 ----
  await periodService.recordActual(OPENID_A, {
    startDate: '2026-10-01',
    endDate: '2026-10-05',
  });
  const cList = await periodService.list(OPENID_C);
  check(
    'C（独立空间）看不到 A 的生理期记录',
    cList.length === 0,
    `C records=${cList.length}`,
  );
  const cMonth = await calendarService.getMonth(OPENID_C, { year: 2026, month: 10 });
  check(
    'C 的 10 月日历没有 A 的生理期标记（节假日共享）',
    cMonth.periodDays.length === 0 && cMonth.holidays.length > 0,
    `periodDays=${cMonth.periodDays.length}, holidays=${cMonth.holidays.length}`,
  );

  console.log(failures === 0 ? '\n===== 第三阶段云端 E2E 全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .then(cleanup)
  .catch((err) => {
    console.error('E2E 异常:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));

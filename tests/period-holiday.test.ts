import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { HolidayService } from '../apps/miniprogram/cloudfunctions/_shared/holidayService';
import { PeriodService } from '../apps/miniprogram/cloudfunctions/_shared/periodService';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import type { HolidayRecord } from '../apps/miniprogram/cloudfunctions/_shared/repo';
import { MemoryRepo } from './memoryRepo';

async function fresh(clock: () => Date = () => new Date()) {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const periodService = new PeriodService(repo, clock);
  const calendarService = new CalendarService(repo);
  const holidayService = new HolidayService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  return { repo, spaceService, periodService, calendarService, holidayService, space: created.space };
}

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    assert.equal((err as { code?: string }).code, code);
    return;
  }
  assert.fail(`预期抛出 ${code}，但没有抛错`);
}

function seedHoliday(
  repo: MemoryRepo,
  date: string,
  name: string,
  type: HolidayRecord['type'],
  opts: Partial<Pick<HolidayRecord, 'isHoliday' | 'isWorkday' | 'isMakeupWorkday'>> = {},
): void {
  void repo.upsertHoliday({
    id: `hol_${date}`,
    year: Number(date.slice(0, 4)),
    date,
    name,
    type,
    isHoliday: opts.isHoliday ?? type === 'holiday',
    isWorkday: opts.isWorkday ?? type === 'makeup_workday',
    isMakeupWorkday: opts.isMakeupWorkday ?? type === 'makeup_workday',
    source: '国办发明电〔2025〕7号',
    version: 1,
    updatedAt: new Date(),
  });
}

test('记录第一次实际生理期：预计开始 = 开始日 + 28 天（单日标记，不再用时间段）', async () => {
  const { periodService } = await fresh();
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-07-23',
    endDate: '2026-07-27',
  });

  assert.equal(views.length, 2);
  const actual = views.find((v) => v.type === 'actual');
  const predicted = views.find((v) => v.type === 'predicted');
  assert.ok(actual && predicted);
  assert.equal(actual.startDate, '2026-07-23');
  assert.equal(actual.isEstimated, false);
  assert.equal(predicted.startDate, '2026-08-20');
  assert.equal(predicted.endDate, '2026-08-20');
  assert.equal(predicted.isEstimated, true);
  assert.equal(predicted.cycleLength, 28);
});

test('第二次实际生理期：只保留最近 2 条 actual + 1 条 predicted，旧数据滚动', async () => {
  const { periodService } = await fresh();
  await periodService.recordActual('openid-A', {
    startDate: '2026-06-01',
    endDate: '2026-06-05',
  });
  await periodService.recordActual('openid-A', {
    startDate: '2026-07-23',
    endDate: '2026-07-27',
  });
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-14',
    endDate: '2026-08-18',
  });

  const actuals = views.filter((v) => v.type === 'actual');
  const predicted = views.filter((v) => v.type === 'predicted');
  assert.equal(actuals.length, 2);
  assert.equal(predicted.length, 1);
  assert.deepEqual(
    actuals.map((v) => v.startDate),
    ['2026-07-23', '2026-08-14'],
  );
  // 预测 = 最近实际结束 08-18 + 22 天 = 09-09，持续 7 天
  assert.equal(predicted[0].startDate, '2026-09-11');
  assert.equal(predicted[0].endDate, '2026-09-11');
});

test('月视图：生理期红色 + 结束后 1 天蓝色休息；预测（08-27 起）不产生休息标记', async () => {
  const { calendarService, periodService } = await fresh();
  await periodService.recordActual('openid-A', {
    startDate: '2026-08-01',
    endDate: '2026-08-05',
  });
  const month = await calendarService.getMonth('openid-A', { year: 2026, month: 8 });
  const byDate = new Map(month.periodDays.map((d) => [d.date, d]));
  assert.equal(byDate.get('2026-08-01')?.kind, 'period');
  assert.equal(byDate.get('2026-08-05')?.kind, 'period');
  assert.equal(byDate.get('2026-08-06')?.kind, 'rest');
  assert.equal(byDate.get('2026-08-07'), undefined);
  // 预测 = 08-05 + 22 天 = 08-27 ~ 09-02；8 月内为 08-27~08-31
  assert.equal(byDate.get('2026-08-23'), undefined);
  assert.equal(byDate.get('2026-08-29')?.kind, 'period');
  assert.equal(byDate.get('2026-08-30'), undefined);
  // 预测结束后一天 09-03 不应标记休息
  assert.equal(byDate.get('2026-09-03'), undefined);
});

test('今日状态：今日处于预测生理期，返回 today=period 与下次预测（08-18~08-24）', async () => {
  const clock = () => new Date('2026-08-20T00:00:00+08:00');
  const { periodService } = await fresh(clock);
  await periodService.recordActual('openid-A', {
    startDate: '2026-07-23',
    endDate: '2026-07-27',
  });
  const info = await periodService.info('openid-A');
  assert.deepEqual(info.today, { date: '2026-08-20', kind: 'period' });
  assert.deepEqual(info.nextPredicted, { startDate: '2026-08-20', endDate: '2026-08-20' });
  assert.equal(info.calendarVisible, true);
});

test('休息日状态：实际生理期结束后第 1 天为 rest（Asia/Shanghai 时钟）', async () => {
  const clock = () => new Date('2026-08-06T10:00:00+08:00');
  const { periodService } = await fresh(clock);
  await periodService.recordActual('openid-A', {
    startDate: '2026-08-01',
    endDate: '2026-08-05',
  });
  const info = await periodService.info('openid-A');
  assert.deepEqual(info.today, { date: '2026-08-06', kind: 'rest' });
});

test('时区：UTC 23 点（上海已是次日 07:00）按 Asia/Shanghai 判定', async () => {
  const clock = () => new Date('2026-08-19T23:00:00Z');
  const { periodService } = await fresh(clock);
  await periodService.recordActual('openid-A', {
    startDate: '2026-07-23',
    endDate: '2026-07-27',
  });
  const info = await periodService.info('openid-A');
  assert.deepEqual(info.today, { date: '2026-08-20', kind: 'period' });
});

test('跨空间：C 无法读取 A 的生理期记录；同空间 B 可共享', async () => {
  const { periodService, spaceService } = await fresh();
  await periodService.recordActual('openid-A', {
    startDate: '2026-08-01',
    endDate: '2026-08-05',
  });
  const bList = await periodService.list('openid-B');
  assert.equal(bList.filter((v) => v.type === 'actual').length, 1);
  await expectError(periodService.list('openid-C'), ErrorCodes.NOT_IN_SPACE);
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  const cList = await periodService.list('openid-C');
  assert.equal(cList.length, 0);
});

test('权限：MEMBER 不能删除生理期记录，OWNER 可以', async () => {
  const { periodService } = await fresh();
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-01',
    endDate: '2026-08-05',
  });
  const actual = views.find((v) => v.type === 'actual');
  assert.ok(actual);
  await expectError(
    periodService.delete('openid-B', { recordId: actual.id }),
    ErrorCodes.FORBIDDEN,
  );
  await periodService.delete('openid-A', { recordId: actual.id });
  const after = await periodService.list('openid-A');
  assert.equal(after.filter((v) => v.type === 'actual').length, 0);
  assert.equal(after.filter((v) => v.type === 'predicted').length, 0);
});

test('显示开关：关闭后 info.calendarVisible=false，但数据不删除', async () => {
  const { periodService } = await fresh();
  await periodService.recordActual('openid-A', {
    startDate: '2026-08-01',
    endDate: '2026-08-05',
  });
  const res = await periodService.setCalendarVisible('openid-B', { visible: false });
  assert.equal(res.visible, false);
  const info = await periodService.info('openid-A');
  assert.equal(info.calendarVisible, false);
  assert.equal(info.records.length, 2);
});

test('两步记录：先记开始日期，期间内补录结束日期（双人平等）', async () => {
  const clock = () => new Date('2026-08-16T10:00:00+08:00');
  const { periodService } = await fresh(clock);
  // 8.14 生理期来了，先只记开始日期（结束=开始）
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  });
  const actual = views.find((v) => v.type === 'actual');
  assert.ok(actual);
  assert.equal(actual.endDate, '2026-08-14');

  // 副账号 B 在生理期期间（8.14~8.21）补录结束日期
  const updated = await periodService.updateEnd('openid-B', {
    recordId: actual.id,
    endDate: '2026-08-21',
  });
  const updatedActual = updated.find((v) => v.id === actual.id);
  assert.equal(updatedActual?.endDate, '2026-08-21');
  // 预测 = 最近实际开始日（08-14）+ 28 天 = 09-11（单日）
  const predicted = updated.find((v) => v.type === 'predicted');
  assert.equal(predicted?.startDate, '2026-09-11');
  assert.equal(predicted?.endDate, '2026-09-11');
});

test('补录结束日期：非法输入 / 预测记录 / 跨空间被拒绝', async () => {
  const clock = () => new Date('2026-08-16T10:00:00+08:00');
  const { periodService, spaceService } = await fresh(clock);
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  });
  const actual = views.find((v) => v.type === 'actual');
  const predicted = views.find((v) => v.type === 'predicted');
  assert.ok(actual && predicted);
  // 结束早于开始
  await expectError(
    periodService.updateEnd('openid-A', { recordId: actual.id, endDate: '2026-08-13' }),
    ErrorCodes.VALIDATION,
  );
  // 超出合理范围（>31 天）
  await expectError(
    periodService.updateEnd('openid-A', { recordId: actual.id, endDate: '2026-09-30' }),
    ErrorCodes.VALIDATION,
  );
  // 预测记录不能修改结束日期
  await expectError(
    periodService.updateEnd('openid-A', { recordId: predicted.id, endDate: '2026-08-20' }),
    ErrorCodes.VALIDATION,
  );
  // 跨空间无法补录
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  await expectError(
    periodService.updateEnd('openid-C', { recordId: actual.id, endDate: '2026-08-21' }),
    ErrorCodes.NOT_FOUND,
  );
});

test('修改生理期记录：改错日期直接替换，不新增重复记录', async () => {
  const clock = () => new Date('2026-08-16T10:00:00+08:00');
  const { periodService } = await fresh(clock);
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  });
  const actual = views.find((v) => v.type === 'actual');
  assert.ok(actual);

  // 副账号 B 修改日期（改错了直接改，不新增）
  const updated = await periodService.update('openid-B', {
    recordId: actual.id,
    startDate: '2026-08-15',
    endDate: '2026-08-21',
  });
  const actuals = updated.filter((v) => v.type === 'actual');
  assert.equal(actuals.length, 1);
  assert.equal(actuals[0].startDate, '2026-08-15');
  assert.equal(actuals[0].endDate, '2026-08-21');
  // 预测基于新的开始日 +28 天
  const predicted = updated.find((v) => v.type === 'predicted');
  assert.equal(predicted?.startDate, '2026-09-12');
});

test('修改生理期记录：非法输入 / 预测记录 / 跨空间被拒绝', async () => {
  const clock = () => new Date('2026-08-16T10:00:00+08:00');
  const { periodService, spaceService } = await fresh(clock);
  const views = await periodService.recordActual('openid-A', {
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  });
  const actual = views.find((v) => v.type === 'actual');
  const predicted = views.find((v) => v.type === 'predicted');
  assert.ok(actual && predicted);
  await expectError(
    periodService.update('openid-A', {
      recordId: actual.id,
      startDate: '2026-08-20',
      endDate: '2026-08-14',
    }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    periodService.update('openid-A', {
      recordId: actual.id,
      startDate: '2026-08-14',
      endDate: '2026-09-30',
    }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    periodService.update('openid-A', {
      recordId: predicted.id,
      startDate: '2026-09-10',
      endDate: '2026-09-12',
    }),
    ErrorCodes.VALIDATION,
  );
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  await expectError(
    periodService.update('openid-C', {
      recordId: actual.id,
      startDate: '2026-08-15',
      endDate: '2026-08-21',
    }),
    ErrorCodes.NOT_FOUND,
  );
});

test('节假日：国庆 10-01 放假、10-10 调休上班，以 HolidayCalendar 为准', async () => {
  const { holidayService, repo } = await fresh();
  seedHoliday(repo, '2026-10-01', '国庆节', 'holiday');
  seedHoliday(repo, '2026-10-02', '国庆节', 'holiday');
  seedHoliday(repo, '2026-10-10', '调休上班', 'makeup_workday', {
    isHoliday: false,
    isWorkday: true,
    isMakeupWorkday: true,
  });
  seedHoliday(repo, '2026-10-11', '普通周末', 'weekend', {
    isHoliday: false,
    isWorkday: false,
    isMakeupWorkday: false,
  });

  const month = await holidayService.month(2026, 10);
  const byDate = new Map(month.map((h) => [h.date, h]));
  assert.equal(byDate.get('2026-10-01')?.isHoliday, true);
  assert.equal(byDate.get('2026-10-01')?.name, '国庆节');
  assert.equal(byDate.get('2026-10-10')?.isMakeupWorkday, true);
  assert.equal(byDate.get('2026-10-10')?.isWorkday, true);
  assert.equal(byDate.get('2026-10-10')?.isHoliday, false);
  // 范围之外不返回
  assert.equal(byDate.has('2026-09-30'), false);
});

test('calendar-month 聚合：同时返回 periodDays 与 holidays（首页/日历一次请求）', async () => {
  const { calendarService, repo, periodService } = await fresh();
  await periodService.recordActual('openid-A', {
    startDate: '2026-10-01',
    endDate: '2026-10-05',
  });
  seedHoliday(repo, '2026-10-01', '国庆节', 'holiday');
  const month = await calendarService.getMonth('openid-A', { year: 2026, month: 10 });
  assert.equal(month.periodDays.some((d) => d.date === '2026-10-01'), true);
  assert.equal(month.holidays.length, 1);
  assert.equal(month.holidays[0].name, '国庆节');
});

test('校验：非法日期/开始晚于结束被拒绝', async () => {
  const { periodService } = await fresh();
  await expectError(
    periodService.recordActual('openid-A', { startDate: '2026-13-40', endDate: '2026-08-05' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    periodService.recordActual('openid-A', { startDate: '2026-08-10', endDate: '2026-08-05' }),
    ErrorCodes.VALIDATION,
  );
});

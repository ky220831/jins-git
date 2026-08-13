import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AnniversaryService } from '../apps/miniprogram/cloudfunctions/_shared/anniversaryService';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TravelService } from '../apps/miniprogram/cloudfunctions/_shared/travelService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { MemoryRepo } from './memoryRepo';

const BASE = new Date('2026-08-13T10:00:00+08:00');

async function fresh(clock: () => Date = () => BASE) {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const anniversaryService = new AnniversaryService(repo, clock);
  const travelService = new TravelService(repo, clock);
  const trashService = new TrashService(repo);
  const calendarService = new CalendarService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  return { repo, spaceService, anniversaryService, travelService, trashService, calendarService, space: created.space };
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

test('纪念日：新增/编辑双人平等，正倒计时与每年重复', async () => {
  const { anniversaryService } = await fresh();
  const created = await anniversaryService.create('openid-A', {
    name: '在一起',
    date: '2026-08-20',
    note: '第一次约会',
  });
  assert.equal(created.name, '在一起');
  assert.equal(created.yearly, true);
  assert.equal(created.nextOccurrence, '2026-08-20');
  assert.equal(created.daysToNext, 7);
  assert.equal(created.elapsedDays, -7);

  const past = await anniversaryService.create('openid-A', { name: '领证', date: '2020-08-08' });
  assert.equal(past.elapsedDays, 2196);
  assert.equal(past.nextOccurrence, '2027-08-08');

  const updated = await anniversaryService.update('openid-B', {
    anniversaryId: created.id,
    name: '在一起纪念日',
    note: '每年都过',
  });
  assert.equal(updated.name, '在一起纪念日');
  assert.equal(updated.version, 2);
  assert.equal((await anniversaryService.list('openid-A')).length, 2);
});

test('纪念日：副账号不能删除，主账号删除进回收站（permanent）', async () => {
  const { anniversaryService, trashService } = await fresh();
  const created = await anniversaryService.create('openid-A', { name: '结婚', date: '2019-08-20' });
  await expectError(
    anniversaryService.remove('openid-B', { anniversaryId: created.id }),
    ErrorCodes.FORBIDDEN,
  );
  await anniversaryService.remove('openid-A', { anniversaryId: created.id });
  assert.equal((await anniversaryService.list('openid-A')).length, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'anniversaries');
  assert.equal(trash[0].retentionType, 'permanent');
});

test('纪念日：日历月视图包含虚拟事件，非每年重复只出现在原始年份', async () => {
  const { anniversaryService, calendarService } = await fresh();
  await anniversaryService.create('openid-A', { name: '在一起', date: '2026-08-20', time: '18:30' });
  await anniversaryService.create('openid-A', { name: '一次性的日子', date: '2025-08-21', yearly: false });

  const month2026 = await calendarService.getMonth('openid-A', { year: 2026, month: 8 });
  const av = month2026.events.find((e) => e.sourceType === 'anniversary');
  assert.ok(av);
  assert.equal(av.title, '❤️ 在一起');
  assert.equal(
    av.startTime,
    new Date('2026-08-20T18:30:00+08:00').toISOString(),
  );
  // 非重复的 2025 年纪念日不会出现在 2026-08 月视图
  assert.equal(
    month2026.events.some((e) => e.sourceType === 'anniversary' && e.title.includes('一次性')),
    false,
  );
  const month2025 = await calendarService.getMonth('openid-A', { year: 2025, month: 8 });
  assert.equal(
    month2025.events.some((e) => e.sourceType === 'anniversary' && e.title.includes('一次性')),
    true,
  );
});

test('纪念日：跨空间隔离，C 无法读取/修改 A 的纪念日', async () => {
  const { anniversaryService } = await fresh();
  const created = await anniversaryService.create('openid-A', { name: '私密纪念日', date: '2026-08-20' });
  assert.equal((await anniversaryService.list('openid-C')).length, 0);
  await expectError(
    anniversaryService.update('openid-C', { anniversaryId: created.id, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    anniversaryService.remove('openid-C', { anniversaryId: created.id }),
    ErrorCodes.NOT_FOUND,
  );
});

test('旅游：新增/编辑资料双人平等，行程清单解析', async () => {
  const { travelService } = await fresh();
  const created = await travelService.createTrip('openid-A', {
    name: '北海道之旅',
    country: '日本',
    city: '札幌',
    transport: '飞机 + JR',
    hotel: '星野度假村',
    itinerary: [
      { date: '2026-08-20', title: '小樽运河', note: '拍照' },
      { title: '白色恋人公园' },
    ],
  });
  assert.equal(created.name, '北海道之旅');
  assert.equal(created.itinerary.length, 2);
  assert.equal(created.itinerary[0].date, '2026-08-20');

  const updated = await travelService.updateTrip('openid-B', {
    tripId: created.id,
    note: '提前买 JR 周游券',
  });
  assert.equal(updated.note, '提前买 JR 周游券');
  assert.equal(updated.version, 2);
  assert.equal((await travelService.listTrips('openid-A')).length, 1);
});

test('旅游：副账号不能删除资料；主账号删除进回收站（permanent）', async () => {
  const { travelService, trashService } = await fresh();
  const created = await travelService.createTrip('openid-A', { name: '东京之旅', country: '日本' });
  await expectError(travelService.deleteTrip('openid-B', { tripId: created.id }), ErrorCodes.FORBIDDEN);
  await travelService.deleteTrip('openid-A', { tripId: created.id });
  assert.equal((await travelService.listTrips('openid-A')).length, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'trips');
  assert.equal(trash[0].retentionType, 'permanent');
});

test('行程：创建生成 ✈️ 日历事件（无时间也全天显示），下架移除，修改同步', async () => {
  const { repo, travelService } = await fresh();
  const trip = await travelService.createTrip('openid-A', { name: '北海道之旅' });
  const plan = await travelService.createPlan('openid-A', {
    tripId: trip.id,
    startDate: '2026-08-20',
    endDate: '2026-08-24',
    time: '08:00',
  });
  assert.equal(plan.name, '北海道之旅');
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === plan.id);
  assert.ok(event);
  assert.equal(event.sourceType, 'trip');
  assert.equal(event.title, '✈️ 北海道之旅');

  await travelService.updatePlan('openid-B', { planId: plan.id, time: '09:30' });
  const updatedEvent = [...repo.calendarEvents.values()].find((e) => e.sourceId === plan.id);
  assert.equal(
    updatedEvent?.startTime.toISOString(),
    new Date('2026-08-20T09:30:00+08:00').toISOString(),
  );

  await travelService.offlinePlan('openid-B', { planId: plan.id });
  assert.equal(repo.calendarEvents.size, 0);

  const noTime = await travelService.createPlan('openid-B', { startDate: '2026-08-21', name: '全天行程' });
  const noTimeEvent = [...repo.calendarEvents.values()].find((e) => e.sourceId === noTime.id);
  assert.equal(
    noTimeEvent?.startTime.toISOString(),
    new Date('2026-08-21T00:00:00+08:00').toISOString(),
  );
});

test('行程：副账号不能删除；主账号删除进回收站（temporary），恢复后重建日历事件', async () => {
  const { repo, travelService, trashService } = await fresh();
  const plan = await travelService.createPlan('openid-A', { startDate: '2026-08-20', name: '东京一日' });
  await expectError(travelService.deletePlan('openid-B', { planId: plan.id }), ErrorCodes.FORBIDDEN);
  await travelService.deletePlan('openid-A', { planId: plan.id });
  assert.equal(repo.calendarEvents.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'trip_plans');
  assert.equal(trash[0].retentionType, 'temporary');

  await trashService.restore('openid-A', { trashId: trash[0].id });
  const restoredEvent = [...repo.calendarEvents.values()].find(
    (e) => e.sourceId === plan.id && e.sourceType === 'trip',
  );
  assert.ok(restoredEvent);
  assert.equal(restoredEvent.title, '✈️ 东京一日');
});

test('行程：14 天自动清理进回收站，72 小时后永久删除', async () => {
  const { repo, travelService, trashService } = await fresh();
  const plan = await travelService.createPlan('openid-A', { startDate: '2026-08-20', name: '京都之旅' });
  const moved = await travelService.autoExpirePlans(new Date(BASE.getTime() + 15 * 24 * 3600000));
  assert.equal(moved, 1);
  assert.equal(repo.tripPlans.size, 0);
  assert.equal(repo.calendarEvents.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].deleteReason, 'auto_expire');

  await trashService.autoPurge(new Date(BASE.getTime() + 74 * 24 * 3600000));
  assert.equal((await trashService.list('openid-A')).length, 0);
});

test('旅游：跨空间隔离，C 无法读取/修改 A 的资料与行程', async () => {
  const { travelService } = await fresh();
  const trip = await travelService.createTrip('openid-A', { name: '私密旅行' });
  const plan = await travelService.createPlan('openid-A', { startDate: '2026-08-20', name: '私密行程' });
  assert.equal((await travelService.listTrips('openid-C')).length, 0);
  assert.equal((await travelService.listPlansByMonth('openid-C', { year: 2026, month: 8 })).length, 0);
  await expectError(
    travelService.updateTrip('openid-C', { tripId: trip.id, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    travelService.updatePlan('openid-C', { planId: plan.id, note: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    travelService.deleteTrip('openid-C', { tripId: trip.id }),
    ErrorCodes.NOT_FOUND,
  );
});

test('校验：纪念日/旅游非法输入被拒绝', async () => {
  const { anniversaryService, travelService } = await fresh();
  await expectError(
    anniversaryService.create('openid-A', { name: '', date: '2026-08-20' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    anniversaryService.create('openid-A', { name: '纪念日', date: '2026/08/20' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    travelService.createTrip('openid-A', { name: '   ' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    travelService.createPlan('openid-A', { startDate: '2026-08-20', endDate: '2026-08-19', name: 'x' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    travelService.createTrip('openid-A', {
      name: '坏坐标',
      lat: 999,
      lng: 999,
    }),
    ErrorCodes.VALIDATION,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { MemoryRepo } from './memoryRepo';

async function fresh(clock: () => Date = () => new Date('2026-08-01T00:00:00+08:00')) {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const mealService = new MealService(repo, clock);
  const trashService = new TrashService(repo);
  const calendarService = new CalendarService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  return { repo, spaceService, mealService, trashService, calendarService, space: created.space };
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

test('素材库：新增/列表/编辑，副账号可编辑', async () => {
  const { mealService } = await fresh();
  const created = await mealService.createTemplate('openid-A', {
    name: '番茄炒蛋',
    category: '家常菜',
  });
  assert.equal(created.name, '番茄炒蛋');
  assert.equal(created.enabled, true);
  await mealService.createTemplate('openid-B', { name: '红烧排骨' });

  const updated = await mealService.updateTemplate('openid-B', {
    templateId: created.id,
    version: 1,
    category: '快手菜',
  });
  assert.equal(updated.category, '快手菜');
  assert.equal(updated.version, 2);

  const list = await mealService.listTemplates('openid-A');
  assert.equal(list.length, 2);
});

test('素材库：副账号不能删除，主账号删除后进入回收站（permanent）', async () => {
  const { mealService, trashService } = await fresh();
  const created = await mealService.createTemplate('openid-A', { name: '番茄炒蛋' });
  await expectError(
    mealService.deleteTemplate('openid-B', { templateId: created.id }),
    ErrorCodes.FORBIDDEN,
  );
  await mealService.deleteTemplate('openid-A', { templateId: created.id });
  assert.equal((await mealService.listTemplates('openid-A')).length, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'meal_templates');
  assert.equal(trash[0].retentionType, 'permanent');
});

test('今日菜单：带时间上架自动生成 🍚 日历事件，下架移除', async () => {
  const { repo, mealService } = await fresh();
  const plan = await mealService.createPlan('openid-A', {
    date: '2026-08-10',
    time: '18:30',
    name: '晚餐',
  });
  assert.equal(plan.status, 'published');
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === plan.id);
  assert.ok(event);
  assert.equal(event.title, '🍚 晚餐');
  assert.equal(event.startTime.toISOString(), new Date('2026-08-10T18:30:00+08:00').toISOString());

  await mealService.offlinePlan('openid-B', { planId: plan.id, version: 1 });
  assert.equal(repo.calendarEvents.size, 0);
  const month = await mealService.listPlansByMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(month.length, 0);
});

test('今日菜单：修改时间同步日历事件', async () => {
  const { repo, mealService } = await fresh();
  const plan = await mealService.createPlan('openid-A', {
    date: '2026-08-10',
    time: '12:00',
    name: '午餐',
  });
  await mealService.updatePlan('openid-A', { planId: plan.id, version: 1, time: '13:00' });
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === plan.id);
  assert.ok(event);
  assert.equal(event.startTime.toISOString(), new Date('2026-08-10T13:00:00+08:00').toISOString());
});

test('今日菜单：副账号不能删除；主账号删除进回收站（temporary）并移除日历事件', async () => {
  const { repo, mealService, trashService } = await fresh();
  const plan = await mealService.createPlan('openid-A', {
    date: '2026-08-10',
    time: '18:30',
    name: '晚餐',
  });
  await expectError(mealService.deletePlan('openid-B', { planId: plan.id }), ErrorCodes.FORBIDDEN);
  await mealService.deletePlan('openid-A', { planId: plan.id });
  assert.equal(repo.calendarEvents.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'meal_plans');
  assert.equal(trash[0].retentionType, 'temporary');
  assert.equal(trash[0].deleteReason, 'manual_delete');
});

test('随机选择：只从启用素材中挑选并生成当天菜单', async () => {
  const { mealService } = await fresh(() => new Date('2026-08-13T10:00:00+08:00'));
  const t1 = await mealService.createTemplate('openid-A', { name: '番茄炒蛋' });
  await mealService.createTemplate('openid-A', { name: '红烧排骨' });
  await mealService.updateTemplate('openid-A', { templateId: t1.id, version: 1, enabled: false });
  const plan = await mealService.randomPick('openid-A', {});
  assert.equal(plan.name, '红烧排骨');
  assert.equal(plan.date, '2026-08-13');
  assert.equal(plan.status, 'published');
});

test('14 天自动清理：到期菜单移入回收站（auto_expire）', async () => {
  const { mealService, trashService } = await fresh(() => new Date('2026-08-01T00:00:00+08:00'));
  const plan = await mealService.createPlan('openid-A', {
    date: '2026-08-01',
    name: '早餐',
  });
  const moved = await mealService.autoExpire(new Date('2026-08-20T00:00:00+08:00'));
  assert.equal(moved, 1);
  assert.equal((await mealService.listPlansByMonth('openid-A', { year: 2026, month: 8 })).length, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].deleteReason, 'auto_expire');
  void plan;
});

test('恢复：主账号恢复菜单后回到原状态，带时间记录重建日历事件', async () => {
  const { repo, mealService, trashService } = await fresh();
  const plan = await mealService.createPlan('openid-A', {
    date: '2026-08-10',
    time: '18:30',
    name: '晚餐',
  });
  await mealService.deletePlan('openid-A', { planId: plan.id });
  assert.equal(repo.mealPlans.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);

  await trashService.restore('openid-A', { trashId: trash[0].id });
  const restored = await mealService.listPlansByMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, '晚餐');
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === plan.id);
  assert.ok(event);
  assert.equal(event.title, '🍚 晚餐');
  const trashAfter = await trashService.list('openid-A');
  assert.equal(trashAfter.length, 0);
});

test('72 小时永久删除：到期回收站记录被定时任务清掉', async () => {
  const { mealService, trashService } = await fresh(() => new Date('2026-08-01T00:00:00+08:00'));
  const plan = await mealService.createPlan('openid-A', { date: '2026-08-01', name: '早餐' });
  await mealService.deletePlan('openid-A', { planId: plan.id });
  const purged = await trashService.autoPurge(new Date('2026-08-04T01:00:00+08:00'));
  assert.equal(purged, 1);
  assert.equal((await trashService.list('openid-A')).length, 0);
});

test('回收站：副账号不能查看/恢复/永久删除', async () => {
  const { mealService, trashService } = await fresh();
  const plan = await mealService.createPlan('openid-A', { date: '2026-08-01', name: '早餐' });
  await mealService.deletePlan('openid-A', { planId: plan.id });
  await expectError(trashService.list('openid-B'), ErrorCodes.FORBIDDEN);
  const trash = await trashService.list('openid-A');
  await expectError(
    trashService.restore('openid-B', { trashId: trash[0].id }),
    ErrorCodes.FORBIDDEN,
  );
  await expectError(
    trashService.purge('openid-B', { trashId: trash[0].id }),
    ErrorCodes.FORBIDDEN,
  );
});

test('跨空间：C 看不到 A 的素材、菜单与回收站', async () => {
  const { mealService, trashService } = await fresh();
  const t = await mealService.createTemplate('openid-A', { name: 'A 的菜谱' });
  const plan = await mealService.createPlan('openid-A', { date: '2026-08-01', name: 'A 的菜单' });
  await mealService.deletePlan('openid-A', { planId: plan.id });

  assert.equal((await mealService.listTemplates('openid-C')).length, 0);
  assert.equal((await mealService.listPlansByMonth('openid-C', { year: 2026, month: 8 })).length, 0);
  await expectError(
    mealService.updateTemplate('openid-C', { templateId: t.id, version: 1, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    mealService.updatePlan('openid-C', { planId: plan.id, version: 1, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  assert.equal((await trashService.list('openid-C')).length, 0);
});

test('校验：非法日期/时间/空名称被拒绝', async () => {
  const { mealService } = await fresh();
  await expectError(
    mealService.createPlan('openid-A', { date: '2026-13-40', name: 'x' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    mealService.createPlan('openid-A', { date: '2026-08-01', time: '25:99', name: 'x' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    mealService.createTemplate('openid-A', { name: '   ' }),
    ErrorCodes.VALIDATION,
  );
});

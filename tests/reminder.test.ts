import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ReminderTopic } from '../packages/types/src';
import { AnniversaryService } from '../apps/miniprogram/cloudfunctions/_shared/anniversaryService';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { PeriodService } from '../apps/miniprogram/cloudfunctions/_shared/periodService';
import { ReminderService } from '../apps/miniprogram/cloudfunctions/_shared/reminderService';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { MemoryRepo } from './memoryRepo';

const BASE = new Date('2026-08-15T00:00:00+08:00');

const FAKE_TEMPLATES: Record<ReminderTopic, { templateId: string; page: string }> = {
  anniversary: { templateId: 'tid_ann', page: 'pages/anniversary/index' },
  meal: { templateId: 'tid_meal', page: 'pages/meal/index' },
  visit: { templateId: 'tid_visit', page: 'pages/restaurant/index' },
};

async function fresh() {
  const repo = new MemoryRepo();
  const clock = () => BASE;
  const spaceService = new SpaceService(repo);
  const anniversaryService = new AnniversaryService(repo, clock);
  const periodService = new PeriodService(repo, clock);
  const mealService = new MealService(repo, clock);
  const restaurantService = new RestaurantService(repo, clock);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  return {
    repo,
    spaceService,
    anniversaryService,
    periodService,
    mealService,
    restaurantService,
    space: created.space,
  };
}

test('提醒收集：纪念日/今日菜单/餐厅行程 到期均被收集', async () => {
  const { repo, anniversaryService, periodService, mealService, restaurantService } = await fresh();
  await anniversaryService.create('openid-A', { name: '在一起', date: '2025-08-15', yearly: true });
  await mealService.createPlan('openid-A', { date: '2026-08-15', time: '18:30', name: '晚餐' });
  const r = await restaurantService.createRestaurant('openid-A', { name: 'XX日料' });
  await restaurantService.createVisit('openid-A', { restaurantId: r.id, date: '2026-08-15', time: '19:00' });

  const service = new ReminderService(
    repo,
    async () => {},
    () => BASE,
    FAKE_TEMPLATES,
  );
  const items = await service.collectDue();
  const topics = items.map((i) => i.topic).sort();
  assert.deepEqual(topics, ['anniversary', 'meal', 'visit']);
});

test('发送提醒：一次性授权发送后删除授权', async () => {
  const { repo, space, mealService } = await fresh();
  await mealService.createPlan('openid-A', { date: '2026-08-15', time: '18:30', name: '晚餐' });

  const sent: string[] = [];
  const service = new ReminderService(
    repo,
    async ({ openid, templateId }) => {
      sent.push(`${openid}:${templateId}`);
    },
    () => BASE,
    FAKE_TEMPLATES,
  );

  // B 授权“今日菜单”提醒
  await service.grant('openid-B', space.spaceId, 'meal');
  assert.equal(repo.grants.size, 1);

  const count = await service.sendDue();
  assert.equal(count, 1);
  assert.deepEqual(sent, ['openid-B:tid_meal']);
  assert.equal(repo.grants.size, 0);
});

test('提醒发送：模板未配置时跳过（不报错不发送）', async () => {
  const { repo, space, mealService } = await fresh();
  await mealService.createPlan('openid-A', { date: '2026-08-15', time: '18:30', name: '晚餐' });
  const service = new ReminderService(
    repo,
    async () => {
      assert.fail('不应发送');
    },
    () => BASE,
    { ...FAKE_TEMPLATES, meal: { templateId: '', page: 'pages/meal/index' } },
  );
  const count = await service.sendDue();
  assert.equal(count, 0);
});

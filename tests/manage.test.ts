import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { ManageService } from '../apps/miniprogram/cloudfunctions/_shared/manageService';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { MemoryRepo } from './memoryRepo';

async function fresh() {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const manageService = new ManageService(repo);
  const trashService = new TrashService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  return { repo, spaceService, manageService, trashService, space: created.space };
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

test('主管理概览：主账号看到各业务计数，副账号被拒绝', async () => {
  const { repo, manageService } = await fresh();
  const meal = new MealService(repo);
  const restaurant = new RestaurantService(repo);
  const template = await meal.createTemplate('openid-A', { name: '素材' });
  await meal.createPlan('openid-A', { templateId: template.id, date: '2026-08-20' });
  await restaurant.createRestaurant('openid-A', { name: '餐厅' });

  const overview = await manageService.overview('openid-A');
  assert.equal(overview.role, 'owner');
  assert.equal(overview.counts.mealTemplates, 1);
  assert.equal(overview.counts.mealPlans, 1);
  assert.equal(overview.counts.restaurants, 1);
  assert.equal(overview.counts.trash, 0);
  assert.equal(overview.counts.todos, 0);

  await expectError(manageService.overview('openid-B'), ErrorCodes.FORBIDDEN);
  // C 是另一个空间的主账号，只能看到自己空间的数据
  const cOverview = await manageService.overview('openid-C');
  assert.equal(cOverview.counts.restaurants, 0);
});

test('数据导出：主账号拿到完整 JSON 载荷，副账号被拒绝', async () => {
  const { repo, manageService } = await fresh();
  const restaurant = new RestaurantService(repo);
  await restaurant.createRestaurant('openid-A', { name: '私密餐厅', note: '不导出给第三方' });
  const { payload, fileName } = await manageService.buildExport('openid-A');
  assert.ok(fileName.endsWith('.json'));
  assert.equal((payload.data as { restaurants: unknown[] }).restaurants.length, 1);
  assert.equal(
    ((payload.data as { restaurants: Array<{ name: string }> }).restaurants[0].name),
    '私密餐厅',
  );
  assert.ok((payload.exportedAt as string).endsWith('Z'));
  await expectError(manageService.buildExport('openid-B'), ErrorCodes.FORBIDDEN);
});

test('回收站：批量恢复/批量永久删除/清空仅主账号可用', async () => {
  const { repo, manageService, trashService } = await fresh();
  const restaurant = new RestaurantService(repo);
  const r1 = await restaurant.createRestaurant('openid-A', { name: '餐厅1' });
  const r2 = await restaurant.createRestaurant('openid-A', { name: '餐厅2' });
  await restaurant.deleteRestaurant('openid-A', { restaurantId: r1.id });
  await restaurant.deleteRestaurant('openid-A', { restaurantId: r2.id });
  let trash = await trashService.list('openid-A');
  assert.equal(trash.length, 2);

  await expectError(
    trashService.restoreMany('openid-B', { trashIds: trash.map((t) => t.id) }),
    ErrorCodes.FORBIDDEN,
  );
  await expectError(
    trashService.purgeMany('openid-B', { trashIds: trash.map((t) => t.id) }),
    ErrorCodes.FORBIDDEN,
  );
  await expectError(trashService.purgeAll('openid-B'), ErrorCodes.FORBIDDEN);

  // 批量恢复一条
  await trashService.restoreMany('openid-A', { trashIds: [trash[0].id] });
  assert.equal((await restaurant.listRestaurants('openid-A')).length, 1);
  trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);

  // 批量永久删除剩余一条，再制造两条后清空
  await trashService.purgeMany('openid-A', { trashIds: [trash[0].id] });
  assert.equal((await trashService.list('openid-A')).length, 0);
  const r3 = await restaurant.createRestaurant('openid-A', { name: '餐厅3' });
  await restaurant.deleteRestaurant('openid-A', { restaurantId: r2.id });
  await restaurant.deleteRestaurant('openid-A', { restaurantId: r3.id });
  const purged = await trashService.purgeAll('openid-A');
  assert.equal(purged, 2);
  assert.equal((await trashService.list('openid-A')).length, 0);
  assert.ok(repo.audits.some((a) => a.action === 'trash.purge_all'));
});

test('家庭管理：重新生成邀请码仅主账号，旧码立即失效', async () => {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  await spaceService.createSpace('openid-A', { name: '测试空间' });
  const first = await spaceService.getMySpace('openid-A');
  assert.ok(first.space.inviteCode);

  const regen = await spaceService.regenerateInviteCode('openid-A');
  assert.ok(regen.inviteCode);
  assert.notEqual(regen.inviteCode, first.space.inviteCode);

  // 旧码已失效
  await expectError(
    spaceService.joinSpace('openid-B', { inviteCode: first.space.inviteCode || '' }),
    ErrorCodes.INVITE_INVALID,
  );
  // 新码可正常绑定
  const joined = await spaceService.joinSpace('openid-B', { inviteCode: regen.inviteCode });
  assert.equal(joined.space.members.length, 2);
  // 绑定后不能再生成
  await expectError(spaceService.regenerateInviteCode('openid-A'), ErrorCodes.INTERNAL);

  // 副账号调用被拒绝（独立空间验证）
  const repo2 = new MemoryRepo();
  const spaceService2 = new SpaceService(repo2);
  const s2 = await spaceService2.createSpace('openid-D', { name: 'D 的空间' });
  await spaceService2.joinSpace('openid-E', { inviteCode: s2.inviteCode });
  await expectError(spaceService2.regenerateInviteCode('openid-E'), ErrorCodes.FORBIDDEN);
});

test('副管理：副账号可以下架今日菜单与餐厅（管理视角）', async () => {
  const { repo } = await fresh();
  const meal = new MealService(repo);
  const restaurant = new RestaurantService(repo);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const template = await meal.createTemplate('openid-A', { name: '素材' });
  await meal.createPlan('openid-A', { templateId: template.id, date: today, time: '18:00' });
  const r = await restaurant.createRestaurant('openid-A', { name: '餐厅' });

  const plan = (await meal.todayPlans('openid-A'))[0];
  const offlinePlan = await meal.offlinePlan('openid-B', { planId: plan.id });
  assert.equal(offlinePlan.status, 'offline');

  const updated = await restaurant.updateRestaurant('openid-B', { restaurantId: r.id, enabled: false });
  assert.equal(updated.enabled, false);
});

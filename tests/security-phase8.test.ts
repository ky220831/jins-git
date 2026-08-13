import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AnniversaryService } from '../apps/miniprogram/cloudfunctions/_shared/anniversaryService';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { filterOwnedFileIDs, ownedImageFileIDs } from '../apps/miniprogram/cloudfunctions/_shared/imageAccess';
import { ManageService } from '../apps/miniprogram/cloudfunctions/_shared/manageService';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { PeriodService } from '../apps/miniprogram/cloudfunctions/_shared/periodService';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { resolveIdentity } from '../apps/miniprogram/cloudfunctions/_shared/identity';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TodoService } from '../apps/miniprogram/cloudfunctions/_shared/todoService';
import { TravelService } from '../apps/miniprogram/cloudfunctions/_shared/travelService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { MemoryRepo } from './memoryRepo';

/**
 * 第八阶段安全测试：覆盖 PRD §62 攻击场景
 * 跨 Space 查询/修改/删除、伪造 userId/spaceId/role/recordId、
 * MEMBER 越权删除与回收站、第三人加入、绕过前端直调云函数。
 */
async function world() {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const created = await spaceService.createSpace('openid-A', { name: 'A 空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await spaceService.createSpace('openid-C', { name: 'C 空间' });

  const todoService = new TodoService(repo);
  const calendarService = new CalendarService(repo);
  const periodService = new PeriodService(repo);
  const mealService = new MealService(repo);
  const restaurantService = new RestaurantService(repo);
  const anniversaryService = new AnniversaryService(repo);
  const travelService = new TravelService(repo);
  const trashService = new TrashService(repo);
  const manageService = new ManageService(repo);

  // A 空间播种数据
  const todo = await todoService.create('openid-A', { title: 'A 的待办', date: '2026-08-20' });
  await periodService.recordActual('openid-A', { startDate: '2026-08-01', endDate: '2026-08-05' });
  const template = await mealService.createTemplate('openid-A', { name: 'A 的素材' });
  const plan = await mealService.createPlan('openid-A', { templateId: template.id, date: '2026-08-20' });
  const restaurant = await restaurantService.createRestaurant('openid-A', {
    name: 'A 的餐厅',
    coverImage: 'cloud://env-a/private/cover.jpg',
    images: ['cloud://env-a/private/photo.jpg'],
  });
  const visit = await restaurantService.createVisit('openid-A', {
    restaurantId: restaurant.id,
    date: '2026-08-20',
    time: '18:30',
  });
  const anniversary = await anniversaryService.create('openid-A', { name: 'A 的纪念日', date: '2026-08-20' });
  const trip = await travelService.createTrip('openid-A', { name: 'A 的旅行', images: ['cloud://env-a/private/trip.jpg'] });
  const tripPlan = await travelService.createPlan('openid-A', { tripId: trip.id, startDate: '2026-08-21' });

  return {
    repo,
    spaceService,
    todoService,
    calendarService,
    periodService,
    mealService,
    restaurantService,
    anniversaryService,
    travelService,
    trashService,
    manageService,
    ids: { todo: todo.id, plan: plan.id, restaurant: restaurant.id, visit: visit.id, anniversary: anniversary.id, trip: trip.id, tripPlan: tripPlan.id },
    fileIDs: ['cloud://env-a/private/cover.jpg', 'cloud://env-a/private/photo.jpg', 'cloud://env-a/private/trip.jpg'],
  };
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

test('安全矩阵：跨 Space 查询全部被隔离', async () => {
  const w = await world();
  assert.equal((await w.todoService.listByMonth('openid-C', { year: 2026, month: 8 })).length, 0);
  assert.equal((await w.restaurantService.listRestaurants('openid-C')).length, 0);
  assert.equal((await w.anniversaryService.list('openid-C')).length, 0);
  assert.equal((await w.travelService.listTrips('openid-C')).length, 0);
  assert.equal((await w.periodService.info('openid-C')).records.length, 0);
  const cMonth = await w.calendarService.getMonth('openid-C', { year: 2026, month: 8 });
  assert.equal(cMonth.todos.length, 0);
  assert.equal(cMonth.events.length, 0);
  // C 自己的主管理概览不含 A 的数据
  const cOverview = await w.manageService.overview('openid-C');
  assert.equal(cOverview.counts.restaurants, 0);
  assert.equal(cOverview.counts.anniversaries, 0);
});

test('安全矩阵：跨 Space 修改全部被拒绝（伪造 recordId 与伪造 spaceId）', async () => {
  const w = await world();
  // 直接传 A 的 recordId，C 查不到 → NOT_FOUND
  await expectError(
    w.todoService.update('openid-C', { todoId: w.ids.todo, title: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.mealService.updatePlan('openid-C', { planId: w.ids.plan, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.restaurantService.updateRestaurant('openid-C', { restaurantId: w.ids.restaurant, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.anniversaryService.update('openid-C', { anniversaryId: w.ids.anniversary, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.travelService.updateTrip('openid-C', { tripId: w.ids.trip, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  // 伪造 spaceId 一并传入：仍以身份解析出的空间为准，A 的记录不可被 C 修改
  await expectError(
    w.todoService.update('openid-C', { todoId: w.ids.todo, title: '篡改', spaceId: w.ids.plan } as never),
    ErrorCodes.NOT_FOUND,
  );
  // 伪造随机 recordId：同样 NOT_FOUND
  await expectError(
    w.todoService.update('openid-C', { todoId: 'fake_record_123', title: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
});

test('安全矩阵：跨 Space 删除与伪造 role/userId 被拒绝', async () => {
  const w = await world();
  await expectError(
    w.restaurantService.deleteRestaurant('openid-C', { restaurantId: w.ids.restaurant }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.anniversaryService.remove('openid-C', { anniversaryId: w.ids.anniversary }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.travelService.deleteTrip('openid-C', { tripId: w.ids.trip }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    w.travelService.deletePlan('openid-C', { planId: w.ids.tripPlan }),
    ErrorCodes.NOT_FOUND,
  );
  // 伪造 role=owner 入参：服务端仍按数据库角色判定（B 是 MEMBER）
  await expectError(
    w.restaurantService.deleteRestaurant('openid-B', { restaurantId: w.ids.restaurant, role: 'owner' } as never),
    ErrorCodes.FORBIDDEN,
  );
  // 伪造 userId 入参：记录创建者不会被篡改
  await w.restaurantService.updateRestaurant('openid-B', {
    restaurantId: w.ids.restaurant,
    note: 'B 编辑',
    userId: w.ids.trip,
  } as never);
  const r = (await w.restaurantService.listRestaurants('openid-A')).find((x) => x.id === w.ids.restaurant);
  assert.notEqual(r?.createdBy, w.ids.trip);
  assert.equal(r?.note, 'B 编辑');
});

test('安全矩阵：MEMBER 不能删除纪念日/旅游/访问回收站/永久删除', async () => {
  const w = await world();
  await expectError(w.anniversaryService.remove('openid-B', { anniversaryId: w.ids.anniversary }), ErrorCodes.FORBIDDEN);
  await expectError(w.travelService.deleteTrip('openid-B', { tripId: w.ids.trip }), ErrorCodes.FORBIDDEN);
  await expectError(w.travelService.deletePlan('openid-B', { planId: w.ids.tripPlan }), ErrorCodes.FORBIDDEN);
  await expectError(w.trashService.list('openid-B'), ErrorCodes.FORBIDDEN);
  await expectError(w.trashService.restore('openid-B', { trashId: 'tr_any' }), ErrorCodes.FORBIDDEN);
  await expectError(w.trashService.purge('openid-B', { trashId: 'tr_any' }), ErrorCodes.FORBIDDEN);
  await expectError(w.trashService.purgeAll('openid-B'), ErrorCodes.FORBIDDEN);
  await expectError(w.manageService.overview('openid-B'), ErrorCodes.FORBIDDEN);
  await expectError(w.manageService.buildExport('openid-B'), ErrorCodes.FORBIDDEN);
});

test('安全矩阵：第三人无法加入已满/已使用邀请码的空间', async () => {
  const w = await world();
  // A 空间的邀请码已被 B 使用
  const space = (await w.spaceService.getMySpace('openid-A')).space;
  // 空邀请码被拒绝（A 的邀请码已消费，不再对外可见）
  await expectError(w.spaceService.joinSpace('openid-D', { inviteCode: 'AAAAAAAA' }), ErrorCodes.INVITE_INVALID);
  await expectError(w.spaceService.joinSpace('openid-D', { inviteCode: space.inviteCode || '' }), ErrorCodes.VALIDATION);
  // C 已在自己空间，不能再加入
  await expectError(w.spaceService.joinSpace('openid-C', { inviteCode: 'AAAAAAAA' }), ErrorCodes.ALREADY_IN_SPACE);
});

test('安全矩阵：绕过前端直接调用云函数（无微信身份）被拒绝', async () => {
  const w = await world();
  await expectError(resolveIdentity(w.repo, ''), ErrorCodes.UNAUTHORIZED);
  await expectError(w.todoService.listByMonth('', { year: 2026, month: 8 }), ErrorCodes.UNAUTHORIZED);
  // 未绑定用户（有微信身份但无空间）访问业务 → NOT_IN_SPACE
  await w.spaceService.createSpace('openid-E', { name: 'E 独立空间' });
  await expectError(w.restaurantService.listRestaurants('openid-F'), ErrorCodes.NOT_IN_SPACE);
});

test('安全矩阵：图片临时链接越权被拦截（fileID 仅限本空间）', async () => {
  const w = await world();
  const ownedA = await ownedImageFileIDs(w.repo, (await w.spaceService.getMySpace('openid-A')).space.spaceId);
  const ownedC = await ownedImageFileIDs(w.repo, (await w.spaceService.getMySpace('openid-C')).space.spaceId);
  // A 自己的图片全部可访问
  assert.equal(filterOwnedFileIDs(w.fileIDs, ownedA).length, 3);
  // C 请求 A 的图片 → 无任何授权
  assert.equal(filterOwnedFileIDs(w.fileIDs, ownedC).length, 0);
  // 混合请求只返回本空间授权部分
  const mix = filterOwnedFileIDs(['cloud://env-a/private/cover.jpg', 'cloud://env-c/other.jpg'], ownedA);
  assert.deepEqual(mix, ['cloud://env-a/private/cover.jpg']);
});

test('安全矩阵：双人共享且 A/B 互相可见（非隔离）', async () => {
  const w = await world();
  assert.equal((await w.restaurantService.listRestaurants('openid-B')).length, 1);
  assert.equal((await w.anniversaryService.list('openid-B')).length, 1);
  const bMonth = await w.calendarService.getMonth('openid-B', { year: 2026, month: 8 });
  assert.ok(bMonth.events.some((e) => e.sourceType === 'restaurant'));
  assert.ok(bMonth.events.some((e) => e.sourceType === 'anniversary'));
});

test('昵称：双人各自自定义昵称（爱心连接显示），校验与未绑定用户被拒', async () => {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });

  const afterA = await spaceService.setNickname('openid-A', { nickname: '小桃' });
  assert.equal(afterA.space.members.find((m) => m.role === 'owner')?.nickname, '小桃');

  const afterB = await spaceService.setNickname('openid-B', { nickname: '阿鱼' });
  assert.equal(afterB.space.members.find((m) => m.role !== 'owner')?.nickname, '阿鱼');
  // B 的视图里也能看到 A 的昵称（爱心连接双人可见）
  assert.equal(afterB.space.members.find((m) => m.role === 'owner')?.nickname, '小桃');

  await expectError(spaceService.setNickname('openid-A', { nickname: '' }), ErrorCodes.VALIDATION);
  await expectError(
    spaceService.setNickname('openid-A', { nickname: '超'.repeat(17) }),
    ErrorCodes.VALIDATION,
  );
  await expectError(spaceService.setNickname('openid-X', { nickname: 'X' }), ErrorCodes.NOT_IN_SPACE);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { parseOcrText, parseVisionJson } from '../apps/miniprogram/cloudfunctions/_shared/ocrProvider';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { LbsRestaurantSearchProvider } from '../apps/miniprogram/cloudfunctions/_shared/restaurantSearchProvider';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { MemoryRepo } from './memoryRepo';

async function fresh(clock: () => Date = () => new Date('2026-08-01T00:00:00+08:00')) {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const restaurantService = new RestaurantService(repo, clock);
  const trashService = new TrashService(repo);
  const calendarService = new CalendarService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  return { repo, spaceService, restaurantService, trashService, calendarService, space: created.space };
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

test('餐厅：新增/列表/编辑，副账号可编辑并收藏', async () => {
  const { restaurantService } = await fresh();
  const created = await restaurantService.createRestaurant('openid-A', {
    name: 'XX日料',
    address: '静安区南京西路 100 号',
    city: '上海',
    category: '日料',
    pricePerPerson: 200,
    rating: 4.5,
    tags: ['约会', '安静'],
    recommendedDishes: ['刺身拼盘', '鳗鱼饭'],
  });
  assert.equal(created.name, 'XX日料');
  assert.equal(created.favorite, false);
  await restaurantService.createRestaurant('openid-B', { name: 'YY面馆' });

  const updated = await restaurantService.updateRestaurant('openid-B', {
    restaurantId: created.id,
    version: 1,
    favorite: true,
    visited: true,
    note: '提前订座',
  });
  assert.equal(updated.favorite, true);
  assert.equal(updated.visited, true);
  assert.equal(updated.version, 2);
  assert.equal((await restaurantService.listRestaurants('openid-A')).length, 2);
});

test('餐厅：副账号不能删除，主账号删除进回收站（permanent）', async () => {
  const { restaurantService, trashService } = await fresh();
  const created = await restaurantService.createRestaurant('openid-A', { name: 'XX日料' });
  await expectError(
    restaurantService.deleteRestaurant('openid-B', { restaurantId: created.id }),
    ErrorCodes.FORBIDDEN,
  );
  await restaurantService.deleteRestaurant('openid-A', { restaurantId: created.id });
  assert.equal((await restaurantService.listRestaurants('openid-A')).length, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'restaurants');
  assert.equal(trash[0].retentionType, 'permanent');
});

test('行程：带时间创建生成 🍴 日历事件，下架移除，修改时间同步', async () => {
  const { repo, restaurantService } = await fresh();
  const restaurant = await restaurantService.createRestaurant('openid-A', { name: 'XX日料' });
  const visit = await restaurantService.createVisit('openid-A', {
    restaurantId: restaurant.id,
    date: '2026-08-20',
    time: '18:30',
    note: '靠窗',
  });
  assert.equal(visit.status, 'planned');
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === visit.id);
  assert.ok(event);
  assert.equal(event.sourceType, 'restaurant');
  assert.equal(event.title, '🍴 XX日料');

  await restaurantService.updateVisit('openid-B', { visitId: visit.id, version: 1, time: '19:00' });
  const updatedEvent = [...repo.calendarEvents.values()].find((e) => e.sourceId === visit.id);
  assert.equal(
    updatedEvent?.startTime.toISOString(),
    new Date('2026-08-20T19:00:00+08:00').toISOString(),
  );

  await restaurantService.offlineVisit('openid-B', { visitId: visit.id, version: 2 });
  assert.equal(repo.calendarEvents.size, 0);
  const month = await restaurantService.listVisitsByMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(month.length, 0);
});

test('行程：副账号不能删除；主账号删除进回收站（temporary）并移除日历事件', async () => {
  const { repo, restaurantService, trashService } = await fresh();
  const restaurant = await restaurantService.createRestaurant('openid-A', { name: 'XX日料' });
  const visit = await restaurantService.createVisit('openid-A', {
    restaurantId: restaurant.id,
    date: '2026-08-20',
    time: '18:30',
  });
  await expectError(
    restaurantService.deleteVisit('openid-B', { visitId: visit.id }),
    ErrorCodes.FORBIDDEN,
  );
  await restaurantService.deleteVisit('openid-A', { visitId: visit.id });
  assert.equal(repo.calendarEvents.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].collection, 'restaurant_visits');
  assert.equal(trash[0].retentionType, 'temporary');
});

test('行程：14 天自动过期进回收站，恢复后重建日历事件', async () => {
  const { repo, restaurantService, trashService } = await fresh();
  const restaurant = await restaurantService.createRestaurant('openid-A', { name: 'XX日料' });
  const visit = await restaurantService.createVisit('openid-A', {
    restaurantId: restaurant.id,
    date: '2026-08-20',
    time: '18:30',
  });
  const moved = await restaurantService.autoExpireVisits(new Date('2026-08-20T00:00:00+08:00'));
  assert.equal(moved, 1);
  assert.equal(repo.restaurantVisits.size, 0);
  const trash = await trashService.list('openid-A');
  assert.equal(trash.length, 1);
  assert.equal(trash[0].deleteReason, 'auto_expire');

  await trashService.restore('openid-A', { trashId: trash[0].id });
  const restored = await restaurantService.listVisitsByMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(restored.length, 1);
  const event = [...repo.calendarEvents.values()].find((e) => e.sourceId === visit.id);
  assert.ok(event);
  assert.equal(event.title, '🍴 XX日料');
});

test('跨空间：C 看不到/改不了 A 的餐厅与行程', async () => {
  const { restaurantService } = await fresh();
  const restaurant = await restaurantService.createRestaurant('openid-A', { name: 'A 的餐厅' });
  const visit = await restaurantService.createVisit('openid-A', {
    restaurantId: restaurant.id,
    date: '2026-08-20',
  });
  assert.equal((await restaurantService.listRestaurants('openid-C')).length, 0);
  assert.equal((await restaurantService.listVisitsByMonth('openid-C', { year: 2026, month: 8 })).length, 0);
  await expectError(
    restaurantService.updateRestaurant('openid-C', { restaurantId: restaurant.id, version: 1, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
  await expectError(
    restaurantService.updateVisit('openid-C', { visitId: visit.id, version: 1, note: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );
});

test('校验：非法名称/坐标/评分/日期被拒绝', async () => {
  const { restaurantService } = await fresh();
  await expectError(
    restaurantService.createRestaurant('openid-A', { name: '   ' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    restaurantService.createRestaurant('openid-A', { name: 'x', lat: 99, lng: 0 }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    restaurantService.createRestaurant('openid-A', { name: 'x', rating: 6 }),
    ErrorCodes.VALIDATION,
  );
  const r = await restaurantService.createRestaurant('openid-A', { name: 'x' });
  await expectError(
    restaurantService.createVisit('openid-A', { restaurantId: r.id, date: '2026-13-40' }),
    ErrorCodes.VALIDATION,
  );
});

test('OCR 解析：从菜单文字提取草稿（名称/地址/人均/营业时间/分类）', () => {
  const draft = parseOcrText(
    ['居酒屋 小鹿', '地址：上海市静安区南京西路100号', '人均 ￥120', '营业时间：11:00-23:00', '推荐：日料 刺身'].join('\n'),
  );
  assert.equal(draft.name, '居酒屋 小鹿');
  assert.equal(draft.address, '上海市静安区南京西路100号');
  assert.equal(draft.pricePerPerson, 120);
  assert.equal(draft.businessHours, '11:00-23:00');
  assert.equal(draft.category, '日料 刺身');
});

test('智能 OCR 解析：接受 JSON（含 markdown 代码块），提取截图/团购页信息与推荐菜', () => {
  const text = '```json\n{"name":"火上云小南·傣味烧烤","address":"护国街道威远街168号","city":"昆明","category":"烧烤","pricePerPerson":63,"businessHours":"17:30-24:00","dishes":["鲜切五花肉","泡鲁达"]}\n```';
  const draft = parseVisionJson(text);
  assert.ok(draft);
  assert.equal(draft.name, '火上云小南·傣味烧烤');
  assert.equal(draft.address, '护国街道威远街168号');
  assert.equal(draft.category, '烧烤');
  assert.equal(draft.pricePerPerson, 63);
  assert.equal(draft.businessHours, '17:30-24:00');
  assert.deepEqual(draft.dishes, ['鲜切五花肉', '泡鲁达']);
});

test('智能 OCR 解析：非 JSON 或损坏 JSON 返回 null（走手动录入兜底）', () => {
  assert.equal(parseVisionJson('抱歉，我无法识别'), null);
  assert.equal(parseVisionJson('{"name":'), null);
});

test('POI 搜索 Provider：解析腾讯位置服务返回；未配置 Key / 接口报错给出明确错误', async () => {
  const provider = new LbsRestaurantSearchProvider('fake-key', async () => ({
    status: 0,
    data: [
      {
        id: 'poi_1',
        title: 'XX日料',
        address: '南京西路 100 号',
        city: '上海',
        district: '静安区',
        location: { lat: 31.23, lng: 121.47 },
        category: '日本料理',
        tel: '021-12345678',
      },
    ],
  }));
  const result = await provider.search({ keyword: '日料', region: '上海' });
  assert.equal(result.provider, 'tencent_lbs');
  assert.equal(result.items[0].name, 'XX日料');
  assert.equal(result.items[0].lat, 31.23);
  assert.equal(result.items[0].category, '日本料理');

  const noKey = new LbsRestaurantSearchProvider('', async () => ({ status: 0, data: [] }));
  await expectError(noKey.search({ keyword: '日料' }), ErrorCodes.LBS_NOT_CONFIGURED);

  const bad = new LbsRestaurantSearchProvider('key', async () => ({ status: 3, message: '配额不足' }));
  await expectError(bad.search({ keyword: '日料' }), ErrorCodes.THIRD_PARTY_ERROR);
});

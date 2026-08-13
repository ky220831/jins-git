/**
 * 第五阶段云端端到端验证（连真实云环境）：
 * 餐厅增删改/收藏上架 → 临时行程 + 🍴 日历联动 → 回收站恢复 →
 * 14 天自动过期 → 搜索未配置 Key 友好报错 → 跨空间隔离 → 清理全部临时数据。
 *
 * 运行：npx esbuild scripts/e2e-restaurant.ts --bundle --platform=node --target=node18
 *       --format=cjs --outfile=work/e2e-restaurant.cjs --external:wx-server-sdk
 * 然后设置密钥后 node work/e2e-restaurant.cjs
 */
import cloud from 'wx-server-sdk';
import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { LbsRestaurantSearchProvider } from '../apps/miniprogram/cloudfunctions/_shared/restaurantSearchProvider';
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
const restaurantService = new RestaurantService(repo);
const trashService = new TrashService(repo);
const calendarService = new CalendarService(repo);

const OPENID_A = `e2e5-a-${Date.now()}`;
const OPENID_B = `e2e5-b-${Date.now()}`;
const OPENID_C = `e2e5-c-${Date.now()}`;
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
    for (const sid of [testSpaceId, cTestSpaceId]) {
      if (!sid) continue;
      await db.collection('spaces').doc(sid).remove();
      await db.collection('space_members').where({ spaceId: sid }).remove();
      await db.collection('audit_logs').where({ spaceId: sid }).remove();
      await db.collection('restaurants').where({ spaceId: sid }).remove();
      await db.collection('restaurant_visits').where({ spaceId: sid }).remove();
      await db.collection('trash_records').where({ spaceId: sid }).remove();
      await db.collection('calendar_events').where({ spaceId: sid }).remove();
      await db.collection('todos').where({ spaceId: sid }).remove();
    }
    console.log('[清理] 第五阶段临时测试数据已删除');
  } catch (err) {
    console.log('[清理] 部分失败（不影响结论）:', String((err as Error).message || err));
  }
}

async function main(): Promise<void> {
  console.log(`环境: ${envId}`);

  const created = await spaceService.createSpace(OPENID_A, { name: 'E2E5临时空间' });
  testSpaceId = created.space.spaceId;
  await spaceService.joinSpace(OPENID_B, { inviteCode: created.inviteCode });
  const cSpace = await spaceService.createSpace(OPENID_C, { name: 'E2E5-C空间' });
  cTestSpaceId = cSpace.space.spaceId;

  // ---- 餐厅 CRUD ----
  const r1 = await restaurantService.createRestaurant(OPENID_A, {
    name: 'XX日料',
    address: '静安区南京西路 100 号',
    city: '上海',
    category: '日料',
    pricePerPerson: 200,
    rating: 4.5,
    tags: ['约会', '安静'],
    recommendedDishes: ['刺身拼盘'],
  });
  await restaurantService.createRestaurant(OPENID_B, { name: 'YY面馆' });
  check('餐厅：双人可新增，列表 2 条', (await restaurantService.listRestaurants(OPENID_A)).length === 2);
  const fav = await restaurantService.updateRestaurant(OPENID_B, {
    restaurantId: r1.id,
    favorite: true,
    visited: true,
  });
  check('餐厅：副账号可收藏/标记去过', fav.favorite && fav.visited);
  const off = await restaurantService.updateRestaurant(OPENID_B, { restaurantId: r1.id, enabled: false });
  check('餐厅：双人可下架/上架', off.enabled === false);

  await expectError(
    restaurantService.deleteRestaurant(OPENID_B, { restaurantId: r1.id }),
    ErrorCodes.FORBIDDEN,
    '副账号不能删除餐厅',
  );
  await restaurantService.deleteRestaurant(OPENID_A, { restaurantId: r1.id });
  const trashAfterRestaurant = await trashService.list(OPENID_A);
  check(
    '主账号删除餐厅后进入回收站（permanent）',
    trashAfterRestaurant.length === 1 && trashAfterRestaurant[0].collection === 'restaurants',
  );

  // ---- 行程 + 日历联动 ----
  const r2 = await restaurantService.createRestaurant(OPENID_A, { name: 'ZZ火锅' });
  const visit = await restaurantService.createVisit(OPENID_A, {
    restaurantId: r2.id,
    date: '2026-10-02',
    time: '18:30',
    note: '窗边位',
  });
  const oct = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
  const event = oct.events.find((e) => e.sourceId === visit.id);
  check(
    '行程带时间自动生成 🍴 日历事件',
    !!event && event.title === '🍴 ZZ火锅' && event.sourceType === 'restaurant',
    event ? event.title : '无事件',
  );

  await restaurantService.offlineVisit(OPENID_B, { visitId: visit.id });
  const octOffline = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
  check(
    '下架行程后日历事件移除、月列表不显示',
    !octOffline.events.some((e) => e.sourceId === visit.id) &&
      !(await restaurantService.listVisitsByMonth(OPENID_A, { year: 2026, month: 10 })).some((v) => v.id === visit.id),
  );

  await restaurantService.updateVisit(OPENID_A, { visitId: visit.id, status: 'planned', time: '19:00' });
  await expectError(
    restaurantService.deleteVisit(OPENID_B, { visitId: visit.id }),
    ErrorCodes.FORBIDDEN,
    '副账号不能删除行程',
  );
  await restaurantService.deleteVisit(OPENID_A, { visitId: visit.id });
  const trashAfterVisit = await trashService.list(OPENID_A);
  check(
    '主账号删除行程后进入回收站（temporary）且日历事件移除',
    trashAfterVisit.length === 2 &&
      trashAfterVisit.some((t) => t.collection === 'restaurant_visits') &&
      !(await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 })).events.some((e) => e.sourceId === visit.id),
    `trash=${trashAfterVisit.length}`,
  );

  const trashVisit = trashAfterVisit.find((t) => t.collection === 'restaurant_visits');
  if (trashVisit) {
    await trashService.restore(OPENID_A, { trashId: trashVisit.id });
    const restoredOct = await calendarService.getMonth(OPENID_A, { year: 2026, month: 10 });
    check(
      '恢复行程后重建 🍴 日历事件',
      restoredOct.events.some((e) => e.sourceId === visit.id),
      `events=${restoredOct.events.filter((e) => e.sourceId === visit.id).length}`,
    );
  } else {
    check('找到回收站中的行程记录', false);
  }

  // ---- 14 天自动过期 ----
  const expiring = await restaurantService.createVisit(OPENID_A, {
    restaurantId: r2.id,
    date: '2026-09-01',
    time: '12:00',
  });
  const now = new Date();
  await db.collection('restaurant_visits').doc(expiring.id).update({
    data: { expireAt: new Date(now.getTime() - 3600000) },
  });
  const moved = await restaurantService.autoExpireVisits(new Date(now.getTime() + 3600000));
  check('14 天到期行程被自动移入回收站', moved === 1, `moved=${moved}`);

  // ---- 搜索：未配置 Key 时友好报错 ----
  const noKeyProvider = new LbsRestaurantSearchProvider('');
  await expectError(
    noKeyProvider.search({ keyword: '日料' }),
    ErrorCodes.LBS_NOT_CONFIGURED,
    '未配置 LBS_KEY 时给出明确指引',
  );

  // ---- 跨空间 ----
  check(
    'C（独立空间）看不到 A 的餐厅/行程/回收站',
    (await restaurantService.listRestaurants(OPENID_C)).length === 0 &&
      (await restaurantService.listVisitsByMonth(OPENID_C, { year: 2026, month: 10 })).length === 0 &&
      (await trashService.list(OPENID_C)).length === 0,
  );
  await expectError(
    restaurantService.updateRestaurant(OPENID_C, { restaurantId: r2.id, name: '篡改' }),
    ErrorCodes.NOT_FOUND,
    'C 不能篡改 A 的餐厅',
  );

  console.log(failures === 0 ? '\n===== 第五阶段云端 E2E 全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .then(cleanup)
  .catch((err) => {
    console.error('E2E 异常:', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode || 0));

/**
 * 第七阶段云端 E2E：用真实云数据库验证管理后端（概览/导出/回收站批量操作/重发邀请码/副账号拒绝）。
 * 用法：先执行 . .\work\set-env.ps1，然后 npx tsx scripts/cloud-e2e-manage.ts
 * 会创建临时测试空间（e2e-manage-*），结束后清理该空间全部数据。
 */
import cloud from 'wx-server-sdk';
import { CloudRepo } from '../apps/miniprogram/cloudfunctions/_shared/cloudRepo';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { RestaurantService } from '../apps/miniprogram/cloudfunctions/_shared/restaurantService';
import { MealService } from '../apps/miniprogram/cloudfunctions/_shared/mealService';
import { AnniversaryService } from '../apps/miniprogram/cloudfunctions/_shared/anniversaryService';
import { TrashService } from '../apps/miniprogram/cloudfunctions/_shared/trashService';
import { ManageService } from '../apps/miniprogram/cloudfunctions/_shared/manageService';

cloud.init({ env: process.env.CLOUDBASE_ENV_ID });
const db = cloud.database();

const tag = `e2e-manage-${Date.now()}`;
const OWNER = `${tag}-owner`;
const MEMBER = `${tag}-member`;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '[通过]' : '[失败]'} ${label}${detail ? `（${detail}）` : ''}`);
  if (!ok) failures += 1;
}

async function expectReject(promise: Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await promise;
    check(label, false, '未抛错');
  } catch (err) {
    check(label, (err as { code?: string }).code === code, `code=${(err as { code?: string }).code}`);
  }
}

async function main() {
  const repo = new CloudRepo();
  const spaceService = new SpaceService(repo);
  const restaurantService = new RestaurantService(repo);
  const mealService = new MealService(repo);
  const anniversaryService = new AnniversaryService(repo);
  const trashService = new TrashService(repo);
  const manageService = new ManageService(repo);

  const created = await spaceService.createSpace(OWNER, { name: '管理E2E测试' });
  const spaceId = created.space.spaceId;
  await spaceService.joinSpace(MEMBER, { inviteCode: created.inviteCode });

  // 1. 副账号不能使用主管理能力
  await expectReject(manageService.overview(MEMBER), 'FORBIDDEN', '副账号访问概览被拒绝');
  await expectReject(manageService.buildExport(MEMBER), 'FORBIDDEN', '副账号导出被拒绝');
  await expectReject(trashService.list(MEMBER), 'FORBIDDEN', '副账号访问回收站被拒绝');
  await expectReject(trashService.purgeAll(MEMBER), 'FORBIDDEN', '副账号清空回收站被拒绝');
  await expectReject(spaceService.regenerateInviteCode(MEMBER), 'FORBIDDEN', '副账号重发邀请码被拒绝');

  // 2. 造数
  const restaurant = await restaurantService.createRestaurant(OWNER, { name: '云端E2E餐厅' });
  const template = await mealService.createTemplate(OWNER, { name: '云端E2E素材' });
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  await mealService.createPlan(OWNER, { templateId: template.id, date: today, time: '12:00' });
  await anniversaryService.create(OWNER, { name: '云端E2E纪念日', date: '2026-08-20' });

  // 3. 概览计数
  const overview = await manageService.overview(OWNER);
  check(
    '概览计数正确',
    overview.counts.restaurants === 1 &&
      overview.counts.mealTemplates === 1 &&
      overview.counts.mealPlans === 1 &&
      overview.counts.anniversaries === 1 &&
      overview.counts.trash === 0,
    JSON.stringify(overview.counts),
  );

  // 4. 导出载荷包含全部业务数据
  const { payload, fileName } = await manageService.buildExport(OWNER);
  const data = payload.data as Record<string, unknown[]>;
  check(
    '导出 JSON 包含餐厅/菜单/纪念日',
    fileName.endsWith('.json') &&
      data.restaurants.length === 1 &&
      data.mealPlans.length === 1 &&
      data.anniversaries.length === 1,
    `fileName=${fileName}`,
  );

  // 5. 删除 → 回收站 → 批量恢复
  await restaurantService.deleteRestaurant(OWNER, { restaurantId: restaurant.id });
  const trash = await trashService.list(OWNER);
  check('删除餐厅进入回收站', trash.length === 1 && trash[0].collection === 'restaurants');
  await trashService.restoreMany(OWNER, { trashIds: trash.map((t) => t.id) });
  check('批量恢复成功', (await restaurantService.listRestaurants(OWNER)).length === 1);

  // 6. 再删除 → 批量永久删除 → 清空
  await restaurantService.deleteRestaurant(OWNER, { restaurantId: restaurant.id });
  const trash2 = await trashService.list(OWNER);
  await trashService.purgeMany(OWNER, { trashIds: trash2.map((t) => t.id) });
  check('批量永久删除成功', (await trashService.list(OWNER)).length === 0);

  // 7. 清空回收站（全局清理）
  const restaurant2 = await restaurantService.createRestaurant(OWNER, { name: '云端E2E餐厅2' });
  await restaurantService.deleteRestaurant(OWNER, { restaurantId: restaurant2.id });
  await anniversaryService.remove(OWNER, { anniversaryId: (await anniversaryService.list(OWNER))[0].id });
  const purged = await trashService.purgeAll(OWNER);
  check('清空回收站成功', purged === 2 && (await trashService.list(OWNER)).length === 0, `purged=${purged}`);

  // 8. 重发邀请码（独立空间验证）
  const repo2 = new CloudRepo();
  const spaceService2 = new SpaceService(repo2);
  const s2 = await spaceService2.createSpace(`${tag}-owner2`, { name: '邀请码E2E' });
  const regen = await spaceService2.regenerateInviteCode(`${tag}-owner2`);
  check('重发邀请码生成新码', !!regen.inviteCode && regen.inviteCode !== s2.inviteCode);

  // 9. 清理：删除两个测试空间及其全部数据
  const spacesToClean = [spaceId, s2.space.spaceId];
  for (const sid of spacesToClean) {
    const members = await repo.listActiveMembers(sid);
    for (const m of members) {
      await db.collection('space_members').where({ _id: m.id }).remove();
      await db.collection('user_identities').where({ userId: m.userId }).remove();
      await db.collection('users').where({ _id: m.userId }).remove();
    }
    for (const collection of ['todos', 'calendar_events', 'period_records', 'meal_templates', 'meal_plans', 'restaurants', 'restaurant_visits', 'anniversaries', 'trips', 'trip_plans', 'trash_records', 'audit_logs']) {
      await db.collection(collection).where({ spaceId: sid }).remove();
    }
    await db.collection('spaces').where({ _id: sid }).remove();
  }
  check('测试数据清理完成', true);

  console.log(failures === 0 ? '\n===== 管理云端 E2E 全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E 失败:', String((err as { stack?: string })?.stack || err));
  process.exit(1);
});

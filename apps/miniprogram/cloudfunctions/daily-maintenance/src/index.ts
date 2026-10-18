import cloud from 'wx-server-sdk';
import { COLLECTIONS } from '../../_shared/constants';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { MealService } from '../../_shared/mealService';
import { RestaurantService } from '../../_shared/restaurantService';
import { TravelService } from '../../_shared/travelService';
import { TrashService } from '../../_shared/trashService';
import { ReminderService } from '../../_shared/reminderService';

/**
 * 每日维护任务（建议配置定时触发器：每天 04:00 Asia/Shanghai）：
 * 1) 到期 14 天的临时菜单/餐厅行程/旅游行程 → 回收站
 * 2) 回收站 72 小时到期 → 永久删除
 * 3) 全量数据备份到云存储 backups/daily/（保留 7 天，v1.1.18）
 */
const BACKUP_COLLECTIONS = [
  COLLECTIONS.users,
  COLLECTIONS.userIdentities,
  COLLECTIONS.spaces,
  COLLECTIONS.spaceMembers,
  COLLECTIONS.auditLogs,
  COLLECTIONS.todos,
  COLLECTIONS.calendarEvents,
  COLLECTIONS.periodRecords,
  COLLECTIONS.holidays,
  COLLECTIONS.spaceSettings,
  COLLECTIONS.mealTemplates,
  COLLECTIONS.mealPlans,
  COLLECTIONS.trashRecords,
  COLLECTIONS.restaurants,
  COLLECTIONS.restaurantVisits,
  COLLECTIONS.anniversaries,
  COLLECTIONS.trips,
  COLLECTIONS.tripPlans,
  COLLECTIONS.subscribeGrants,
] as const;

/** 全量备份：导出各集合 → 云存储 backups/daily/YYYY-MM-DD.json，记录到 backup_meta，清理 7 天前 */
async function runDailyBackup(): Promise<{ file: string; sizeBytes: number; removed: number }> {
  const db = cloud.database();
  const shifted = new Date(Date.now() + 8 * 3600000);
  const dateStr = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;

  const payload: Record<string, unknown[]> = {};
  for (const name of BACKUP_COLLECTIONS) {
    const rows: unknown[] = [];
    let skip = 0;
    while (skip < 1000) {
      const res = await db.collection(name).skip(skip).limit(100).get();
      rows.push(...res.data);
      if (res.data.length < 100) break;
      skip += 100;
    }
    payload[name] = rows;
  }
  const content = Buffer.from(JSON.stringify(payload), 'utf8');
  const cloudPath = `backups/daily/${dateStr}.json`;
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent: content });

  await db.collection(COLLECTIONS.backupMeta).add({
    data: {
      date: dateStr,
      fileID: uploaded.fileID,
      sizeBytes: content.byteLength,
      createdAt: new Date(),
    },
  });

  // 清理 7 天前的备份
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const oldRes = await db
    .collection(COLLECTIONS.backupMeta)
    .where({ createdAt: db.command.lt(cutoff) })
    .limit(100)
    .get();
  let removed = 0;
  if (oldRes.data.length) {
    await cloud.deleteFile({ fileList: oldRes.data.map((r) => r.fileID as string) });
    for (const r of oldRes.data) {
      await db.collection(COLLECTIONS.backupMeta).doc(r._id as string).remove();
    }
    removed = oldRes.data.length;
  }
  return { file: cloudPath, sizeBytes: content.byteLength, removed };
}

export const main = createHandler<
  { silent?: boolean },
  {
    expiredMealPlans: number;
    expiredVisits: number;
    expiredTripPlans: number;
    purgedTrash: number;
    remindersSent: number;
    backup: { file: string; sizeBytes: number; removed: number };
  }
>(
  async () => {
    const repo = new CloudRepo();
    const expiredMealPlans = await new MealService(repo).autoExpire();
    const expiredVisits = await new RestaurantService(repo).autoExpireVisits();
    const expiredTripPlans = await new TravelService(repo).autoExpirePlans();
    const purgedTrash = await new TrashService(repo).autoPurge();
    const remindersSent = await new ReminderService(repo).sendDue();
    const backup = await runDailyBackup();
    return { expiredMealPlans, expiredVisits, expiredTripPlans, purgedTrash, remindersSent, backup };
  },
);

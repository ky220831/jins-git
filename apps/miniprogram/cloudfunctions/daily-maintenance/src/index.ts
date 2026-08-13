import cloud from 'wx-server-sdk';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { MealService } from '../../_shared/mealService';
import { TrashService } from '../../_shared/trashService';

/**
 * 每日维护任务（建议配置定时触发器：每天 04:00 Asia/Shanghai）：
 * 1) 到期 14 天的临时菜单记录 → 回收站
 * 2) 回收站 72 小时到期 → 永久删除
 */
export const main = createHandler<{ silent?: boolean }, { expiredMealPlans: number; purgedTrash: number }>(
  async () => {
    const repo = new CloudRepo();
    const expiredMealPlans = await new MealService(repo).autoExpire();
    const purgedTrash = await new TrashService(repo).autoPurge();
    return { expiredMealPlans, purgedTrash };
  },
);

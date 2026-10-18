import cloud from 'wx-server-sdk';
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
 */
export const main = createHandler<
  { silent?: boolean },
  {
    expiredMealPlans: number;
    expiredVisits: number;
    expiredTripPlans: number;
    purgedTrash: number;
    remindersSent: number;
  }
>(
  async () => {
    const repo = new CloudRepo();
    const expiredMealPlans = await new MealService(repo).autoExpire();
    const expiredVisits = await new RestaurantService(repo).autoExpireVisits();
    const expiredTripPlans = await new TravelService(repo).autoExpirePlans();
    const purgedTrash = await new TrashService(repo).autoPurge();
    const remindersSent = await new ReminderService(repo).sendDue();
    return { expiredMealPlans, expiredVisits, expiredTripPlans, purgedTrash, remindersSent };
  },
);

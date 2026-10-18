import cloud from 'wx-server-sdk';
import type {
  CalendarMonthInput,
  CreateMealPlanInput,
  DeleteMealPlanInput,
  MealPlanView,
  MealRandomInput,
  OfflineMealPlanInput,
  UpdateMealPlanInput,
} from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { MealService } from '../../_shared/mealService';
import { ReminderService } from '../../_shared/reminderService';

const service = new MealService(new CloudRepo());
const repo = new CloudRepo();

/** 菜单新增/编辑后，给已授权的另一方发一次性订阅消息（失败不影响主流程） */
async function notifyMealChange(openid: string, plan: MealPlanView): Promise<void> {
  try {
    const { spaceId } = await requireSpaceMember(repo, openid);
    await new ReminderService(repo).notifyChange(
      spaceId,
      'meal',
      `菜单已更新：${plan.name}`,
      plan.date,
      plan.time || undefined,
      openid,
    );
  } catch {
    // 通知失败不阻塞保存
  }
}

type MealPlanEvent =
  | ({ action: 'month' } & CalendarMonthInput)
  | { action: 'today' }
  | ({ action: 'create' } & CreateMealPlanInput)
  | ({ action: 'update' } & UpdateMealPlanInput)
  | ({ action: 'offline' } & OfflineMealPlanInput)
  | ({ action: 'delete' } & DeleteMealPlanInput)
  | ({ action: 'random' } & MealRandomInput);

export const main = createHandler<MealPlanEvent, MealPlanView[] | MealPlanView | { ok: true }>(
  async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (event?.action === 'create') {
      const plan = await service.createPlan(OPENID, event);
      await notifyMealChange(OPENID, plan);
      return plan;
    }
    if (event?.action === 'update') {
      const plan = await service.updatePlan(OPENID, event);
      await notifyMealChange(OPENID, plan);
      return plan;
    }
    if (event?.action === 'offline') {
      return service.offlinePlan(OPENID, event);
    }
    if (event?.action === 'delete') {
      await service.deletePlan(OPENID, event);
      return { ok: true };
    }
    if (event?.action === 'random') {
      return service.randomPick(OPENID, event);
    }
    if (event?.action === 'today') {
      return service.todayPlans(OPENID);
    }
    return service.listPlansByMonth(OPENID, event);
  },
);

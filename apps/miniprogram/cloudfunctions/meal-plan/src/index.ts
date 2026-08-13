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
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { MealService } from '../../_shared/mealService';

const service = new MealService(new CloudRepo());

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
      return service.createPlan(OPENID, event);
    }
    if (event?.action === 'update') {
      return service.updatePlan(OPENID, event);
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

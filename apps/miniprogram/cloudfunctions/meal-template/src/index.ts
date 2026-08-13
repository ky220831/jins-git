import cloud from 'wx-server-sdk';
import type {
  CreateMealTemplateInput,
  DeleteMealTemplateInput,
  MealTemplateView,
  UpdateMealTemplateInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { MealService } from '../../_shared/mealService';

const service = new MealService(new CloudRepo());

type MealTemplateEvent =
  | { action: 'list' }
  | ({ action: 'create' } & CreateMealTemplateInput)
  | ({ action: 'update' } & UpdateMealTemplateInput)
  | ({ action: 'delete' } & DeleteMealTemplateInput);

export const main = createHandler<MealTemplateEvent, MealTemplateView[] | MealTemplateView | { ok: true }>(
  async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (event?.action === 'create') {
      return service.createTemplate(OPENID, event);
    }
    if (event?.action === 'update') {
      return service.updateTemplate(OPENID, event);
    }
    if (event?.action === 'delete') {
      await service.deleteTemplate(OPENID, event);
      return { ok: true };
    }
    return service.listTemplates(OPENID);
  },
);

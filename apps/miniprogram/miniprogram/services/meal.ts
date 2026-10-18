import { callFunction } from '../api/cloud';
import type {
  CalendarMonthInput,
  CreateMealPlanInput,
  CreateMealTemplateInput,
  DeleteMealPlanInput,
  DeleteMealTemplateInput,
  MealPlanView,
  MealRandomInput,
  MealTemplateView,
  OfflineMealPlanInput,
  UpdateMealPlanInput,
  UpdateMealTemplateInput,
} from '../lib/shared/types/index';

export const MealService = {
  // 素材库
  templates(): Promise<MealTemplateView[]> {
    return callFunction<MealTemplateView[]>('meal-template', { action: 'list' });
  },
  createTemplate(input: CreateMealTemplateInput): Promise<MealTemplateView> {
    return callFunction<MealTemplateView>('meal-template', { action: 'create', ...input });
  },
  updateTemplate(input: UpdateMealTemplateInput): Promise<MealTemplateView> {
    return callFunction<MealTemplateView>('meal-template', { action: 'update', ...input });
  },
  deleteTemplate(input: DeleteMealTemplateInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('meal-template', { action: 'delete', ...input });
  },

  // 今天吃什么（菜单）
  month(input: CalendarMonthInput): Promise<MealPlanView[]> {
    return callFunction<MealPlanView[]>('meal-plan', { action: 'month', ...input });
  },
  today(): Promise<MealPlanView[]> {
    return callFunction<MealPlanView[]>('meal-plan', { action: 'today' });
  },
  createPlan(input: CreateMealPlanInput): Promise<MealPlanView> {
    return callFunction<MealPlanView>('meal-plan', { action: 'create', ...input });
  },
  updatePlan(input: UpdateMealPlanInput): Promise<MealPlanView> {
    return callFunction<MealPlanView>('meal-plan', { action: 'update', ...input });
  },
  offlinePlan(input: OfflineMealPlanInput): Promise<MealPlanView> {
    return callFunction<MealPlanView>('meal-plan', { action: 'offline', ...input });
  },
  deletePlan(input: DeleteMealPlanInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('meal-plan', { action: 'delete', ...input });
  },
  random(input: MealRandomInput): Promise<MealPlanView> {
    return callFunction<MealPlanView>('meal-plan', { action: 'random', ...input });
  },
};

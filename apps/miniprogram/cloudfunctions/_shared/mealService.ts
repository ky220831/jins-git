import {
  MEAL_PLAN_STATUS_OFFLINE,
  MEAL_PLAN_STATUS_PUBLISHED,
  ROLE_OWNER,
  type CalendarMonthInput,
  type CreateMealPlanInput,
  type CreateMealTemplateInput,
  type DeleteMealPlanInput,
  type DeleteMealTemplateInput,
  type MealPlanView,
  type MealRandomInput,
  type MealTemplateView,
  type OfflineMealPlanInput,
  type UpdateMealPlanInput,
  type UpdateMealTemplateInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import { COLLECTIONS, MEAL_NAME_MAX_LENGTH, MEAL_NOTE_MAX_LENGTH, MEAL_PLAN_TTL_DAYS, SYSTEM_ACTOR, TRASH_RETENTION_HOURS } from './constants';
import { isDateString, monthRange, normalizeTime, toShanghaiDate, todayShanghaiString, validateYearMonth } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import { assertVersion } from './version';
import type {
  CalendarEventRecord,
  MealPlanRecord,
  MealTemplateRecord,
  Repo,
  TrashRecord,
} from './repo';

function toMealTemplateView(t: MealTemplateRecord): MealTemplateView {
  return {
    id: t.id,
    name: t.name,
    ...(t.image ? { image: t.image } : {}),
    ...(t.category ? { category: t.category } : {}),
    enabled: t.enabled,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    version: t.version,
  };
}

function toMealPlanView(p: MealPlanRecord): MealPlanView {
  return {
    id: p.id,
    ...(p.templateId ? { templateId: p.templateId } : {}),
    name: p.name,
    date: p.date,
    ...(p.time ? { time: p.time } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.note ? { note: p.note } : {}),
    status: p.status,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    version: p.version,
  };
}

export class MealService {
  constructor(
    private readonly repo: Repo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // ---- 预选素材库（永久保存）----
  async listTemplates(providerUserId: string): Promise<MealTemplateView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const templates = await this.repo.listMealTemplates(spaceId);
    return templates.sort((a, b) => (a.name < b.name ? -1 : 1)).map(toMealTemplateView);
  }

  async createTemplate(
    providerUserId: string,
    input: CreateMealTemplateInput,
  ): Promise<MealTemplateView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const name = (input?.name ?? '').trim();
    if (!name || name.length > MEAL_NAME_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `菜谱名称需为 1~${MEAL_NAME_MAX_LENGTH} 个字符`);
    }
    const now = this.clock();
    const template: MealTemplateRecord = {
      id: newId('mt'),
      spaceId,
      name,
      image: input?.image?.trim() || null,
      category: input?.category?.trim() || null,
      enabled: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repo.createMealTemplate(template);
    await this.audit(userId, spaceId, 'meal.template.create', 'meal_template', template.id, now);
    return toMealTemplateView(template);
  }

  async updateTemplate(
    providerUserId: string,
    input: UpdateMealTemplateInput,
  ): Promise<MealTemplateView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const templateId = input?.templateId?.trim();
    if (!templateId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少素材 ID');
    }
    const existing = await this.repo.findMealTemplateById(spaceId, templateId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '素材不存在或已删除');
    }
    assertVersion(existing.version, input?.version);
    const now = this.clock();
    const patch: Partial<MealTemplateRecord> = {};
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > MEAL_NAME_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `菜谱名称需为 1~${MEAL_NAME_MAX_LENGTH} 个字符`);
      }
      patch.name = name;
    }
    if (input?.category !== undefined) patch.category = input.category?.trim() || null;
    if (input?.image !== undefined) patch.image = input.image?.trim() || null;
    if (input?.enabled !== undefined) patch.enabled = !!input.enabled;
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    await this.repo.updateMealTemplate(spaceId, templateId, patch);
    await this.audit(userId, spaceId, 'meal.template.update', 'meal_template', templateId, now);
    return toMealTemplateView({ ...existing, ...patch });
  }

  async deleteTemplate(
    providerUserId: string,
    input: DeleteMealTemplateInput,
  ): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除素材');
    }
    const templateId = input?.templateId?.trim();
    if (!templateId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少素材 ID');
    }
    const existing = await this.repo.findMealTemplateById(spaceId, templateId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '素材不存在或已删除');
    }
    const now = this.clock();
    await this.trashIt(this.repo, spaceId, userId, COLLECTIONS.mealTemplates, existing, 'manual_delete', 'permanent', now);
    await this.repo.deleteMealTemplate(spaceId, templateId);
    await this.audit(userId, spaceId, 'meal.template.delete', 'meal_template', templateId, now);
  }

  // ---- 今日菜单临时记录 ----
  async listPlansByMonth(
    providerUserId: string,
    input: CalendarMonthInput,
  ): Promise<MealPlanView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const { year, month } = validateYearMonth(input);
    const { start, end } = monthRange(year, month);
    const plans = await this.repo.listMealPlansByDateRange(spaceId, start, end);
    return plans
      .filter((p) => p.status !== MEAL_PLAN_STATUS_OFFLINE)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(toMealPlanView);
  }

  async todayPlans(providerUserId: string): Promise<MealPlanView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const today = todayShanghaiString(this.clock);
    const plans = await this.repo.listMealPlansByDateRange(spaceId, today, today);
    return plans
      .filter((p) => p.status === MEAL_PLAN_STATUS_PUBLISHED)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      .map(toMealPlanView);
  }

  async createPlan(providerUserId: string, input: CreateMealPlanInput): Promise<MealPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const date = (input?.date ?? '').trim();
    if (!isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
    }
    const time = normalizeTime(input?.time);

    let templateId: string | null = null;
    let name = '';
    let category: string | null = null;
    if (input?.templateId) {
      const template = await this.repo.findMealTemplateById(spaceId, input.templateId.trim());
      if (!template) {
        throw new AppError(ErrorCodes.NOT_FOUND, '所选素材不存在，请重新选择');
      }
      templateId = template.id;
      name = template.name;
      category = template.category;
    }
    if (!name) {
      name = (input?.name ?? '').trim();
    }
    if (!name || name.length > MEAL_NAME_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `菜单名称需为 1~${MEAL_NAME_MAX_LENGTH} 个字符`);
    }

    const now = this.clock();
    const plan: MealPlanRecord = {
      id: newId('mp'),
      spaceId,
      templateId,
      name,
      date,
      time,
      category: input?.category?.trim() || category,
      note: input?.note?.trim() || null,
      status: MEAL_PLAN_STATUS_PUBLISHED,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      expireAt: new Date(now.getTime() + MEAL_PLAN_TTL_DAYS * 24 * 3600000),
    };
    await this.repo.inTransaction(async (tx) => {
      await tx.createMealPlan(plan);
      await this.syncCalendarEvent(tx, spaceId, plan, now);
    });
    await this.audit(userId, spaceId, 'meal.plan.create', 'meal_plan', plan.id, now);
    return toMealPlanView(plan);
  }

  async updatePlan(providerUserId: string, input: UpdateMealPlanInput): Promise<MealPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const planId = input?.planId?.trim();
    if (!planId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少菜单 ID');
    }
    const existing = await this.repo.findMealPlanById(spaceId, planId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '菜单记录不存在或已删除');
    }
    assertVersion(existing.version, input?.version);
    const now = this.clock();
    const patch: Partial<MealPlanRecord> = {};
    if (input?.date !== undefined) {
      if (!isDateString(input.date)) {
        throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
      }
      patch.date = input.date;
    }
    if (input?.time !== undefined) patch.time = normalizeTime(input.time);
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > MEAL_NAME_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `菜单名称需为 1~${MEAL_NAME_MAX_LENGTH} 个字符`);
      }
      patch.name = name;
    }
    if (input?.category !== undefined) patch.category = input.category?.trim() || null;
    if (input?.note !== undefined) {
      const note = input.note?.trim() || null;
      if (note && note.length > MEAL_NOTE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${MEAL_NOTE_MAX_LENGTH} 个字符`);
      }
      patch.note = note;
    }
    if (input?.status !== undefined) {
      if (input.status !== MEAL_PLAN_STATUS_PUBLISHED && input.status !== MEAL_PLAN_STATUS_OFFLINE) {
        throw new AppError(ErrorCodes.VALIDATION, '菜单状态不正确');
      }
      patch.status = input.status;
    }
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    const updated: MealPlanRecord = { ...existing, ...patch };
    await this.repo.inTransaction(async (tx) => {
      await tx.updateMealPlan(spaceId, planId, patch);
      await this.syncCalendarEvent(tx, spaceId, updated, now);
    });
    await this.audit(userId, spaceId, 'meal.plan.update', 'meal_plan', planId, now);
    return toMealPlanView(updated);
  }

  async offlinePlan(providerUserId: string, input: OfflineMealPlanInput): Promise<MealPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const planId = input?.planId?.trim();
    if (!planId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少菜单 ID');
    }
    const existing = await this.repo.findMealPlanById(spaceId, planId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '菜单记录不存在或已删除');
    }
    assertVersion(existing.version, input?.version);
    const now = this.clock();
    const updated: MealPlanRecord = {
      ...existing,
      status: MEAL_PLAN_STATUS_OFFLINE,
      updatedAt: now,
      version: existing.version + 1,
    };
    await this.repo.inTransaction(async (tx) => {
      await tx.updateMealPlan(spaceId, planId, {
        status: updated.status,
        updatedAt: now,
        version: updated.version,
      });
      await this.syncCalendarEvent(tx, spaceId, updated, now);
    });
    await this.audit(userId, spaceId, 'meal.plan.offline', 'meal_plan', planId, now);
    return toMealPlanView(updated);
  }

  async deletePlan(providerUserId: string, input: DeleteMealPlanInput): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除菜单记录');
    }
    const planId = input?.planId?.trim();
    if (!planId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少菜单 ID');
    }
    const existing = await this.repo.findMealPlanById(spaceId, planId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '菜单记录不存在或已删除');
    }
    const now = this.clock();
    await this.repo.inTransaction(async (tx) => {
      await this.trashIt(tx, spaceId, userId, COLLECTIONS.mealPlans, existing, 'manual_delete', 'temporary', now);
      await tx.deleteMealPlan(spaceId, planId);
      await this.removeCalendarEvent(tx, spaceId, planId);
    });
    await this.audit(userId, spaceId, 'meal.plan.delete', 'meal_plan', planId, now);
  }

  async randomPick(providerUserId: string, input: MealRandomInput): Promise<MealPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const templates = (await this.repo.listMealTemplates(spaceId)).filter((t) => t.enabled);
    if (templates.length === 0) {
      throw new AppError(ErrorCodes.NOT_FOUND, '预选素材库还没有可用菜谱，请先添加');
    }
    const pick = templates[Math.floor(Math.random() * templates.length)];
    const date = input?.date?.trim() || todayShanghaiString(this.clock);
    if (!isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
    }
    const now = this.clock();
    const plan: MealPlanRecord = {
      id: newId('mp'),
      spaceId,
      templateId: pick.id,
      name: pick.name,
      date,
      time: null,
      category: pick.category,
      note: null,
      status: MEAL_PLAN_STATUS_PUBLISHED,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      expireAt: new Date(now.getTime() + MEAL_PLAN_TTL_DAYS * 24 * 3600000),
    };
    await this.repo.createMealPlan(plan);
    await this.audit(userId, spaceId, 'meal.plan.random', 'meal_plan', plan.id, now);
    return toMealPlanView(plan);
  }

  /** 定时任务：14 天到期的菜单记录移入回收站（PRD §58） */
  async autoExpire(now: Date = this.clock()): Promise<number> {
    const expired = await this.repo.listExpiredMealPlans(now);
    let moved = 0;
    for (const plan of expired) {
      await this.repo.inTransaction(async (tx) => {
        await this.trashIt(tx, plan.spaceId, SYSTEM_ACTOR, COLLECTIONS.mealPlans, plan, 'auto_expire', 'temporary', now);
        await tx.deleteMealPlan(plan.spaceId, plan.id);
        await this.removeCalendarEvent(tx, plan.spaceId, plan.id);
      });
      await this.audit(SYSTEM_ACTOR, plan.spaceId, 'meal.plan.auto_expire', 'meal_plan', plan.id, now);
      moved += 1;
    }
    return moved;
  }

  // ---- 内部：日历联动（业务数据 = 唯一真实来源，PRD §21）----
  private async syncCalendarEvent(
    repo: Repo,
    spaceId: string,
    plan: MealPlanRecord,
    now: Date,
  ): Promise<void> {
    const existing = await repo.findCalendarEventBySource(spaceId, 'meal', plan.id);
    const shouldShow =
      plan.status === MEAL_PLAN_STATUS_PUBLISHED && plan.time !== null && isDateString(plan.date);
    if (shouldShow && plan.time) {
      const startTime = toShanghaiDate(plan.date, plan.time);
      if (existing) {
        await repo.updateCalendarEvent(spaceId, existing.id, {
          title: `🍚 ${plan.name}`,
          startTime,
          endTime: null,
          updatedAt: now,
          version: existing.version + 1,
        });
      } else {
        const event: CalendarEventRecord = {
          id: newId('ce'),
          spaceId,
          sourceType: 'meal',
          sourceId: plan.id,
          title: `🍚 ${plan.name}`,
          startTime,
          endTime: null,
          colorToken: 'accent',
          createdBy: plan.createdBy,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await repo.createCalendarEvent(event);
      }
    } else if (existing) {
      await repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }

  private async removeCalendarEvent(repo: Repo, spaceId: string, planId: string): Promise<void> {
    const existing = await repo.findCalendarEventBySource(spaceId, 'meal', planId);
    if (existing) {
      await repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }

  private async trashIt(
    repo: Repo,
    spaceId: string,
    deletedBy: string,
    collection: string,
    record: MealTemplateRecord | MealPlanRecord,
    reason: string,
    retentionType: 'temporary' | 'permanent',
    now: Date,
  ): Promise<void> {
    const item: TrashRecord = {
      id: newId('tr'),
      spaceId,
      collection,
      recordId: record.id,
      snapshot: { ...record },
      deletedAt: now,
      deletedBy,
      deleteReason: reason,
      purgeAt: new Date(now.getTime() + TRASH_RETENTION_HOURS * 3600000),
      originalStatus: (record as { status?: string }).status ?? null,
      retentionType,
      status: 'in_trash',
      restoredAt: null,
      restoredBy: null,
      createdAt: now,
      updatedAt: now,
    };
    await repo.createTrash(item);
  }

  private async audit(
    actorUserId: string,
    spaceId: string,
    action: string,
    targetType: string,
    targetId: string,
    now: Date,
  ): Promise<void> {
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId,
      action,
      targetType,
      targetId,
      result: 'success',
      createdAt: now,
    });
  }
}

import { ROLE_OWNER, type TrashActionInput, type TrashItemView, type TrashListInput } from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import { COLLECTIONS, MEAL_PLAN_TTL_DAYS, SYSTEM_ACTOR } from './constants';
import { toShanghaiDate } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import type { MealPlanRecord, Repo, TrashRecord } from './repo';

const RESTORABLE_COLLECTIONS: string[] = [COLLECTIONS.mealTemplates, COLLECTIONS.mealPlans];

function toTrashItemView(t: TrashRecord): TrashItemView {
  const snapshot = (t.snapshot ?? {}) as { name?: string; title?: string };
  return {
    id: t.id,
    collection: t.collection,
    recordId: t.recordId,
    title: snapshot.name || snapshot.title || t.recordId,
    deletedAt: t.deletedAt.toISOString(),
    deletedBy: t.deletedBy,
    deleteReason: t.deleteReason,
    purgeAt: t.purgeAt.toISOString(),
    retentionType: t.retentionType,
    ...(t.originalStatus ? { originalStatus: t.originalStatus } : {}),
  };
}

export class TrashService {
  constructor(private readonly repo: Repo) {}

  async list(providerUserId: string, input?: TrashListInput): Promise<TrashItemView[]> {
    const { spaceId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以访问回收站');
    }
    const items = await this.repo.listTrash(spaceId, input?.collection?.trim() || undefined);
    return items
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
      .map(toTrashItemView);
  }

  /** 恢复：72 小时内主账号可恢复（PRD §56/§80） */
  async restore(providerUserId: string, input: TrashActionInput): Promise<void> {
    const { spaceId, role, userId } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以恢复数据');
    }
    const trashId = input?.trashId?.trim();
    if (!trashId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少回收站记录 ID');
    }
    const item = await this.repo.findTrashById(spaceId, trashId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, '回收站记录不存在');
    }
    if (!RESTORABLE_COLLECTIONS.includes(item.collection)) {
      throw new AppError(ErrorCodes.INTERNAL, '该类型数据暂不支持恢复');
    }

    const now = new Date();
    const snapshot = { ...(item.snapshot as Record<string, unknown>) };
    if (item.collection === COLLECTIONS.mealPlans) {
      // 恢复后重新获得 14 天临时周期，避免立刻又被自动清理
      snapshot.expireAt = new Date(now.getTime() + MEAL_PLAN_TTL_DAYS * 24 * 3600000);
    }
    await this.repo.restoreRecord(item.collection, snapshot);
    await this.repo.updateTrash(spaceId, trashId, {
      status: 'restored',
      restoredAt: now,
      restoredBy: userId,
      updatedAt: now,
    });

    // 菜单带时间的记录恢复后，重新生成日历事件（业务数据为唯一真实来源）
    if (item.collection === COLLECTIONS.mealPlans) {
      const plan = snapshot as unknown as MealPlanRecord;
      if (plan.time && plan.status === 'published') {
        await this.repo.createCalendarEvent({
          id: newId('ce'),
          spaceId,
          sourceType: 'meal',
          sourceId: plan.id,
          title: `🍴 ${plan.name}`,
          startTime: toShanghaiDate(plan.date, plan.time),
          endTime: null,
          colorToken: 'accent',
          createdBy: plan.createdBy,
          createdAt: now,
          updatedAt: now,
          version: 1,
        });
      }
    }
    await this.audit(userId, spaceId, 'trash.restore', 'trash_record', trashId, now);
  }

  /** 永久删除：仅主账号，二次确认后调用（PRD §81） */
  async purge(providerUserId: string, input: TrashActionInput): Promise<void> {
    const { spaceId, role, userId } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以永久删除');
    }
    const trashId = input?.trashId?.trim();
    if (!trashId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少回收站记录 ID');
    }
    const item = await this.repo.findTrashById(spaceId, trashId);
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, '回收站记录不存在');
    }
    await this.repo.deleteTrash(spaceId, trashId);
    await this.audit(userId, spaceId, 'trash.purge', 'trash_record', trashId, new Date());
  }

  /** 定时任务：72 小时到期的回收站记录永久删除（PRD §58） */
  async autoPurge(now: Date = new Date()): Promise<number> {
    const due = await this.repo.listTrashDueForPurge(now);
    for (const item of due) {
      await this.repo.deleteTrash(item.spaceId, item.id);
      await this.audit(SYSTEM_ACTOR, item.spaceId, 'trash.auto_purge', 'trash_record', item.id, now);
    }
    return due.length;
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

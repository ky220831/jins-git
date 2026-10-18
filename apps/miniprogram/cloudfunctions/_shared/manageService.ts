import {
  ROLE_OWNER,
  type AuditLogView,
  type ManageAuditResult,
  type ManageOverview,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import { AppError, ErrorCodes } from './errors';
import type { Repo } from './repo';

const WIDE_START = '2000-01-01';
const WIDE_END = '2100-12-31';
const WIDE_START_DATE = new Date('2000-01-01T00:00:00+08:00');
const WIDE_END_DATE = new Date('2100-12-31T23:59:59+08:00');

/** 深拷贝并把 Date 序列化为 ISO 字符串（导出用） */
export function serializeDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDates);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeDates(item);
    }
    return out;
  }
  return value;
}

export class ManageService {
  constructor(private readonly repo: Repo) {}

  /** 主管理概览（仅主账号，PRD §13） */
  async overview(providerUserId: string): Promise<ManageOverview> {
    const { spaceId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以使用管理功能');
    }
    const [mealTemplates, mealPlans, restaurants, restaurantVisits, anniversaries, trips, tripPlans, todos, trash] =
      await Promise.all([
        this.repo.listMealTemplates(spaceId),
        this.repo.listMealPlansByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listRestaurants(spaceId),
        this.repo.listRestaurantVisitsByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listAnniversaries(spaceId),
        this.repo.listTrips(spaceId),
        this.repo.listTripPlansByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listTodosByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listTrash(spaceId),
      ]);
    return {
      role,
      counts: {
        mealTemplates: mealTemplates.length,
        mealPlans: mealPlans.length,
        restaurants: restaurants.length,
        restaurantVisits: restaurantVisits.length,
        anniversaries: anniversaries.length,
        trips: trips.length,
        tripPlans: tripPlans.length,
        todos: todos.length,
        trash: trash.length,
      },
    };
  }

  /** 组装导出 JSON（仅主账号；上传由云函数完成） */
  async buildExport(providerUserId: string): Promise<{ payload: Record<string, unknown>; fileName: string }> {
    const { spaceId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以导出数据');
    }
    const [space, members, todos, events, periods, mealTemplates, mealPlans, restaurants, visits, anniversaries, trips, tripPlans, trash] =
      await Promise.all([
        this.repo.findSpaceById(spaceId),
        this.repo.listActiveMembers(spaceId),
        this.repo.listTodosByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listCalendarEventsByRange(spaceId, WIDE_START_DATE, WIDE_END_DATE),
        this.repo.listPeriodRecords(spaceId),
        this.repo.listMealTemplates(spaceId),
        this.repo.listMealPlansByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listRestaurants(spaceId),
        this.repo.listRestaurantVisitsByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listAnniversaries(spaceId),
        this.repo.listTrips(spaceId),
        this.repo.listTripPlansByDateRange(spaceId, WIDE_START, WIDE_END),
        this.repo.listTrash(spaceId),
      ]);
    const now = new Date();
    const payload: Record<string, unknown> = {
      app: 'our-life',
      version: '1.0.0',
      exportedAt: now.toISOString(),
      space: serializeDates(space),
      members: serializeDates(members),
      data: {
        todos: serializeDates(todos),
        calendarEvents: serializeDates(events),
        periodRecords: serializeDates(periods),
        mealTemplates: serializeDates(mealTemplates),
        mealPlans: serializeDates(mealPlans),
        restaurants: serializeDates(restaurants),
        restaurantVisits: serializeDates(visits),
        anniversaries: serializeDates(anniversaries),
        trips: serializeDates(trips),
        tripPlans: serializeDates(tripPlans),
        trashRecords: serializeDates(trash),
      },
    };
    const fileName = `our-life-${spaceId}-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    return { payload, fileName };
  }

  /** 审计日志（仅主账号，只读，PRD §59） */
  async listAuditLogs(
    providerUserId: string,
    limit = 50,
  ): Promise<ManageAuditResult> {
    const { spaceId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以查看操作记录');
    }
    const logs = await this.repo.listAuditLogs(spaceId, limit);
    const views: AuditLogView[] = logs.map((log) => ({
      id: log.id,
      actorUserId: log.actorUserId,
      action: log.action,
      ...(log.targetType ? { targetType: log.targetType } : {}),
      ...(log.targetId ? { targetId: log.targetId } : {}),
      result: log.result,
      ...(log.detail ? { detail: log.detail } : {}),
      createdAt: log.createdAt.toISOString(),
    }));
    return { logs: views };
  }
}

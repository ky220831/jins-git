import {
  ROLE_OWNER,
  type CalendarMonthInput,
  type CreateTripInput,
  type CreateTripPlanInput,
  type DeleteTripInput,
  type DeleteTripPlanInput,
  type OfflineTripPlanInput,
  type TripItemInput,
  type TripItemView,
  type TripPlanView,
  type TripView,
  type UpdateTripInput,
  type UpdateTripPlanInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import {
  COLLECTIONS,
  SYSTEM_ACTOR,
  TRIP_IMAGES_MAX,
  TRIP_ITEMS_MAX,
  TRIP_NAME_MAX_LENGTH,
  TRIP_NOTE_MAX_LENGTH,
  TRIP_PLAN_TTL_DAYS,
  TRASH_RETENTION_HOURS,
} from './constants';
import {
  isDateString,
  monthRange,
  normalizeTime,
  toShanghaiDate,
  validateYearMonth,
} from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import { assertVersion } from './version';
import type {
  CalendarEventRecord,
  Repo,
  TripItemRecord,
  TripPlanRecord,
  TripRecord,
  TrashRecord,
} from './repo';

function validCoord(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new AppError(ErrorCodes.VALIDATION, `${label}超出有效范围`);
  }
  return num;
}

function normalizeList(values: string[] | null | undefined, max: number): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeItinerary(values: TripItemInput[] | null | undefined): TripItemRecord[] {
  if (!Array.isArray(values)) return [];
  const out: TripItemRecord[] = [];
  for (const raw of values) {
    const title = String(raw?.title ?? '').trim();
    if (!title) continue;
    const date = raw?.date?.trim() || null;
    if (date && !isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '行程日期格式不正确（YYYY-MM-DD）');
    }
    out.push({
      id: newId('ti'),
      date,
      title,
      note: raw?.note?.trim() || null,
    });
    if (out.length >= TRIP_ITEMS_MAX) break;
  }
  return out;
}

function toTripItemView(item: TripItemRecord): TripItemView {
  return {
    id: item.id,
    ...(item.date ? { date: item.date } : {}),
    title: item.title,
    ...(item.note ? { note: item.note } : {}),
  };
}

function toTripView(t: TripRecord): TripView {
  return {
    id: t.id,
    name: t.name,
    ...(t.country ? { country: t.country } : {}),
    ...(t.city ? { city: t.city } : {}),
    ...(typeof t.lat === 'number' ? { lat: t.lat } : {}),
    ...(typeof t.lng === 'number' ? { lng: t.lng } : {}),
    ...(t.transport ? { transport: t.transport } : {}),
    ...(t.hotel ? { hotel: t.hotel } : {}),
    ...(t.note ? { note: t.note } : {}),
    images: t.images,
    itinerary: t.itinerary.map(toTripItemView),
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    version: t.version,
  };
}

function toTripPlanView(p: TripPlanRecord): TripPlanView {
  return {
    id: p.id,
    ...(p.tripId ? { tripId: p.tripId } : {}),
    name: p.name,
    startDate: p.startDate,
    ...(p.endDate ? { endDate: p.endDate } : {}),
    ...(p.time ? { time: p.time } : {}),
    ...(p.note ? { note: p.note } : {}),
    status: p.status,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    version: p.version,
  };
}

export class TravelService {
  constructor(
    private readonly repo: Repo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // ---- 永久旅游资料（不自动清理，PRD §53）----
  async listTrips(providerUserId: string): Promise<TripView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    return (await this.repo.listTrips(spaceId))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map(toTripView);
  }

  async createTrip(providerUserId: string, input: CreateTripInput): Promise<TripView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const name = (input?.name ?? '').trim();
    if (!name || name.length > TRIP_NAME_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `旅行名称需为 1~${TRIP_NAME_MAX_LENGTH} 个字符`);
    }
    const note = input?.note?.trim() || null;
    if (note && note.length > TRIP_NOTE_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${TRIP_NOTE_MAX_LENGTH} 个字符`);
    }
    const now = this.clock();
    const trip: TripRecord = {
      id: newId('tp'),
      spaceId,
      name,
      country: input?.country?.trim() || null,
      city: input?.city?.trim() || null,
      lat: validCoord(input?.lat, '纬度', -90, 90),
      lng: validCoord(input?.lng, '经度', -180, 180),
      transport: input?.transport?.trim() || null,
      hotel: input?.hotel?.trim() || null,
      note,
      images: normalizeList(input?.images, TRIP_IMAGES_MAX),
      itinerary: normalizeItinerary(input?.itinerary),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repo.createTrip(trip);
    await this.audit(userId, spaceId, 'trip.create', 'trip', trip.id, now);
    return toTripView(trip);
  }

  async updateTrip(providerUserId: string, input: UpdateTripInput): Promise<TripView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const tripId = input?.tripId?.trim();
    if (!tripId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少旅行 ID');
    }
    const existing = await this.repo.findTripById(spaceId, tripId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '旅行计划不存在或已删除');
    }
    assertVersion(existing.version, input?.version);
    const now = this.clock();
    const patch: Partial<TripRecord> = {};
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > TRIP_NAME_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `旅行名称需为 1~${TRIP_NAME_MAX_LENGTH} 个字符`);
      }
      patch.name = name;
    }
    if (input?.country !== undefined) patch.country = input.country?.trim() || null;
    if (input?.city !== undefined) patch.city = input.city?.trim() || null;
    if (input?.lat !== undefined) patch.lat = validCoord(input.lat, '纬度', -90, 90);
    if (input?.lng !== undefined) patch.lng = validCoord(input.lng, '经度', -180, 180);
    if (input?.transport !== undefined) patch.transport = input.transport?.trim() || null;
    if (input?.hotel !== undefined) patch.hotel = input.hotel?.trim() || null;
    if (input?.note !== undefined) {
      const note = input.note?.trim() || null;
      if (note && note.length > TRIP_NOTE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${TRIP_NOTE_MAX_LENGTH} 个字符`);
      }
      patch.note = note;
    }
    if (input?.images !== undefined) patch.images = normalizeList(input.images, TRIP_IMAGES_MAX);
    if (input?.itinerary !== undefined) patch.itinerary = normalizeItinerary(input.itinerary);
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    await this.repo.updateTrip(spaceId, tripId, patch);
    await this.audit(userId, spaceId, 'trip.update', 'trip', tripId, now);
    return toTripView({ ...existing, ...patch });
  }

  async deleteTrip(providerUserId: string, input: DeleteTripInput): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除旅行计划');
    }
    const tripId = input?.tripId?.trim();
    if (!tripId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少旅行 ID');
    }
    const existing = await this.repo.findTripById(spaceId, tripId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '旅行计划不存在或已删除');
    }
    const now = this.clock();
    await this.trashIt(this.repo, spaceId, userId, COLLECTIONS.trips, existing, 'manual_delete', 'permanent', now);
    await this.repo.deleteTrip(spaceId, tripId);
    await this.audit(userId, spaceId, 'trip.delete', 'trip', tripId, now);
  }

  // ---- 临时行程记录（14 天，PRD §53/§79）----
  async listPlansByMonth(
    providerUserId: string,
    input: CalendarMonthInput,
  ): Promise<TripPlanView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const { year, month } = validateYearMonth(input);
    const { start, end } = monthRange(year, month);
    return (await this.repo.listTripPlansByDateRange(spaceId, start, end))
      .filter((p) => p.status !== 'offline')
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
      .map(toTripPlanView);
  }

  async createPlan(providerUserId: string, input: CreateTripPlanInput): Promise<TripPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const startDate = (input?.startDate ?? '').trim();
    if (!isDateString(startDate)) {
      throw new AppError(ErrorCodes.VALIDATION, '开始日期格式不正确');
    }
    const endDate = input?.endDate?.trim() || null;
    if (endDate && !isDateString(endDate)) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期格式不正确');
    }
    if (endDate && endDate < startDate) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期不能早于开始日期');
    }
    const tripId = input?.tripId?.trim() || null;
    let name = (input?.name ?? '').trim();
    if (tripId) {
      const trip = await this.repo.findTripById(spaceId, tripId);
      if (!trip) {
        throw new AppError(ErrorCodes.NOT_FOUND, '关联的旅行计划不存在或已删除');
      }
      name = name || trip.name;
    }
    if (!name || name.length > TRIP_NAME_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `行程名称需为 1~${TRIP_NAME_MAX_LENGTH} 个字符`);
    }
    const time = normalizeTime(input?.time);
    const now = this.clock();
    const plan: TripPlanRecord = {
      id: newId('tpl'),
      spaceId,
      tripId,
      name,
      startDate,
      endDate,
      time,
      note: input?.note?.trim() || null,
      status: 'planned',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      expireAt: new Date(now.getTime() + TRIP_PLAN_TTL_DAYS * 24 * 3600000),
    };
    await this.repo.inTransaction(async (tx) => {
      await tx.createTripPlan(plan);
      await this.syncPlanCalendarEvent(tx, spaceId, plan, now);
    });
    await this.audit(userId, spaceId, 'trip.plan.create', 'trip_plan', plan.id, now);
    return toTripPlanView(plan);
  }

  async updatePlan(providerUserId: string, input: UpdateTripPlanInput): Promise<TripPlanView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const planId = input?.planId?.trim();
    if (!planId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少行程记录 ID');
    }
    const existing = await this.repo.findTripPlanById(spaceId, planId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程记录不存在或已删除');
    }
    assertVersion(existing.version, input?.version);
    const now = this.clock();
    const patch: Partial<TripPlanRecord> = {};
    if (input?.tripId !== undefined) {
      const tripId = input.tripId?.trim() || null;
      if (tripId) {
        const trip = await this.repo.findTripById(spaceId, tripId);
        if (!trip) {
          throw new AppError(ErrorCodes.NOT_FOUND, '关联的旅行计划不存在或已删除');
        }
      }
      patch.tripId = tripId;
    }
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > TRIP_NAME_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `行程名称需为 1~${TRIP_NAME_MAX_LENGTH} 个字符`);
      }
      patch.name = name;
    }
    if (input?.startDate !== undefined) {
      if (!isDateString(input.startDate)) {
        throw new AppError(ErrorCodes.VALIDATION, '开始日期格式不正确');
      }
      patch.startDate = input.startDate;
    }
    if (input?.endDate !== undefined) {
      const endDate = input.endDate?.trim() || null;
      if (endDate && !isDateString(endDate)) {
        throw new AppError(ErrorCodes.VALIDATION, '结束日期格式不正确');
      }
      patch.endDate = endDate;
    }
    if (input?.time !== undefined) patch.time = normalizeTime(input.time);
    if (input?.note !== undefined) patch.note = input.note?.trim() || null;
    if (input?.status !== undefined) {
      if (input.status !== 'planned' && input.status !== 'offline') {
        throw new AppError(ErrorCodes.VALIDATION, '行程状态不正确');
      }
      patch.status = input.status;
    }
    const startDate = patch.startDate ?? existing.startDate;
    const endDate = patch.endDate ?? existing.endDate;
    if (endDate && endDate < startDate) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期不能早于开始日期');
    }
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    const updated: TripPlanRecord = { ...existing, ...patch };
    await this.repo.inTransaction(async (tx) => {
      await tx.updateTripPlan(spaceId, planId, patch);
      await this.syncPlanCalendarEvent(tx, spaceId, updated, now);
    });
    await this.audit(userId, spaceId, 'trip.plan.update', 'trip_plan', planId, now);
    return toTripPlanView(updated);
  }

  async offlinePlan(
    providerUserId: string,
    input: OfflineTripPlanInput,
  ): Promise<TripPlanView> {
    return this.updatePlan(providerUserId, { ...input, status: 'offline' });
  }

  async deletePlan(providerUserId: string, input: DeleteTripPlanInput): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除行程记录');
    }
    const planId = input?.planId?.trim();
    if (!planId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少行程记录 ID');
    }
    const existing = await this.repo.findTripPlanById(spaceId, planId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程记录不存在或已删除');
    }
    const now = this.clock();
    await this.repo.inTransaction(async (tx) => {
      await this.trashIt(tx, spaceId, userId, COLLECTIONS.tripPlans, existing, 'manual_delete', 'temporary', now);
      await tx.deleteTripPlan(spaceId, planId);
      await this.removePlanCalendarEvent(tx, spaceId, planId);
    });
    await this.audit(userId, spaceId, 'trip.plan.delete', 'trip_plan', planId, now);
  }

  /** 定时任务：14 天到期的临时行程移入回收站 */
  async autoExpirePlans(now: Date = this.clock()): Promise<number> {
    const expired = await this.repo.listExpiredTripPlans(now);
    let moved = 0;
    for (const plan of expired) {
      await this.repo.inTransaction(async (tx) => {
        await this.trashIt(
          tx,
          plan.spaceId,
          SYSTEM_ACTOR,
          COLLECTIONS.tripPlans,
          plan,
          'auto_expire',
          'temporary',
          now,
        );
        await tx.deleteTripPlan(plan.spaceId, plan.id);
        await this.removePlanCalendarEvent(tx, plan.spaceId, plan.id);
      });
      await this.audit(SYSTEM_ACTOR, plan.spaceId, 'trip.plan.auto_expire', 'trip_plan', plan.id, now);
      moved += 1;
    }
    return moved;
  }

  // ---- 日历联动：业务数据 = 唯一真实来源（PRD §21）----
  private async syncPlanCalendarEvent(
    repo: Repo,
    spaceId: string,
    plan: TripPlanRecord,
    now: Date,
  ): Promise<void> {
    const existing = await repo.findCalendarEventBySource(spaceId, 'trip', plan.id);
    const shouldShow = plan.status === 'planned' && isDateString(plan.startDate);
    if (shouldShow) {
      const startTime = toShanghaiDate(plan.startDate, plan.time || '00:00');
      if (existing) {
        await repo.updateCalendarEvent(spaceId, existing.id, {
          title: `✈️ ${plan.name}`,
          startTime,
          endTime: null,
          updatedAt: now,
          version: existing.version + 1,
        });
      } else {
        const event: CalendarEventRecord = {
          id: newId('ce'),
          spaceId,
          sourceType: 'trip',
          sourceId: plan.id,
          title: `✈️ ${plan.name}`,
          startTime,
          endTime: null,
          colorToken: 'trip',
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

  private async removePlanCalendarEvent(repo: Repo, spaceId: string, planId: string): Promise<void> {
    const existing = await repo.findCalendarEventBySource(spaceId, 'trip', planId);
    if (existing) {
      await repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }

  private async trashIt(
    repo: Repo,
    spaceId: string,
    deletedBy: string,
    collection: string,
    record: TripRecord | TripPlanRecord,
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

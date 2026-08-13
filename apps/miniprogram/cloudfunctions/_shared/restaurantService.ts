import {
  RESTAURANT_SOURCE_MANUAL,
  ROLE_OWNER,
  type CalendarMonthInput,
  type CreateRestaurantInput,
  type CreateRestaurantVisitInput,
  type DeleteRestaurantInput,
  type DeleteRestaurantVisitInput,
  type OfflineRestaurantVisitInput,
  type RestaurantView,
  type RestaurantVisitView,
  type UpdateRestaurantInput,
  type UpdateRestaurantVisitInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import {
  COLLECTIONS,
  RESTAURANT_DISHES_MAX,
  RESTAURANT_NAME_MAX_LENGTH,
  RESTAURANT_NOTE_MAX_LENGTH,
  RESTAURANT_TAGS_MAX,
  RESTAURANT_VISIT_TTL_DAYS,
  SYSTEM_ACTOR,
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
import type {
  CalendarEventRecord,
  Repo,
  RestaurantRecord,
  RestaurantVisitRecord,
  TrashRecord,
} from './repo';

function toRestaurantView(r: RestaurantRecord): RestaurantView {
  return {
    id: r.id,
    name: r.name,
    ...(r.address ? { address: r.address } : {}),
    ...(r.city ? { city: r.city } : {}),
    ...(r.district ? { district: r.district } : {}),
    ...(typeof r.lat === 'number' ? { lat: r.lat } : {}),
    ...(typeof r.lng === 'number' ? { lng: r.lng } : {}),
    ...(r.category ? { category: r.category } : {}),
    ...(typeof r.pricePerPerson === 'number' ? { pricePerPerson: r.pricePerPerson } : {}),
    tags: r.tags,
    ...(typeof r.rating === 'number' ? { rating: r.rating } : {}),
    recommendedDishes: r.recommendedDishes,
    ...(r.coverImage ? { coverImage: r.coverImage } : {}),
    images: r.images,
    menuImages: r.menuImages,
    ...(r.note ? { note: r.note } : {}),
    visited: r.visited,
    favorite: r.favorite,
    enabled: r.enabled,
    ...(r.businessHours ? { businessHours: r.businessHours } : {}),
    source: r.source,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    version: r.version,
  };
}

function toVisitView(v: RestaurantVisitRecord): RestaurantVisitView {
  return {
    id: v.id,
    restaurantId: v.restaurantId,
    name: v.name,
    date: v.date,
    ...(v.time ? { time: v.time } : {}),
    ...(v.note ? { note: v.note } : {}),
    status: v.status,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    version: v.version,
  };
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

function validCoord(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new AppError(ErrorCodes.VALIDATION, `${label}超出有效范围`);
  }
  return num;
}

function validPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100000) {
    throw new AppError(ErrorCodes.VALIDATION, '人均价格超出有效范围');
  }
  return num;
}

function validRating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 5) {
    throw new AppError(ErrorCodes.VALIDATION, '评分需在 0~5 之间');
  }
  return num;
}

export class RestaurantService {
  constructor(
    private readonly repo: Repo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // ---- 餐厅（永久素材，收藏保留，PRD §41）----
  async listRestaurants(providerUserId: string): Promise<RestaurantView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const restaurants = await this.repo.listRestaurants(spaceId);
    return restaurants
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      })
      .map(toRestaurantView);
  }

  async createRestaurant(
    providerUserId: string,
    input: CreateRestaurantInput,
  ): Promise<RestaurantView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const name = (input?.name ?? '').trim();
    if (!name || name.length > RESTAURANT_NAME_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `餐厅名称需为 1~${RESTAURANT_NAME_MAX_LENGTH} 个字符`);
    }
    const now = this.clock();
    const restaurant: RestaurantRecord = {
      id: newId('rs'),
      spaceId,
      name,
      address: input?.address?.trim() || null,
      city: input?.city?.trim() || null,
      district: input?.district?.trim() || null,
      lat: validCoord(input?.lat, '纬度', -90, 90),
      lng: validCoord(input?.lng, '经度', -180, 180),
      category: input?.category?.trim() || null,
      pricePerPerson: validPrice(input?.pricePerPerson),
      tags: normalizeList(input?.tags, RESTAURANT_TAGS_MAX),
      rating: validRating(input?.rating),
      recommendedDishes: normalizeList(input?.recommendedDishes, RESTAURANT_DISHES_MAX),
      coverImage: input?.coverImage?.trim() || null,
      images: normalizeList(input?.images, 20),
      menuImages: normalizeList(input?.menuImages, 20),
      note: input?.note?.trim() || null,
      visited: !!input?.visited,
      favorite: !!input?.favorite,
      enabled: true,
      businessHours: input?.businessHours?.trim() || null,
      source: RESTAURANT_SOURCE_MANUAL,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repo.createRestaurant(restaurant);
    await this.audit(userId, spaceId, 'restaurant.create', 'restaurant', restaurant.id, now);
    return toRestaurantView(restaurant);
  }

  async updateRestaurant(
    providerUserId: string,
    input: UpdateRestaurantInput,
  ): Promise<RestaurantView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const restaurantId = input?.restaurantId?.trim();
    if (!restaurantId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少餐厅 ID');
    }
    const existing = await this.repo.findRestaurantById(spaceId, restaurantId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '餐厅不存在或已删除');
    }
    const now = this.clock();
    const patch: Partial<RestaurantRecord> = {};
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > RESTAURANT_NAME_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `餐厅名称需为 1~${RESTAURANT_NAME_MAX_LENGTH} 个字符`);
      }
      patch.name = name;
    }
    if (input?.address !== undefined) patch.address = input.address?.trim() || null;
    if (input?.city !== undefined) patch.city = input.city?.trim() || null;
    if (input?.district !== undefined) patch.district = input.district?.trim() || null;
    if (input?.lat !== undefined) patch.lat = validCoord(input.lat, '纬度', -90, 90);
    if (input?.lng !== undefined) patch.lng = validCoord(input.lng, '经度', -180, 180);
    if (input?.category !== undefined) patch.category = input.category?.trim() || null;
    if (input?.pricePerPerson !== undefined) patch.pricePerPerson = validPrice(input.pricePerPerson);
    if (input?.tags !== undefined) patch.tags = normalizeList(input.tags, RESTAURANT_TAGS_MAX);
    if (input?.rating !== undefined) patch.rating = validRating(input.rating);
    if (input?.recommendedDishes !== undefined) {
      patch.recommendedDishes = normalizeList(input.recommendedDishes, RESTAURANT_DISHES_MAX);
    }
    if (input?.coverImage !== undefined) patch.coverImage = input.coverImage?.trim() || null;
    if (input?.images !== undefined) patch.images = normalizeList(input.images, 20);
    if (input?.menuImages !== undefined) patch.menuImages = normalizeList(input.menuImages, 20);
    if (input?.note !== undefined) {
      const note = input.note?.trim() || null;
      if (note && note.length > RESTAURANT_NOTE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${RESTAURANT_NOTE_MAX_LENGTH} 个字符`);
      }
      patch.note = note;
    }
    if (input?.favorite !== undefined) patch.favorite = !!input.favorite;
    if (input?.visited !== undefined) patch.visited = !!input.visited;
    if (input?.enabled !== undefined) patch.enabled = !!input.enabled;
    if (input?.businessHours !== undefined) patch.businessHours = input.businessHours?.trim() || null;
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    await this.repo.updateRestaurant(spaceId, restaurantId, patch);
    await this.audit(userId, spaceId, 'restaurant.update', 'restaurant', restaurantId, now);
    return toRestaurantView({ ...existing, ...patch });
  }

  async deleteRestaurant(
    providerUserId: string,
    input: DeleteRestaurantInput,
  ): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除餐厅');
    }
    const restaurantId = input?.restaurantId?.trim();
    if (!restaurantId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少餐厅 ID');
    }
    const existing = await this.repo.findRestaurantById(spaceId, restaurantId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '餐厅不存在或已删除');
    }
    const now = this.clock();
    await this.trashIt(spaceId, userId, COLLECTIONS.restaurants, existing, 'manual_delete', 'permanent', now);
    await this.repo.deleteRestaurant(spaceId, restaurantId);
    await this.audit(userId, spaceId, 'restaurant.delete', 'restaurant', restaurantId, now);
  }

  // ---- 临时行程（14 天，PRD §42/§79）----
  async listVisitsByMonth(
    providerUserId: string,
    input: CalendarMonthInput,
  ): Promise<RestaurantVisitView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const { year, month } = validateYearMonth(input);
    const { start, end } = monthRange(year, month);
    const visits = await this.repo.listRestaurantVisitsByDateRange(spaceId, start, end);
    return visits
      .filter((v) => v.status !== 'offline')
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(toVisitView);
  }

  async createVisit(
    providerUserId: string,
    input: CreateRestaurantVisitInput,
  ): Promise<RestaurantVisitView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const restaurantId = input?.restaurantId?.trim();
    if (!restaurantId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少餐厅 ID');
    }
    const restaurant = await this.repo.findRestaurantById(spaceId, restaurantId);
    if (!restaurant) {
      throw new AppError(ErrorCodes.NOT_FOUND, '餐厅不存在或已删除');
    }
    const date = (input?.date ?? '').trim();
    if (!isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
    }
    const time = normalizeTime(input?.time);
    const now = this.clock();
    const visit: RestaurantVisitRecord = {
      id: newId('rv'),
      spaceId,
      restaurantId,
      name: restaurant.name,
      date,
      time,
      note: input?.note?.trim() || null,
      status: 'planned',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      expireAt: new Date(now.getTime() + RESTAURANT_VISIT_TTL_DAYS * 24 * 3600000),
    };
    await this.repo.createRestaurantVisit(visit);
    await this.syncVisitCalendarEvent(spaceId, visit, now);
    await this.audit(userId, spaceId, 'restaurant.visit.create', 'restaurant_visit', visit.id, now);
    return toVisitView(visit);
  }

  async updateVisit(
    providerUserId: string,
    input: UpdateRestaurantVisitInput,
  ): Promise<RestaurantVisitView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const visitId = input?.visitId?.trim();
    if (!visitId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少行程 ID');
    }
    const existing = await this.repo.findRestaurantVisitById(spaceId, visitId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在或已删除');
    }
    const now = this.clock();
    const patch: Partial<RestaurantVisitRecord> = {};
    if (input?.date !== undefined) {
      if (!isDateString(input.date)) {
        throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
      }
      patch.date = input.date;
    }
    if (input?.time !== undefined) patch.time = normalizeTime(input.time);
    if (input?.note !== undefined) {
      const note = input.note?.trim() || null;
      if (note && note.length > RESTAURANT_NOTE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${RESTAURANT_NOTE_MAX_LENGTH} 个字符`);
      }
      patch.note = note;
    }
    if (input?.status !== undefined) {
      if (input.status !== 'planned' && input.status !== 'offline') {
        throw new AppError(ErrorCodes.VALIDATION, '行程状态不正确');
      }
      patch.status = input.status;
    }
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    await this.repo.updateRestaurantVisit(spaceId, visitId, patch);
    const updated: RestaurantVisitRecord = { ...existing, ...patch };
    await this.syncVisitCalendarEvent(spaceId, updated, now);
    await this.audit(userId, spaceId, 'restaurant.visit.update', 'restaurant_visit', visitId, now);
    return toVisitView(updated);
  }

  async offlineVisit(
    providerUserId: string,
    input: OfflineRestaurantVisitInput,
  ): Promise<RestaurantVisitView> {
    return this.updateVisit(providerUserId, { ...input, status: 'offline' });
  }

  async deleteVisit(
    providerUserId: string,
    input: DeleteRestaurantVisitInput,
  ): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除行程');
    }
    const visitId = input?.visitId?.trim();
    if (!visitId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少行程 ID');
    }
    const existing = await this.repo.findRestaurantVisitById(spaceId, visitId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在或已删除');
    }
    const now = this.clock();
    await this.trashIt(spaceId, userId, COLLECTIONS.restaurantVisits, existing, 'manual_delete', 'temporary', now);
    await this.repo.deleteRestaurantVisit(spaceId, visitId);
    await this.removeVisitCalendarEvent(spaceId, visitId);
    await this.audit(userId, spaceId, 'restaurant.visit.delete', 'restaurant_visit', visitId, now);
  }

  /** 定时任务：14 天到期的行程移入回收站（PRD §58/§79） */
  async autoExpireVisits(now: Date = this.clock()): Promise<number> {
    const expired = await this.repo.listExpiredRestaurantVisits(now);
    let moved = 0;
    for (const visit of expired) {
      await this.trashIt(visit.spaceId, SYSTEM_ACTOR, COLLECTIONS.restaurantVisits, visit, 'auto_expire', 'temporary', now);
      await this.repo.deleteRestaurantVisit(visit.spaceId, visit.id);
      await this.removeVisitCalendarEvent(visit.spaceId, visit.id);
      await this.audit(SYSTEM_ACTOR, visit.spaceId, 'restaurant.visit.auto_expire', 'restaurant_visit', visit.id, now);
      moved += 1;
    }
    return moved;
  }

  // ---- 内部：日历联动（业务数据 = 唯一真实来源，PRD §21）----
  private async syncVisitCalendarEvent(
    spaceId: string,
    visit: RestaurantVisitRecord,
    now: Date,
  ): Promise<void> {
    const existing = await this.repo.findCalendarEventBySource(spaceId, 'restaurant', visit.id);
    const shouldShow = visit.status === 'planned' && visit.time !== null && isDateString(visit.date);
    if (shouldShow && visit.time) {
      const startTime = toShanghaiDate(visit.date, visit.time);
      if (existing) {
        await this.repo.updateCalendarEvent(spaceId, existing.id, {
          title: `🍴 ${visit.name}`,
          startTime,
          endTime: null,
          updatedAt: now,
          version: existing.version + 1,
        });
      } else {
        const event: CalendarEventRecord = {
          id: newId('ce'),
          spaceId,
          sourceType: 'restaurant',
          sourceId: visit.id,
          title: `🍴 ${visit.name}`,
          startTime,
          endTime: null,
          colorToken: 'accent',
          createdBy: visit.createdBy,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await this.repo.createCalendarEvent(event);
      }
    } else if (existing) {
      await this.repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }

  private async removeVisitCalendarEvent(spaceId: string, visitId: string): Promise<void> {
    const existing = await this.repo.findCalendarEventBySource(spaceId, 'restaurant', visitId);
    if (existing) {
      await this.repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }

  private async trashIt(
    spaceId: string,
    deletedBy: string,
    collection: string,
    record: RestaurantRecord | RestaurantVisitRecord,
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
    await this.repo.createTrash(item);
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

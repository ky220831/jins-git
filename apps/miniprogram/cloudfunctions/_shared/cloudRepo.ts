import cloud from 'wx-server-sdk';
import { COLLECTIONS } from './constants';
import { AppError, ErrorCodes } from './errors';
import type {
  AuditLogRecord,
  AnniversaryRecord,
  CalendarEventRecord,
  HolidayRecord,
  MealPlanRecord,
  MealTemplateRecord,
  PeriodRecordRecord,
  Repo,
  RestaurantRecord,
  RestaurantVisitRecord,
  SpaceMemberRecord,
  SpaceRecord,
  SpaceSettingRecord,
  TodoRecord,
  TripPlanRecord,
  TripRecord,
  TrashRecord,
  UserIdentityRecord,
  UserRecord,
} from './repo';

// 云端部署时使用当前环境；本地脚本可通过 CLOUDBASE_ENV_ID 指定环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV || process.env.CLOUDBASE_ENV_ID });

const db = cloud.database();
const _ = db.command;

/** 频控集合只需在进程内创建一次（云函数实例级缓存） */
let rateCollectionEnsured = false;

function mapDoc<T>(doc: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { ...rest, id: (_id as string) ?? ((rest as { id?: string }).id ?? '') } as T;
}

export class CloudRepo implements Repo {
  private col(name: string) {
    return db.collection(name);
  }

  async findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null> {
    const res = await this.col(COLLECTIONS.userIdentities)
      .where({ provider, providerUserId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<UserIdentityRecord>(res.data[0]) : null;
  }

  async createUser(user: UserRecord): Promise<void> {
    await this.col(COLLECTIONS.users).doc(user.id).set({ data: user });
  }

  async createUserIdentity(identity: UserIdentityRecord): Promise<void> {
    await this.col(COLLECTIONS.userIdentities).doc(identity.id).set({ data: identity });
  }

  async findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null> {
    const res = await this.col(COLLECTIONS.spaceMembers)
      .where({ userId, status: 'active' })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceMemberRecord>(res.data[0]) : null;
  }

  async findSpaceById(spaceId: string): Promise<SpaceRecord | null> {
    const res = await this.col(COLLECTIONS.spaces)
      .where({ _id: spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceRecord>(res.data[0]) : null;
  }

  async findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null> {
    const res = await this.col(COLLECTIONS.spaces)
      .where({ inviteCode, status: 'active' })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceRecord>(res.data[0]) : null;
  }

  async createSpace(space: SpaceRecord): Promise<void> {
    await this.col(COLLECTIONS.spaces).doc(space.id).set({ data: space });
  }

  async createMember(member: SpaceMemberRecord): Promise<void> {
    await this.col(COLLECTIONS.spaceMembers).doc(member.id).set({ data: member });
  }

  async updateMemberNickname(spaceId: string, userId: string, nickname: string): Promise<void> {
    await this.col(COLLECTIONS.spaceMembers)
      .where({ spaceId, userId, status: 'active' })
      .update({ data: { nickname, updatedAt: new Date() } });
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void> {
    await this.col(COLLECTIONS.spaces).doc(spaceId).update({ data: patch });
  }

  async listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]> {
    const res = await this.col(COLLECTIONS.spaceMembers)
      .where({ spaceId, status: 'active' })
      .get();
    return res.data.map((d) => mapDoc<SpaceMemberRecord>(d));
  }

  async writeAudit(log: AuditLogRecord): Promise<void> {
    await this.col(COLLECTIONS.auditLogs).add({ data: log });
  }

  async findTodoById(spaceId: string, todoId: string): Promise<TodoRecord | null> {
    const res = await this.col(COLLECTIONS.todos)
      .where({ _id: todoId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<TodoRecord>(res.data[0]) : null;
  }

  async createTodo(todo: TodoRecord): Promise<void> {
    await this.col(COLLECTIONS.todos).doc(todo.id).set({ data: todo });
  }

  async updateTodo(spaceId: string, todoId: string, patch: Partial<TodoRecord>): Promise<void> {
    await this.col(COLLECTIONS.todos).where({ _id: todoId, spaceId }).update({ data: patch });
  }

  async listTodosByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<TodoRecord[]> {
    const res = await this.col(COLLECTIONS.todos)
      .where({ spaceId, date: _.gte(startDate).and(_.lte(endDate)) })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<TodoRecord>(d));
  }

  async findCalendarEventBySource(
    spaceId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<CalendarEventRecord | null> {
    const res = await this.col(COLLECTIONS.calendarEvents)
      .where({ spaceId, sourceType, sourceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<CalendarEventRecord>(res.data[0]) : null;
  }

  async listCalendarEventsByRange(
    spaceId: string,
    start: Date,
    end: Date,
  ): Promise<CalendarEventRecord[]> {
    const res = await this.col(COLLECTIONS.calendarEvents)
      .where({ spaceId, startTime: _.gte(start).and(_.lte(end)) })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<CalendarEventRecord>(d));
  }

  async createCalendarEvent(event: CalendarEventRecord): Promise<void> {
    await this.col(COLLECTIONS.calendarEvents).doc(event.id).set({ data: event });
  }

  async updateCalendarEvent(
    spaceId: string,
    eventId: string,
    patch: Partial<CalendarEventRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.calendarEvents)
      .where({ _id: eventId, spaceId })
      .update({ data: patch });
  }

  async deleteCalendarEvent(spaceId: string, eventId: string): Promise<void> {
    await this.col(COLLECTIONS.calendarEvents)
      .where({ _id: eventId, spaceId })
      .remove();
  }

  async listPeriodRecords(spaceId: string): Promise<PeriodRecordRecord[]> {
    const res = await this.col(COLLECTIONS.periodRecords)
      .where({ spaceId })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<PeriodRecordRecord>(d));
  }

  async createPeriodRecord(record: PeriodRecordRecord): Promise<void> {
    await this.col(COLLECTIONS.periodRecords).doc(record.id).set({ data: record });
  }

  async findPeriodRecordById(
    spaceId: string,
    recordId: string,
  ): Promise<PeriodRecordRecord | null> {
    const res = await this.col(COLLECTIONS.periodRecords)
      .where({ _id: recordId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<PeriodRecordRecord>(res.data[0]) : null;
  }

  async updatePeriodRecord(
    spaceId: string,
    recordId: string,
    patch: Partial<PeriodRecordRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.periodRecords)
      .where({ _id: recordId, spaceId })
      .update({ data: patch });
  }

  async deletePeriodRecord(spaceId: string, recordId: string): Promise<void> {
    await this.col(COLLECTIONS.periodRecords).where({ _id: recordId, spaceId }).remove();
  }

  async listHolidaysByRange(startDate: string, endDate: string): Promise<HolidayRecord[]> {
    const res = await this.col(COLLECTIONS.holidays)
      .where({ date: _.gte(startDate).and(_.lte(endDate)) })
      .limit(500)
      .get();
    return res.data.map((d) => mapDoc<HolidayRecord>(d));
  }

  async upsertHoliday(record: HolidayRecord): Promise<void> {
    await this.col(COLLECTIONS.holidays).doc(record.id).set({ data: record });
  }

  async findSpaceSetting(spaceId: string, key: string): Promise<SpaceSettingRecord | null> {
    const res = await this.col(COLLECTIONS.spaceSettings)
      .where({ spaceId, key })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceSettingRecord>(res.data[0]) : null;
  }

  async upsertSpaceSetting(setting: SpaceSettingRecord): Promise<void> {
    await this.col(COLLECTIONS.spaceSettings).doc(setting.id).set({ data: setting });
  }

  async listMealTemplates(spaceId: string): Promise<MealTemplateRecord[]> {
    const res = await this.col(COLLECTIONS.mealTemplates)
      .where({ spaceId })
      .limit(200)
      .get();
    return res.data.map((d) => mapDoc<MealTemplateRecord>(d));
  }

  async findMealTemplateById(
    spaceId: string,
    templateId: string,
  ): Promise<MealTemplateRecord | null> {
    const res = await this.col(COLLECTIONS.mealTemplates)
      .where({ _id: templateId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<MealTemplateRecord>(res.data[0]) : null;
  }

  async createMealTemplate(template: MealTemplateRecord): Promise<void> {
    await this.col(COLLECTIONS.mealTemplates).doc(template.id).set({ data: template });
  }

  async updateMealTemplate(
    spaceId: string,
    templateId: string,
    patch: Partial<MealTemplateRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.mealTemplates)
      .where({ _id: templateId, spaceId })
      .update({ data: patch });
  }

  async deleteMealTemplate(spaceId: string, templateId: string): Promise<void> {
    await this.col(COLLECTIONS.mealTemplates)
      .where({ _id: templateId, spaceId })
      .remove();
  }

  async findMealPlanById(spaceId: string, planId: string): Promise<MealPlanRecord | null> {
    const res = await this.col(COLLECTIONS.mealPlans)
      .where({ _id: planId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<MealPlanRecord>(res.data[0]) : null;
  }

  async listMealPlansByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<MealPlanRecord[]> {
    const res = await this.col(COLLECTIONS.mealPlans)
      .where({ spaceId, date: _.gte(startDate).and(_.lte(endDate)) })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<MealPlanRecord>(d));
  }

  async listExpiredMealPlans(now: Date): Promise<MealPlanRecord[]> {
    const res = await this.col(COLLECTIONS.mealPlans)
      .where({ expireAt: _.lte(now) })
      .limit(1000)
      .get();
    return res.data.map((d) => mapDoc<MealPlanRecord>(d));
  }

  async createMealPlan(plan: MealPlanRecord): Promise<void> {
    await this.col(COLLECTIONS.mealPlans).doc(plan.id).set({ data: plan });
  }

  async updateMealPlan(spaceId: string, planId: string, patch: Partial<MealPlanRecord>): Promise<void> {
    await this.col(COLLECTIONS.mealPlans)
      .where({ _id: planId, spaceId })
      .update({ data: patch });
  }

  async deleteMealPlan(spaceId: string, planId: string): Promise<void> {
    await this.col(COLLECTIONS.mealPlans)
      .where({ _id: planId, spaceId })
      .remove();
  }

  async createTrash(item: TrashRecord): Promise<void> {
    await this.col(COLLECTIONS.trashRecords).doc(item.id).set({ data: item });
  }

  async restoreRecord(collection: string, record: Record<string, unknown>): Promise<void> {
    const id = record.id as string;
    await this.col(collection).doc(id).set({ data: record });
  }

  async listTrash(spaceId: string, collection?: string): Promise<TrashRecord[]> {
    const where: Record<string, unknown> = { spaceId, status: 'in_trash' };
    if (collection) where.collection = collection;
    const res = await this.col(COLLECTIONS.trashRecords)
      .where(where)
      .limit(200)
      .get();
    return res.data.map((d) => mapDoc<TrashRecord>(d));
  }

  async findTrashById(spaceId: string, trashId: string): Promise<TrashRecord | null> {
    const res = await this.col(COLLECTIONS.trashRecords)
      .where({ _id: trashId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<TrashRecord>(res.data[0]) : null;
  }

  async updateTrash(spaceId: string, trashId: string, patch: Partial<TrashRecord>): Promise<void> {
    await this.col(COLLECTIONS.trashRecords)
      .where({ _id: trashId, spaceId })
      .update({ data: patch });
  }

  async deleteTrash(spaceId: string, trashId: string): Promise<void> {
    await this.col(COLLECTIONS.trashRecords)
      .where({ _id: trashId, spaceId })
      .remove();
  }

  async listTrashDueForPurge(now: Date): Promise<TrashRecord[]> {
    const res = await this.col(COLLECTIONS.trashRecords)
      .where({ status: 'in_trash', purgeAt: _.lte(now) })
      .limit(1000)
      .get();
    return res.data.map((d) => mapDoc<TrashRecord>(d));
  }

  async listRestaurants(spaceId: string): Promise<RestaurantRecord[]> {
    const res = await this.col(COLLECTIONS.restaurants)
      .where({ spaceId })
      .limit(500)
      .get();
    return res.data.map((d) => mapDoc<RestaurantRecord>(d));
  }

  async findRestaurantById(spaceId: string, restaurantId: string): Promise<RestaurantRecord | null> {
    const res = await this.col(COLLECTIONS.restaurants)
      .where({ _id: restaurantId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<RestaurantRecord>(res.data[0]) : null;
  }

  async createRestaurant(restaurant: RestaurantRecord): Promise<void> {
    await this.col(COLLECTIONS.restaurants).doc(restaurant.id).set({ data: restaurant });
  }

  async updateRestaurant(
    spaceId: string,
    restaurantId: string,
    patch: Partial<RestaurantRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.restaurants)
      .where({ _id: restaurantId, spaceId })
      .update({ data: patch });
  }

  async deleteRestaurant(spaceId: string, restaurantId: string): Promise<void> {
    await this.col(COLLECTIONS.restaurants)
      .where({ _id: restaurantId, spaceId })
      .remove();
  }

  async findRestaurantVisitById(
    spaceId: string,
    visitId: string,
  ): Promise<RestaurantVisitRecord | null> {
    const res = await this.col(COLLECTIONS.restaurantVisits)
      .where({ _id: visitId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<RestaurantVisitRecord>(res.data[0]) : null;
  }

  async listRestaurantVisitsByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<RestaurantVisitRecord[]> {
    const res = await this.col(COLLECTIONS.restaurantVisits)
      .where({ spaceId, date: _.gte(startDate).and(_.lte(endDate)) })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<RestaurantVisitRecord>(d));
  }

  async listExpiredRestaurantVisits(now: Date): Promise<RestaurantVisitRecord[]> {
    const res = await this.col(COLLECTIONS.restaurantVisits)
      .where({ expireAt: _.lte(now) })
      .limit(1000)
      .get();
    return res.data.map((d) => mapDoc<RestaurantVisitRecord>(d));
  }

  async createRestaurantVisit(visit: RestaurantVisitRecord): Promise<void> {
    await this.col(COLLECTIONS.restaurantVisits).doc(visit.id).set({ data: visit });
  }

  async updateRestaurantVisit(
    spaceId: string,
    visitId: string,
    patch: Partial<RestaurantVisitRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.restaurantVisits)
      .where({ _id: visitId, spaceId })
      .update({ data: patch });
  }

  async deleteRestaurantVisit(spaceId: string, visitId: string): Promise<void> {
    await this.col(COLLECTIONS.restaurantVisits)
      .where({ _id: visitId, spaceId })
      .remove();
  }

  async listAnniversaries(spaceId: string): Promise<AnniversaryRecord[]> {
    const res = await this.col(COLLECTIONS.anniversaries)
      .where({ spaceId })
      .limit(200)
      .get();
    return res.data.map((d) => mapDoc<AnniversaryRecord>(d));
  }

  async findAnniversaryById(
    spaceId: string,
    anniversaryId: string,
  ): Promise<AnniversaryRecord | null> {
    const res = await this.col(COLLECTIONS.anniversaries)
      .where({ _id: anniversaryId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<AnniversaryRecord>(res.data[0]) : null;
  }

  async createAnniversary(record: AnniversaryRecord): Promise<void> {
    await this.col(COLLECTIONS.anniversaries).doc(record.id).set({ data: record });
  }

  async updateAnniversary(
    spaceId: string,
    anniversaryId: string,
    patch: Partial<AnniversaryRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.anniversaries)
      .where({ _id: anniversaryId, spaceId })
      .update({ data: patch });
  }

  async deleteAnniversary(spaceId: string, anniversaryId: string): Promise<void> {
    await this.col(COLLECTIONS.anniversaries)
      .where({ _id: anniversaryId, spaceId })
      .remove();
  }

  async listTrips(spaceId: string): Promise<TripRecord[]> {
    const res = await this.col(COLLECTIONS.trips)
      .where({ spaceId })
      .limit(200)
      .get();
    return res.data.map((d) => mapDoc<TripRecord>(d));
  }

  async findTripById(spaceId: string, tripId: string): Promise<TripRecord | null> {
    const res = await this.col(COLLECTIONS.trips)
      .where({ _id: tripId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<TripRecord>(res.data[0]) : null;
  }

  async createTrip(trip: TripRecord): Promise<void> {
    await this.col(COLLECTIONS.trips).doc(trip.id).set({ data: trip });
  }

  async updateTrip(spaceId: string, tripId: string, patch: Partial<TripRecord>): Promise<void> {
    await this.col(COLLECTIONS.trips)
      .where({ _id: tripId, spaceId })
      .update({ data: patch });
  }

  async deleteTrip(spaceId: string, tripId: string): Promise<void> {
    await this.col(COLLECTIONS.trips)
      .where({ _id: tripId, spaceId })
      .remove();
  }

  async findTripPlanById(spaceId: string, planId: string): Promise<TripPlanRecord | null> {
    const res = await this.col(COLLECTIONS.tripPlans)
      .where({ _id: planId, spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<TripPlanRecord>(res.data[0]) : null;
  }

  async listTripPlansByDateRange(
    spaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<TripPlanRecord[]> {
    const res = await this.col(COLLECTIONS.tripPlans)
      .where({ spaceId, startDate: _.gte(startDate).and(_.lte(endDate)) })
      .limit(100)
      .get();
    return res.data.map((d) => mapDoc<TripPlanRecord>(d));
  }

  async listExpiredTripPlans(now: Date): Promise<TripPlanRecord[]> {
    const res = await this.col(COLLECTIONS.tripPlans)
      .where({ expireAt: _.lte(now) })
      .limit(1000)
      .get();
    return res.data.map((d) => mapDoc<TripPlanRecord>(d));
  }

  async createTripPlan(plan: TripPlanRecord): Promise<void> {
    await this.col(COLLECTIONS.tripPlans).doc(plan.id).set({ data: plan });
  }

  async updateTripPlan(
    spaceId: string,
    planId: string,
    patch: Partial<TripPlanRecord>,
  ): Promise<void> {
    await this.col(COLLECTIONS.tripPlans)
      .where({ _id: planId, spaceId })
      .update({ data: patch });
  }

  async deleteTripPlan(spaceId: string, planId: string): Promise<void> {
    await this.col(COLLECTIONS.tripPlans)
      .where({ _id: planId, spaceId })
      .remove();
  }

  // ---- 架构加固（V1.0 优化）：事务 / 审计日志 / 频控 ----

  /** 真实云数据库事务：事务内仅支持单文档操作（doc.get/set/update/remove） */
  async inTransaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> {
    return db.runTransaction(async (transaction) => fn(new TxCloudRepo(transaction)));
  }

  async listAuditLogs(spaceId: string, limit: number): Promise<AuditLogRecord[]> {
    const res = await this.col(COLLECTIONS.auditLogs)
      .where({ spaceId })
      .orderBy('createdAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 100))
      .get();
    return res.data.map((d) => mapDoc<AuditLogRecord>(d));
  }

  async incRateHit(key: string): Promise<number> {
    if (!rateCollectionEnsured) {
      try {
        await db.createCollection(COLLECTIONS.rateLimits);
      } catch {
        // 集合已存在时忽略
      }
      rateCollectionEnsured = true;
    }
    const id = `rl_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    try {
      const res = await this.col(COLLECTIONS.rateLimits).doc(id).get();
      const cur = (res.data as { count?: number })?.count ?? 0;
      const next = cur + 1;
      await this.col(COLLECTIONS.rateLimits).doc(id).update({
        data: { count: next, updatedAt: new Date() },
      });
      return next;
    } catch {
      await this.col(COLLECTIONS.rateLimits).doc(id).set({
        data: { key, count: 1, createdAt: new Date(), updatedAt: new Date() },
      });
      return 1;
    }
  }
}

/**
 * 事务版数据访问层：只覆盖日历联动相关的单文档写操作。
 * 事务内不支持 where 批量写，因此这里全部改为 doc(id) 操作，
 * 并在写入前校验文档属于当前 spaceId（防止伪造 id 越权）。
 */
class TxCloudRepo extends CloudRepo {
  // 事务对象：wx-server-sdk 类型较复杂，这里按结构使用（runTransaction 回调传入）
  constructor(private readonly tx: any) {
    super();
  }

  private async getDoc(
    collection: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.tx.collection(collection).doc(id).get();
      return (res?.data as Record<string, unknown>) ?? null;
    } catch {
      return null;
    }
  }

  private async assertOwned(collection: string, id: string, spaceId: string): Promise<void> {
    const doc = await this.getDoc(collection, id);
    if (!doc) {
      throw new AppError(ErrorCodes.NOT_FOUND, '记录不存在或已删除');
    }
    const docSpaceId = (doc as { spaceId?: string }).spaceId;
    if (docSpaceId && docSpaceId !== spaceId) {
      throw new AppError(ErrorCodes.FORBIDDEN, '无权操作该记录');
    }
  }

  // ---- To Do ----
  override async createTodo(todo: TodoRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.todos).doc(todo.id).set({ data: todo });
  }
  override async updateTodo(spaceId: string, todoId: string, patch: Partial<TodoRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.todos, todoId, spaceId);
    await this.tx.collection(COLLECTIONS.todos).doc(todoId).update({ data: patch });
  }
  override async deleteTodo(spaceId: string, todoId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.todos, todoId, spaceId);
    await this.tx.collection(COLLECTIONS.todos).doc(todoId).remove();
  }

  // ---- 今日菜单临时记录 ----
  override async createMealPlan(plan: MealPlanRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.mealPlans).doc(plan.id).set({ data: plan });
  }
  override async updateMealPlan(spaceId: string, planId: string, patch: Partial<MealPlanRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.mealPlans, planId, spaceId);
    await this.tx.collection(COLLECTIONS.mealPlans).doc(planId).update({ data: patch });
  }
  override async deleteMealPlan(spaceId: string, planId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.mealPlans, planId, spaceId);
    await this.tx.collection(COLLECTIONS.mealPlans).doc(planId).remove();
  }

  // ---- 漂亮饭临时行程 ----
  override async createRestaurantVisit(visit: RestaurantVisitRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.restaurantVisits).doc(visit.id).set({ data: visit });
  }
  override async updateRestaurantVisit(spaceId: string, visitId: string, patch: Partial<RestaurantVisitRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.restaurantVisits, visitId, spaceId);
    await this.tx.collection(COLLECTIONS.restaurantVisits).doc(visitId).update({ data: patch });
  }
  override async deleteRestaurantVisit(spaceId: string, visitId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.restaurantVisits, visitId, spaceId);
    await this.tx.collection(COLLECTIONS.restaurantVisits).doc(visitId).remove();
  }

  // ---- 旅游临时行程 ----
  override async createTripPlan(plan: TripPlanRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.tripPlans).doc(plan.id).set({ data: plan });
  }
  override async updateTripPlan(spaceId: string, planId: string, patch: Partial<TripPlanRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.tripPlans, planId, spaceId);
    await this.tx.collection(COLLECTIONS.tripPlans).doc(planId).update({ data: patch });
  }
  override async deleteTripPlan(spaceId: string, planId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.tripPlans, planId, spaceId);
    await this.tx.collection(COLLECTIONS.tripPlans).doc(planId).remove();
  }

  // ---- 日历事件 ----
  override async createCalendarEvent(event: CalendarEventRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.calendarEvents).doc(event.id).set({ data: event });
  }
  override async updateCalendarEvent(spaceId: string, eventId: string, patch: Partial<CalendarEventRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.calendarEvents, eventId, spaceId);
    await this.tx.collection(COLLECTIONS.calendarEvents).doc(eventId).update({ data: patch });
  }
  override async deleteCalendarEvent(spaceId: string, eventId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.calendarEvents, eventId, spaceId);
    await this.tx.collection(COLLECTIONS.calendarEvents).doc(eventId).remove();
  }

  // ---- 回收站 ----
  override async createTrash(item: TrashRecord): Promise<void> {
    await this.tx.collection(COLLECTIONS.trashRecords).doc(item.id).set({ data: item });
  }
  override async updateTrash(spaceId: string, trashId: string, patch: Partial<TrashRecord>): Promise<void> {
    await this.assertOwned(COLLECTIONS.trashRecords, trashId, spaceId);
    await this.tx.collection(COLLECTIONS.trashRecords).doc(trashId).update({ data: patch });
  }
  override async deleteTrash(spaceId: string, trashId: string): Promise<void> {
    await this.assertOwned(COLLECTIONS.trashRecords, trashId, spaceId);
    await this.tx.collection(COLLECTIONS.trashRecords).doc(trashId).remove();
  }
  override async restoreRecord(collection: string, record: Record<string, unknown>): Promise<void> {
    await this.tx.collection(collection).doc(record.id as string).set({ data: record });
  }
}

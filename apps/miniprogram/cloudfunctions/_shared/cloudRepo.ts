import cloud from 'wx-server-sdk';
import { COLLECTIONS } from './constants';
import type {
  AuditLogRecord,
  CalendarEventRecord,
  HolidayRecord,
  MealPlanRecord,
  MealTemplateRecord,
  PeriodRecordRecord,
  Repo,
  SpaceMemberRecord,
  SpaceRecord,
  SpaceSettingRecord,
  TodoRecord,
  TrashRecord,
  UserIdentityRecord,
  UserRecord,
} from './repo';

// 云端部署时使用当前环境；本地脚本可通过 CLOUDBASE_ENV_ID 指定环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV || process.env.CLOUDBASE_ENV_ID });

const db = cloud.database();
const _ = db.command;

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
}

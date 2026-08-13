import cloud from 'wx-server-sdk';
import { COLLECTIONS } from './constants';
import type {
  AuditLogRecord,
  CalendarEventRecord,
  HolidayRecord,
  PeriodRecordRecord,
  Repo,
  SpaceMemberRecord,
  SpaceRecord,
  SpaceSettingRecord,
  TodoRecord,
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
}

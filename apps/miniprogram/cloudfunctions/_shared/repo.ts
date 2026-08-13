import type {
  CalendarSourceType,
  HolidayType,
  MealPlanStatus,
  MemberStatus,
  PeriodType,
  SpaceRole,
  SpaceStatus,
  TodoPriority,
  TodoStatus,
  TrashRetentionType,
  TrashStatus,
  UserStatus,
} from '../../../../packages/types/src';

export interface UserRecord {
  id: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  createdAt: Date;
}

export interface SpaceRecord {
  id: string;
  name: string;
  ownerUserId: string;
  status: SpaceStatus;
  memberCount: number;
  /** 一次性邀请码明文。仅云函数可读写（数据库安全规则已全部拒绝客户端）。绑定后置空。 */
  inviteCode: string | null;
  inviteCodeExpiresAt: Date | null;
  inviteCodeUsedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpaceMemberRecord {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  status: MemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
  id: string;
  spaceId: string | null;
  actorUserId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  detail?: string;
  createdAt: Date;
}

export interface TodoRecord {
  id: string;
  spaceId: string;
  title: string;
  date: string;
  time: string | null;
  note: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  businessType: string | null;
  businessId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CalendarEventRecord {
  id: string;
  spaceId: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  startTime: Date;
  endTime: Date | null;
  colorToken: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PeriodRecordRecord {
  id: string;
  spaceId: string;
  startDate: string;
  endDate: string;
  type: PeriodType;
  isEstimated: boolean;
  cycleLength: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HolidayRecord {
  id: string;
  year: number;
  date: string;
  name: string;
  type: HolidayType;
  isHoliday: boolean;
  isWorkday: boolean;
  isMakeupWorkday: boolean;
  source: string;
  version: number;
  updatedAt: Date;
}

export interface SpaceSettingRecord {
  id: string;
  spaceId: string;
  key: string;
  value: unknown;
  updatedBy: string;
  updatedAt: Date;
}

export interface MealTemplateRecord {
  id: string;
  spaceId: string;
  name: string;
  image: string | null;
  category: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface MealPlanRecord {
  id: string;
  spaceId: string;
  templateId: string | null;
  name: string;
  date: string;
  time: string | null;
  category: string | null;
  note: string | null;
  status: MealPlanStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  expireAt: Date;
}

export interface TrashRecord {
  id: string;
  spaceId: string;
  collection: string;
  recordId: string;
  snapshot: unknown;
  deletedAt: Date;
  deletedBy: string;
  deleteReason: string;
  purgeAt: Date;
  originalStatus: string | null;
  retentionType: TrashRetentionType;
  status: TrashStatus;
  restoredAt: Date | null;
  restoredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 数据访问层接口：云函数用 CloudRepo（真实数据库），测试用 MemoryRepo。
 * 业务逻辑（SpaceService）只依赖该接口，不直接操作数据库。
 */
export interface Repo {
  findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  createUserIdentity(identity: UserIdentityRecord): Promise<void>;
  findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null>;
  findSpaceById(spaceId: string): Promise<SpaceRecord | null>;
  findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null>;
  createSpace(space: SpaceRecord): Promise<void>;
  createMember(member: SpaceMemberRecord): Promise<void>;
  updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void>;
  listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]>;
  writeAudit(log: AuditLogRecord): Promise<void>;

  // ---- 第二阶段：To Do 与日历 ----
  findTodoById(spaceId: string, todoId: string): Promise<TodoRecord | null>;
  createTodo(todo: TodoRecord): Promise<void>;
  updateTodo(spaceId: string, todoId: string, patch: Partial<TodoRecord>): Promise<void>;
  listTodosByDateRange(spaceId: string, startDate: string, endDate: string): Promise<TodoRecord[]>;
  findCalendarEventBySource(
    spaceId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<CalendarEventRecord | null>;
  listCalendarEventsByRange(spaceId: string, start: Date, end: Date): Promise<CalendarEventRecord[]>;
  createCalendarEvent(event: CalendarEventRecord): Promise<void>;
  updateCalendarEvent(spaceId: string, eventId: string, patch: Partial<CalendarEventRecord>): Promise<void>;
  deleteCalendarEvent(spaceId: string, eventId: string): Promise<void>;

  // ---- 第三阶段：生理期与节假日 ----
  listPeriodRecords(spaceId: string): Promise<PeriodRecordRecord[]>;
  createPeriodRecord(record: PeriodRecordRecord): Promise<void>;
  deletePeriodRecord(spaceId: string, recordId: string): Promise<void>;
  listHolidaysByRange(startDate: string, endDate: string): Promise<HolidayRecord[]>;
  upsertHoliday(record: HolidayRecord): Promise<void>;
  findSpaceSetting(spaceId: string, key: string): Promise<SpaceSettingRecord | null>;
  upsertSpaceSetting(setting: SpaceSettingRecord): Promise<void>;

  // ---- 第四阶段：今日菜单与回收站 ----
  listMealTemplates(spaceId: string): Promise<MealTemplateRecord[]>;
  findMealTemplateById(spaceId: string, templateId: string): Promise<MealTemplateRecord | null>;
  createMealTemplate(template: MealTemplateRecord): Promise<void>;
  updateMealTemplate(spaceId: string, templateId: string, patch: Partial<MealTemplateRecord>): Promise<void>;
  deleteMealTemplate(spaceId: string, templateId: string): Promise<void>;
  findMealPlanById(spaceId: string, planId: string): Promise<MealPlanRecord | null>;
  listMealPlansByDateRange(spaceId: string, startDate: string, endDate: string): Promise<MealPlanRecord[]>;
  listExpiredMealPlans(now: Date): Promise<MealPlanRecord[]>;
  createMealPlan(plan: MealPlanRecord): Promise<void>;
  updateMealPlan(spaceId: string, planId: string, patch: Partial<MealPlanRecord>): Promise<void>;
  deleteMealPlan(spaceId: string, planId: string): Promise<void>;
  createTrash(item: TrashRecord): Promise<void>;
  restoreRecord(collection: string, record: Record<string, unknown>): Promise<void>;
  listTrash(spaceId: string, collection?: string): Promise<TrashRecord[]>;
  findTrashById(spaceId: string, trashId: string): Promise<TrashRecord | null>;
  updateTrash(spaceId: string, trashId: string, patch: Partial<TrashRecord>): Promise<void>;
  deleteTrash(spaceId: string, trashId: string): Promise<void>;
  listTrashDueForPurge(now: Date): Promise<TrashRecord[]>;
}

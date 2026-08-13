import type {
  CalendarSourceType,
  MemberStatus,
  SpaceRole,
  SpaceStatus,
  TodoPriority,
  TodoStatus,
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
}

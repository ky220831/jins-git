/**
 * 全局共享类型与常量（第一阶段：账号 / 双人空间 / 绑定）。
 * 小程序端通过 scripts/sync-shared.mjs 同步到 apps/miniprogram/miniprogram/lib/shared/types。
 */

// ---- 角色 ----
export const ROLE_OWNER = 'owner';
export const ROLE_MEMBER = 'member';
export type SpaceRole = typeof ROLE_OWNER | typeof ROLE_MEMBER;

// ---- 状态 ----
export const USER_STATUS_ACTIVE = 'active';
export const USER_STATUS_DISABLED = 'disabled';
export type UserStatus = typeof USER_STATUS_ACTIVE | typeof USER_STATUS_DISABLED;

export const SPACE_STATUS_ACTIVE = 'active';
export const SPACE_STATUS_DISABLED = 'disabled';
export type SpaceStatus = typeof SPACE_STATUS_ACTIVE | typeof SPACE_STATUS_DISABLED;

export const MEMBER_STATUS_ACTIVE = 'active';
export const MEMBER_STATUS_LEFT = 'left';
export type MemberStatus = typeof MEMBER_STATUS_ACTIVE | typeof MEMBER_STATUS_LEFT;

export const PROVIDER_WECHAT_MINIPROGRAM = 'wechat_miniprogram';

// ---- 统一 API 返回 ----
export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
}

export type ApiResponse<T> = ApiResult<T> | ApiFailure;

// ---- 用户 ----
export interface UserView {
  id: string;
  status: UserStatus;
}

// ---- 空间 ----
export interface SpaceMemberView {
  userId: string;
  role: SpaceRole;
  joinedAt: string;
}

export interface SpaceView {
  spaceId: string;
  spaceName: string;
  myRole: SpaceRole;
  members: SpaceMemberView[];
  /** 仅 OWNER 且邀请码未被使用时返回 */
  inviteCode?: string;
  inviteCodeExpiresAt?: string;
}

// ---- 云函数入参 / 出参 ----
export interface LoginResult {
  user: UserView;
  hasSpace: boolean;
  space?: SpaceView;
}

export interface CreateSpaceInput {
  name: string;
}

export interface CreateSpaceResult {
  space: SpaceView;
  inviteCode: string;
  inviteCodeExpiresAt: string;
}

export interface JoinSpaceInput {
  inviteCode: string;
}

export interface JoinSpaceResult {
  space: SpaceView;
}

export interface GetMySpaceResult {
  space: SpaceView;
}

// ---- To Do ----
export const TODO_STATUS_PENDING = 'pending';
export const TODO_STATUS_COMPLETED = 'completed';
export const TODO_STATUS_ARCHIVED = 'archived';
export type TodoStatus =
  | typeof TODO_STATUS_PENDING
  | typeof TODO_STATUS_COMPLETED
  | typeof TODO_STATUS_ARCHIVED;

export const PRIORITY_LOW = 'low';
export const PRIORITY_NORMAL = 'normal';
export const PRIORITY_HIGH = 'high';
export type TodoPriority = typeof PRIORITY_LOW | typeof PRIORITY_NORMAL | typeof PRIORITY_HIGH;

export const CALENDAR_SOURCE_TODO = 'todo';
export const CALENDAR_SOURCE_TYPES = [
  CALENDAR_SOURCE_TODO,
  'meal',
  'restaurant',
  'anniversary',
  'trip',
  'period',
  'custom',
] as const;
export type CalendarSourceType = (typeof CALENDAR_SOURCE_TYPES)[number];

export interface TodoView {
  id: string;
  title: string;
  /** YYYY-MM-DD（Asia/Shanghai 日期键） */
  date: string;
  /** HH:mm（可选） */
  time?: string;
  note?: string;
  priority: TodoPriority;
  status: TodoStatus;
  businessType?: string;
  businessId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CalendarEventView {
  id: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  startTime: string;
  endTime?: string;
  colorToken?: string;
}

export interface CreateTodoInput {
  title: string;
  date: string;
  time?: string;
  note?: string;
  priority?: TodoPriority;
}

export interface UpdateTodoInput {
  todoId: string;
  title?: string;
  date?: string;
  time?: string | null;
  note?: string | null;
  priority?: TodoPriority;
  status?: TodoStatus;
}

export interface CalendarMonthInput {
  year: number;
  month: number;
}

export interface CalendarMonthResult {
  year: number;
  month: number;
  todos: TodoView[];
  events: CalendarEventView[];
}

export interface RegisterBusinessEventInput {
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  startTime: string;
  endTime?: string;
  colorToken?: string;
}

export interface RemoveBusinessEventInput {
  sourceType: CalendarSourceType;
  sourceId: string;
}

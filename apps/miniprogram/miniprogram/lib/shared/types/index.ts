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
  periodDays: PeriodDayView[];
  holidays: HolidayDayView[];
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

// ---- 生理期 ----
export const PERIOD_TYPE_ACTUAL = 'actual';
export const PERIOD_TYPE_PREDICTED = 'predicted';
export type PeriodType = typeof PERIOD_TYPE_ACTUAL | typeof PERIOD_TYPE_PREDICTED;

export interface PeriodRecordView {
  id: string;
  startDate: string;
  endDate: string;
  type: PeriodType;
  isEstimated: boolean;
  cycleLength: number;
  createdAt: string;
}

export interface RecordPeriodInput {
  startDate: string;
  endDate: string;
}

export interface PeriodInfoResult {
  records: PeriodRecordView[];
  /** 今天是否处于生理期或休息日 */
  today?: { date: string; kind: 'period' | 'rest' };
  nextPredicted?: { startDate: string; endDate: string };
  /** “日历显示生理期”开关（默认开） */
  calendarVisible: boolean;
}

export interface PeriodDayView {
  date: string;
  kind: 'period' | 'rest';
  isEstimated: boolean;
}

export interface SetPeriodVisibilityInput {
  visible: boolean;
}

export interface DeletePeriodInput {
  recordId: string;
}

// ---- 今日菜单 ----
export const MEAL_PLAN_STATUS_PUBLISHED = 'published';
export const MEAL_PLAN_STATUS_OFFLINE = 'offline';
export type MealPlanStatus =
  | typeof MEAL_PLAN_STATUS_PUBLISHED
  | typeof MEAL_PLAN_STATUS_OFFLINE;

export interface MealTemplateView {
  id: string;
  name: string;
  image?: string;
  category?: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateMealTemplateInput {
  name: string;
  category?: string;
  image?: string;
}

export interface UpdateMealTemplateInput {
  templateId: string;
  name?: string;
  category?: string | null;
  image?: string | null;
  enabled?: boolean;
}

export interface DeleteMealTemplateInput {
  templateId: string;
}

export interface MealPlanView {
  id: string;
  templateId?: string;
  name: string;
  date: string;
  time?: string;
  category?: string;
  note?: string;
  status: MealPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateMealPlanInput {
  date: string;
  templateId?: string;
  name?: string;
  time?: string;
  category?: string;
  note?: string;
}

export interface UpdateMealPlanInput {
  planId: string;
  date?: string;
  time?: string | null;
  name?: string;
  category?: string | null;
  note?: string | null;
  status?: MealPlanStatus;
}

export interface OfflineMealPlanInput {
  planId: string;
}

export interface DeleteMealPlanInput {
  planId: string;
}

export interface MealRandomInput {
  /** 默认今天 */
  date?: string;
}

// ---- 回收站 ----
export const TRASH_STATUS_IN_TRASH = 'in_trash';
export const TRASH_STATUS_RESTORED = 'restored';
export const TRASH_STATUS_PURGED = 'purged';
export type TrashStatus =
  | typeof TRASH_STATUS_IN_TRASH
  | typeof TRASH_STATUS_RESTORED
  | typeof TRASH_STATUS_PURGED;

export const TRASH_RETENTION_TEMPORARY = 'temporary';
export const TRASH_RETENTION_PERMANENT = 'permanent';
export type TrashRetentionType =
  | typeof TRASH_RETENTION_TEMPORARY
  | typeof TRASH_RETENTION_PERMANENT;

export interface TrashItemView {
  id: string;
  collection: string;
  recordId: string;
  title: string;
  deletedAt: string;
  deletedBy: string;
  deleteReason: string;
  purgeAt: string;
  retentionType: TrashRetentionType;
  originalStatus?: string;
}

export interface TrashListInput {
  collection?: string;
}

export interface TrashActionInput {
  trashId: string;
}

// ---- 节假日 ----
export const HOLIDAY_TYPE_HOLIDAY = 'holiday';
export const HOLIDAY_TYPE_MAKEUP_WORKDAY = 'makeup_workday';
export const HOLIDAY_TYPE_NORMAL_WORKDAY = 'normal_workday';
export const HOLIDAY_TYPE_WEEKEND = 'weekend';
export type HolidayType =
  | typeof HOLIDAY_TYPE_HOLIDAY
  | typeof HOLIDAY_TYPE_MAKEUP_WORKDAY
  | typeof HOLIDAY_TYPE_NORMAL_WORKDAY
  | typeof HOLIDAY_TYPE_WEEKEND;

export interface HolidayDayView {
  date: string;
  name: string;
  type: HolidayType;
  isHoliday: boolean;
  isWorkday: boolean;
  isMakeupWorkday: boolean;
}

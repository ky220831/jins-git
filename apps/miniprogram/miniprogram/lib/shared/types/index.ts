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
  /** 云函数侧生成的请求追踪 ID（排障用） */
  requestId?: string;
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
  /** 成员自定义昵称（可选，默认显示角色名） */
  nickname?: string;
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

export interface SetNicknameInput {
  nickname: string;
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
  /** 乐观锁：编辑时传入列表里的版本号，服务端校验 */
  version: number;
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

/** 补录结束日期：先记开始日期，期间内再补结束日期（用户流程） */
export interface UpdatePeriodEndInput {
  recordId: string;
  endDate: string;
}

/** 修改生理期实际记录的开始/结束日期（改错日期时用，替换而非新增） */
export interface UpdatePeriodInput {
  recordId: string;
  startDate: string;
  endDate: string;
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
  version: number;
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
  version: number;
  date?: string;
  time?: string | null;
  name?: string;
  category?: string | null;
  note?: string | null;
  status?: MealPlanStatus;
}

export interface OfflineMealPlanInput {
  planId: string;
  version: number;
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

// ---- 漂亮饭（餐厅）----
export const RESTAURANT_SOURCE_MANUAL = 'manual';
export const RESTAURANT_SOURCE_POI = 'poi';
export const RESTAURANT_SOURCE_OCR = 'ocr';
export type RestaurantSource =
  | typeof RESTAURANT_SOURCE_MANUAL
  | typeof RESTAURANT_SOURCE_POI
  | typeof RESTAURANT_SOURCE_OCR;

export interface RestaurantView {
  id: string;
  name: string;
  address?: string;
  city?: string;
  district?: string;
  lat?: number | null;
  lng?: number | null;
  category?: string;
  pricePerPerson?: number | null;
  tags: string[];
  rating?: number | null;
  recommendedDishes: string[];
  coverImage?: string;
  images: string[];
  menuImages: string[];
  note?: string;
  visited: boolean;
  favorite: boolean;
  /** 上架/下架：双人可切换 */
  enabled: boolean;
  businessHours?: string;
  source: RestaurantSource;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateRestaurantInput {
  name: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  pricePerPerson?: number | null;
  tags?: string[] | null;
  rating?: number | null;
  recommendedDishes?: string[] | null;
  coverImage?: string | null;
  images?: string[] | null;
  menuImages?: string[] | null;
  note?: string | null;
  favorite?: boolean;
  visited?: boolean;
  businessHours?: string | null;
}

export interface UpdateRestaurantInput {
  restaurantId: string;
  version: number;
  name?: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  pricePerPerson?: number | null;
  tags?: string[] | null;
  rating?: number | null;
  recommendedDishes?: string[] | null;
  coverImage?: string | null;
  images?: string[] | null;
  menuImages?: string[] | null;
  note?: string | null;
  favorite?: boolean;
  visited?: boolean;
  enabled?: boolean;
  businessHours?: string | null;
}

export interface DeleteRestaurantInput {
  restaurantId: string;
}

export interface RestaurantVisitView {
  id: string;
  restaurantId: string;
  name: string;
  date: string;
  time?: string;
  note?: string;
  status: 'planned' | 'offline';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateRestaurantVisitInput {
  restaurantId: string;
  date: string;
  time?: string;
  note?: string;
}

export interface UpdateRestaurantVisitInput {
  visitId: string;
  version: number;
  date?: string;
  time?: string | null;
  note?: string | null;
  status?: 'planned' | 'offline';
}

export interface OfflineRestaurantVisitInput {
  visitId: string;
  version: number;
}

export interface DeleteRestaurantVisitInput {
  visitId: string;
}

export interface RestaurantSearchInput {
  keyword: string;
  /** 城市名，如“上海”；不填默认全国 */
  region?: string;
}

export interface RestaurantSearchItem {
  id: string;
  name: string;
  address?: string;
  city?: string;
  district?: string;
  lat?: number;
  lng?: number;
  category?: string;
  tel?: string;
}

export interface RestaurantSearchResult {
  items: RestaurantSearchItem[];
  provider: string;
}

export interface RestaurantOcrInput {
  fileID: string;
}

export interface RestaurantOcrDraft {
  name?: string;
  address?: string;
  city?: string;
  category?: string;
  pricePerPerson?: number;
  businessHours?: string;
  rawText: string;
}

export interface RestaurantImagesInput {
  fileIDs: string[];
}

export interface RestaurantImagesResult {
  urls: { fileID: string; tempFileURL: string }[];
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

// ---- 纪念日（PRD §51：永久保存、每年重复、仅主账号删除）----
export interface AnniversaryView {
  id: string;
  name: string;
  /** 原始日期 YYYY-MM-DD（保留年份，用于正计时） */
  date: string;
  time?: string;
  note?: string;
  /** 每年重复（默认 true） */
  yearly: boolean;
  /** 下一次发生日 YYYY-MM-DD（Asia/Shanghai） */
  nextOccurrence: string;
  /** 距下一次发生还有几天（0 表示今天，正数未来，负数已过期） */
  daysToNext: number;
  /** 自原始日期到今天的正计时天数 */
  elapsedDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateAnniversaryInput {
  name: string;
  date: string;
  time?: string | null;
  note?: string | null;
  yearly?: boolean;
}

export interface UpdateAnniversaryInput {
  anniversaryId: string;
  version: number;
  name?: string;
  date?: string;
  time?: string | null;
  note?: string | null;
  yearly?: boolean;
}

export interface DeleteAnniversaryInput {
  anniversaryId: string;
}

// ---- 旅游计划（PRD §52/§53：永久资料 + 14 天临时行程）----
export interface TripItemView {
  id: string;
  /** 可选日期 YYYY-MM-DD */
  date?: string;
  title: string;
  note?: string;
}

export interface TripView {
  id: string;
  name: string;
  country?: string;
  city?: string;
  /** 去过的日期（精简版旅行记录，可选） */
  visitedDate?: string;
  lat?: number | null;
  lng?: number | null;
  transport?: string;
  hotel?: string;
  note?: string;
  images: string[];
  itinerary: TripItemView[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TripItemInput {
  date?: string | null;
  title: string;
  note?: string | null;
}

export interface CreateTripInput {
  name: string;
  country?: string | null;
  city?: string | null;
  visitedDate?: string | null;
  lat?: number | null;
  lng?: number | null;
  transport?: string | null;
  hotel?: string | null;
  note?: string | null;
  images?: string[] | null;
  itinerary?: TripItemInput[] | null;
}

export interface UpdateTripInput {
  tripId: string;
  version: number;
  name?: string;
  country?: string | null;
  city?: string | null;
  visitedDate?: string | null;
  lat?: number | null;
  lng?: number | null;
  transport?: string | null;
  hotel?: string | null;
  note?: string | null;
  images?: string[] | null;
  itinerary?: TripItemInput[] | null;
}

export interface DeleteTripInput {
  tripId: string;
}

export const TRIP_PLAN_STATUS_PLANNED = 'planned';
export const TRIP_PLAN_STATUS_OFFLINE = 'offline';
export type TripPlanStatus =
  | typeof TRIP_PLAN_STATUS_PLANNED
  | typeof TRIP_PLAN_STATUS_OFFLINE;

export interface TripPlanView {
  id: string;
  tripId?: string;
  name: string;
  startDate: string;
  endDate?: string;
  time?: string;
  note?: string;
  status: TripPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateTripPlanInput {
  tripId?: string;
  name?: string | null;
  startDate: string;
  endDate?: string | null;
  time?: string | null;
  note?: string | null;
}

export interface UpdateTripPlanInput {
  planId: string;
  version: number;
  tripId?: string;
  name?: string;
  startDate?: string;
  endDate?: string | null;
  time?: string | null;
  note?: string | null;
  status?: TripPlanStatus;
}

export interface DeleteTripPlanInput {
  planId: string;
}

export interface OfflineTripPlanInput {
  planId: string;
  version: number;
}

// ---- 管理（第七阶段：主管理 / 副管理）----
export interface ManageOverview {
  role: SpaceRole;
  counts: {
    mealTemplates: number;
    mealPlans: number;
    restaurants: number;
    restaurantVisits: number;
    anniversaries: number;
    trips: number;
    tripPlans: number;
    todos: number;
    trash: number;
  };
}

export interface AuditLogView {
  id: string;
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result: string;
  detail?: string;
  createdAt: string;
}

export interface ManageAuditResult {
  logs: AuditLogView[];
}

export interface ExportDataResult {
  fileName: string;
  tempFileURL: string;
  sizeBytes: number;
}

export interface TrashBatchInput {
  trashIds: string[];
}

// ---- 订阅消息提醒（1.1.0）----
export const REMINDER_TOPICS = ['anniversary', 'meal', 'visit'] as const;
export type ReminderTopic = (typeof REMINDER_TOPICS)[number];

export interface ReminderTopicConfig {
  topic: ReminderTopic;
  configured: boolean;
  templateId: string;
}

export interface ReminderConfigResult {
  topics: ReminderTopicConfig[];
}

export interface GrantReminderInput {
  topic: ReminderTopic;
}

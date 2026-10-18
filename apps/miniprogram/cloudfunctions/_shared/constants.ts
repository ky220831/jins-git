export const COLLECTIONS = {
  users: 'users',
  userIdentities: 'user_identities',
  spaces: 'spaces',
  spaceMembers: 'space_members',
  auditLogs: 'audit_logs',
  todos: 'todos',
  calendarEvents: 'calendar_events',
  periodRecords: 'period_records',
  holidays: 'holiday_calendar',
  spaceSettings: 'space_settings',
  mealTemplates: 'meal_templates',
  mealPlans: 'meal_plans',
  trashRecords: 'trash_records',
  restaurants: 'restaurants',
  restaurantVisits: 'restaurant_visits',
  anniversaries: 'anniversaries',
  trips: 'trips',
  tripPlans: 'trip_plans',
  rateLimits: 'rate_limits',
  subscribeGrants: 'subscribe_grants',
} as const;

/** 频控：每用户每分钟最大调用次数（仅对“烧钱”的外部资源接口启用） */
export const RATE_LIMIT_PER_MINUTE = {
  restaurantSearch: 20,
  restaurantOcr: 10,
  exportData: 5,
} as const;

/**
 * 订阅消息模板（1.1.0）：templateId 需在 小程序后台 → 订阅消息 选用模板后填入，
 * 为空时提醒功能自动禁用（客户端不显示开启按钮）。字段名需匹配所选模板。
 */
/** 已选用模板（2026-08-15 在后台选用）：纪念日提醒 + 日程提醒（菜单/行程共用） */
export const REMINDER_TEMPLATES = {
  anniversary: {
    templateId: '1ng1-0er5XGCXPwvoBOllnRJmQxDqN1mk-Sy4gSWWJk',
    page: 'pages/anniversary/index',
  },
  meal: {
    templateId: 'N5jv5qGBh-rBB3qeKvC1Tr7Q2KBD9p0lMlb81Z5W1TY',
    page: 'pages/meal/index',
  },
  visit: {
    templateId: 'N5jv5qGBh-rBB3qeKvC1Tr7Q2KBD9p0lMlb81Z5W1TY',
    page: 'pages/restaurant/index',
  },
} as const;

export type ReminderTopic = keyof typeof REMINDER_TEMPLATES;

/** 邀请码有效期：7 天（可调整） */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SPACE_NAME_MIN_LENGTH = 1;
export const SPACE_NAME_MAX_LENGTH = 20;
export const INVITE_CODE_LENGTH = 8;
export const TODO_TITLE_MAX_LENGTH = 100;
export const MEAL_NAME_MAX_LENGTH = 50;
export const MEAL_NOTE_MAX_LENGTH = 200;
export const RESTAURANT_NAME_MAX_LENGTH = 60;
export const RESTAURANT_NOTE_MAX_LENGTH = 500;
export const RESTAURANT_TAGS_MAX = 10;
export const RESTAURANT_DISHES_MAX = 20;
/** 今天吃什么（菜单）临时记录：创建后 14 天进入回收站（PRD §38/§79） */
export const MEAL_PLAN_TTL_DAYS = 14;
/** 下馆子（餐厅）临时行程：创建后 14 天进入回收站（PRD §42/§79） */
export const RESTAURANT_VISIT_TTL_DAYS = 14;
/** 旅游临时行程：创建后 14 天进入回收站（PRD §53/§79） */
export const TRIP_PLAN_TTL_DAYS = 14;
export const ANNIVERSARY_NAME_MAX_LENGTH = 50;
export const ANNIVERSARY_NOTE_MAX_LENGTH = 200;
export const TRIP_NAME_MAX_LENGTH = 60;
export const TRIP_NOTE_MAX_LENGTH = 500;
export const TRIP_ITEMS_MAX = 30;
export const TRIP_IMAGES_MAX = 20;
/** 回收站保留 72 小时后永久删除（PRD §56） */
export const TRASH_RETENTION_HOURS = 72;
/** 定时任务等系统操作使用的虚拟身份 */
export const SYSTEM_ACTOR = 'system';
/** 生理期默认周期（天）：下一次预计开始日 = 最近一次实际开始日 + 28 天（2026-08-14 用户口径） */
export const DEFAULT_CYCLE_LENGTH = 28;
export const PERIOD_ACTUAL_MAX = 2;
export const PERIOD_PREDICTED_MAX = 1;
/** 生理期结束后标记为“休息”的天数（蓝色） */
export const PERIOD_REST_DAYS = 1;
/** 预留：预测不再用时间段表示，仅标记预计开始日单日 */
export const DEFAULT_PREDICTED_DURATION = 7;

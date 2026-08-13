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
} as const;

/** 邀请码有效期：7 天（可调整） */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SPACE_NAME_MIN_LENGTH = 1;
export const SPACE_NAME_MAX_LENGTH = 20;
export const INVITE_CODE_LENGTH = 8;
export const TODO_TITLE_MAX_LENGTH = 100;
export const MEAL_NAME_MAX_LENGTH = 50;
export const MEAL_NOTE_MAX_LENGTH = 200;
/** 今日菜单临时记录：创建后 14 天进入回收站（PRD §38/§79） */
export const MEAL_PLAN_TTL_DAYS = 14;
/** 回收站保留 72 小时后永久删除（PRD §56） */
export const TRASH_RETENTION_HOURS = 72;
/** 定时任务等系统操作使用的虚拟身份 */
export const SYSTEM_ACTOR = 'system';
/** 生理期默认周期（天），可调整（PRD §27） */
export const DEFAULT_CYCLE_LENGTH = 22;
export const PERIOD_ACTUAL_MAX = 2;
export const PERIOD_PREDICTED_MAX = 1;
/** 生理期结束后标记为“休息”的天数（蓝色） */
export const PERIOD_REST_DAYS = 1;
/** 预计生理期持续天数（PRD 预留可调；用户要求：按结束节点 +22 天为预计开始，再算 7 天） */
export const DEFAULT_PREDICTED_DURATION = 7;

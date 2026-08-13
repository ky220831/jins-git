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
} as const;

/** 邀请码有效期：7 天（可调整） */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SPACE_NAME_MIN_LENGTH = 1;
export const SPACE_NAME_MAX_LENGTH = 20;
export const INVITE_CODE_LENGTH = 8;
export const TODO_TITLE_MAX_LENGTH = 100;
/** 生理期默认周期（天），可调整（PRD §27） */
export const DEFAULT_CYCLE_LENGTH = 22;
export const PERIOD_ACTUAL_MAX = 2;
export const PERIOD_PREDICTED_MAX = 1;
/** 生理期结束后标记为“休息”的天数（蓝色） */
export const PERIOD_REST_DAYS = 1;

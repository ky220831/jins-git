export const COLLECTIONS = {
  users: 'users',
  userIdentities: 'user_identities',
  spaces: 'spaces',
  spaceMembers: 'space_members',
  auditLogs: 'audit_logs',
} as const;

/** 邀请码有效期：7 天（可调整） */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SPACE_NAME_MIN_LENGTH = 1;
export const SPACE_NAME_MAX_LENGTH = 20;
export const INVITE_CODE_LENGTH = 8;

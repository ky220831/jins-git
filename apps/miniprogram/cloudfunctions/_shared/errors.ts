export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION: 'VALIDATION',
  NOT_IN_SPACE: 'NOT_IN_SPACE',
  ALREADY_IN_SPACE: 'ALREADY_IN_SPACE',
  SPACE_FULL: 'SPACE_FULL',
  SPACE_NOT_FOUND: 'SPACE_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_USED: 'INVITE_USED',
  THIRD_PARTY_ERROR: 'THIRD_PARTY_ERROR',
  LBS_NOT_CONFIGURED: 'LBS_NOT_CONFIGURED',
  /** 乐观锁冲突：记录刚被另一人修改 */
  CONFLICT: 'CONFLICT',
  /** 触发频控限制 */
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

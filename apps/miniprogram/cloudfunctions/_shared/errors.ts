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
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_USED: 'INVITE_USED',
  INTERNAL: 'INTERNAL',
} as const;

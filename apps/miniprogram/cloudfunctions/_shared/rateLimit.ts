import { RATE_LIMIT_PER_MINUTE } from './constants';
import { AppError, ErrorCodes } from './errors';
import type { Repo } from './repo';

export type RateLimitKey = keyof typeof RATE_LIMIT_PER_MINUTE;

/** 按“用户 + 动作 + 分钟桶”计数，超限抛 RATE_LIMITED（仅保护烧钱的外部接口） */
export async function enforceRateLimit(
  repo: Repo,
  userId: string,
  key: RateLimitKey,
): Promise<void> {
  const now = new Date();
  const minute =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(now.getUTCDate()).padStart(2, '0')}` +
    `${String(now.getUTCHours()).padStart(2, '0')}` +
    `${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const count = await repo.incRateHit(`${userId}:${key}:${minute}`);
  if (count > RATE_LIMIT_PER_MINUTE[key]) {
    throw new AppError(ErrorCodes.RATE_LIMITED, '操作太频繁，请稍后再试');
  }
}

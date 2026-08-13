import { PROVIDER_WECHAT_MINIPROGRAM, USER_STATUS_ACTIVE } from '../../../../packages/types/src';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import type { Repo, UserIdentityRecord, UserRecord } from './repo';

export interface Identity {
  userId: string;
  isNew: boolean;
}

/**
 * 身份解析链：OPENID → UserIdentity → User。
 * OPENID 来自微信云函数上下文（getWXContext），不信任任何客户端传入的身份字段。
 */
export async function resolveIdentity(repo: Repo, providerUserId: string): Promise<Identity> {
  if (!providerUserId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, '无法获取微信身份，请重新进入小程序');
  }

  const existing = await repo.findUserIdentity(PROVIDER_WECHAT_MINIPROGRAM, providerUserId);
  if (existing) {
    return { userId: existing.userId, isNew: false };
  }

  const now = new Date();
  const user: UserRecord = {
    id: newId('u'),
    status: USER_STATUS_ACTIVE,
    createdAt: now,
    updatedAt: now,
  };
  const identity: UserIdentityRecord = {
    id: newId('ui'),
    userId: user.id,
    provider: PROVIDER_WECHAT_MINIPROGRAM,
    providerUserId,
    createdAt: now,
  };

  await repo.createUser(user);
  await repo.createUserIdentity(identity);
  return { userId: user.id, isNew: true };
}

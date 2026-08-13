import type { SpaceRole } from '../../../../packages/types/src';
import { AppError, ErrorCodes } from './errors';
import { resolveIdentity } from './identity';
import type { Repo } from './repo';

export interface MemberContext {
  userId: string;
  spaceId: string;
  role: SpaceRole;
}

/** 身份 → 成员 → 真实 Space，任何业务都从这里拿 spaceId，不信任客户端 */
export async function requireSpaceMember(repo: Repo, providerUserId: string): Promise<MemberContext> {
  const identity = await resolveIdentity(repo, providerUserId);
  const membership = await repo.findActiveMembershipByUser(identity.userId);
  if (!membership) {
    throw new AppError(ErrorCodes.NOT_IN_SPACE, '你还没有加入任何空间');
  }
  return { userId: identity.userId, spaceId: membership.spaceId, role: membership.role };
}

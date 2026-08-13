import type {
  MemberStatus,
  SpaceRole,
  SpaceStatus,
  UserStatus,
} from '../../../../packages/types/src';

export interface UserRecord {
  id: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  createdAt: Date;
}

export interface SpaceRecord {
  id: string;
  name: string;
  ownerUserId: string;
  status: SpaceStatus;
  memberCount: number;
  /** 一次性邀请码明文。仅云函数可读写（数据库安全规则已全部拒绝客户端）。绑定后置空。 */
  inviteCode: string | null;
  inviteCodeExpiresAt: Date | null;
  inviteCodeUsedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpaceMemberRecord {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  status: MemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
  id: string;
  spaceId: string | null;
  actorUserId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  detail?: string;
  createdAt: Date;
}

/**
 * 数据访问层接口：云函数用 CloudRepo（真实数据库），测试用 MemoryRepo。
 * 业务逻辑（SpaceService）只依赖该接口，不直接操作数据库。
 */
export interface Repo {
  findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  createUserIdentity(identity: UserIdentityRecord): Promise<void>;
  findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null>;
  findSpaceById(spaceId: string): Promise<SpaceRecord | null>;
  findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null>;
  createSpace(space: SpaceRecord): Promise<void>;
  createMember(member: SpaceMemberRecord): Promise<void>;
  updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void>;
  listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]>;
  writeAudit(log: AuditLogRecord): Promise<void>;
}

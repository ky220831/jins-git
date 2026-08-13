import { MEMBER_STATUS_ACTIVE, SPACE_STATUS_ACTIVE } from '../packages/types/src';
import type {
  AuditLogRecord,
  Repo,
  SpaceMemberRecord,
  SpaceRecord,
  UserIdentityRecord,
  UserRecord,
} from '../apps/miniprogram/cloudfunctions/_shared/repo';

/**
 * 内存版数据仓储：与 CloudRepo 实现同一个 Repo 接口，
 * 用于在不连接云数据库的情况下运行跨 Space 安全测试。
 */
export class MemoryRepo implements Repo {
  users = new Map<string, UserRecord>();
  userIdentities = new Map<string, UserIdentityRecord>();
  spaces = new Map<string, SpaceRecord>();
  spaceMembers = new Map<string, SpaceMemberRecord>();
  audits: AuditLogRecord[] = [];

  async findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null> {
    for (const item of this.userIdentities.values()) {
      if (item.provider === provider && item.providerUserId === providerUserId) {
        return { ...item };
      }
    }
    return null;
  }

  async createUser(user: UserRecord): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async createUserIdentity(identity: UserIdentityRecord): Promise<void> {
    this.userIdentities.set(identity.id, { ...identity });
  }

  async findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null> {
    for (const member of this.spaceMembers.values()) {
      if (member.userId === userId && member.status === MEMBER_STATUS_ACTIVE) {
        return { ...member };
      }
    }
    return null;
  }

  async findSpaceById(spaceId: string): Promise<SpaceRecord | null> {
    const space = this.spaces.get(spaceId);
    return space ? { ...space } : null;
  }

  async findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null> {
    for (const space of this.spaces.values()) {
      if (space.inviteCode === inviteCode && space.status === SPACE_STATUS_ACTIVE) {
        return { ...space };
      }
    }
    return null;
  }

  async createSpace(space: SpaceRecord): Promise<void> {
    this.spaces.set(space.id, { ...space });
  }

  async createMember(member: SpaceMemberRecord): Promise<void> {
    this.spaceMembers.set(member.id, { ...member });
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void> {
    const current = this.spaces.get(spaceId);
    if (!current) {
      throw new Error(`space not found: ${spaceId}`);
    }
    this.spaces.set(spaceId, { ...current, ...patch });
  }

  async listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]> {
    return [...this.spaceMembers.values()]
      .filter((member) => member.spaceId === spaceId && member.status === MEMBER_STATUS_ACTIVE)
      .map((member) => ({ ...member }));
  }

  async writeAudit(log: AuditLogRecord): Promise<void> {
    this.audits.push({ ...log });
  }
}

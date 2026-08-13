import cloud from 'wx-server-sdk';
import { COLLECTIONS } from './constants';
import type {
  AuditLogRecord,
  Repo,
  SpaceMemberRecord,
  SpaceRecord,
  UserIdentityRecord,
  UserRecord,
} from './repo';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function mapDoc<T>(doc: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { ...rest, id: (_id as string) ?? ((rest as { id?: string }).id ?? '') } as T;
}

export class CloudRepo implements Repo {
  private col(name: string) {
    return db.collection(name);
  }

  async findUserIdentity(provider: string, providerUserId: string): Promise<UserIdentityRecord | null> {
    const res = await this.col(COLLECTIONS.userIdentities)
      .where({ provider, providerUserId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<UserIdentityRecord>(res.data[0]) : null;
  }

  async createUser(user: UserRecord): Promise<void> {
    await this.col(COLLECTIONS.users).doc(user.id).set({ data: user });
  }

  async createUserIdentity(identity: UserIdentityRecord): Promise<void> {
    await this.col(COLLECTIONS.userIdentities).doc(identity.id).set({ data: identity });
  }

  async findActiveMembershipByUser(userId: string): Promise<SpaceMemberRecord | null> {
    const res = await this.col(COLLECTIONS.spaceMembers)
      .where({ userId, status: 'active' })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceMemberRecord>(res.data[0]) : null;
  }

  async findSpaceById(spaceId: string): Promise<SpaceRecord | null> {
    const res = await this.col(COLLECTIONS.spaces)
      .where({ _id: spaceId })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceRecord>(res.data[0]) : null;
  }

  async findSpaceByInviteCode(inviteCode: string): Promise<SpaceRecord | null> {
    const res = await this.col(COLLECTIONS.spaces)
      .where({ inviteCode, status: 'active' })
      .limit(1)
      .get();
    return res.data.length > 0 ? mapDoc<SpaceRecord>(res.data[0]) : null;
  }

  async createSpace(space: SpaceRecord): Promise<void> {
    await this.col(COLLECTIONS.spaces).doc(space.id).set({ data: space });
  }

  async createMember(member: SpaceMemberRecord): Promise<void> {
    await this.col(COLLECTIONS.spaceMembers).doc(member.id).set({ data: member });
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceRecord>): Promise<void> {
    await this.col(COLLECTIONS.spaces).doc(spaceId).update({ data: patch });
  }

  async listActiveMembers(spaceId: string): Promise<SpaceMemberRecord[]> {
    const res = await this.col(COLLECTIONS.spaceMembers)
      .where({ spaceId, status: 'active' })
      .get();
    return res.data.map((d) => mapDoc<SpaceMemberRecord>(d));
  }

  async writeAudit(log: AuditLogRecord): Promise<void> {
    await this.col(COLLECTIONS.auditLogs).add({ data: log });
  }
}

import {
  MEMBER_STATUS_ACTIVE,
  ROLE_MEMBER,
  ROLE_OWNER,
  SPACE_STATUS_ACTIVE,
  USER_STATUS_ACTIVE,
  type CreateSpaceInput,
  type CreateSpaceResult,
  type GetMySpaceResult,
  type JoinSpaceInput,
  type JoinSpaceResult,
  type LoginResult,
  type SpaceMemberView,
  type SpaceView,
} from '../../../../packages/types/src';
import {
  INVITE_CODE_TTL_MS,
  SPACE_NAME_MAX_LENGTH,
  SPACE_NAME_MIN_LENGTH,
} from './constants';
import { AppError, ErrorCodes } from './errors';
import { generateInviteCode, newId } from './ids';
import { resolveIdentity } from './identity';
import type { AuditLogRecord, Repo, SpaceMemberRecord, SpaceRecord } from './repo';

function toMemberView(member: SpaceMemberRecord): SpaceMemberView {
  return {
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}

export class SpaceService {
  constructor(private readonly repo: Repo) {}

  /** 登录：建立/复用 User 与 UserIdentity，并返回空间状态 */
  async login(providerUserId: string): Promise<LoginResult> {
    const identity = await resolveIdentity(this.repo, providerUserId);
    const membership = await this.repo.findActiveMembershipByUser(identity.userId);
    if (!membership) {
      return { user: { id: identity.userId, status: USER_STATUS_ACTIVE }, hasSpace: false };
    }
    const space = await this.getSpaceView(identity.userId, membership.spaceId);
    return { user: { id: identity.userId, status: USER_STATUS_ACTIVE }, hasSpace: true, space };
  }

  /** 创建双人空间：创建者成为 OWNER，生成一次性邀请码 */
  async createSpace(providerUserId: string, input: CreateSpaceInput): Promise<CreateSpaceResult> {
    const identity = await resolveIdentity(this.repo, providerUserId);
    const name = (input?.name ?? '').trim();
    if (name.length < SPACE_NAME_MIN_LENGTH || name.length > SPACE_NAME_MAX_LENGTH) {
      throw new AppError(
        ErrorCodes.VALIDATION,
        `空间名称需为 ${SPACE_NAME_MIN_LENGTH}~${SPACE_NAME_MAX_LENGTH} 个字符`,
      );
    }

    const existing = await this.repo.findActiveMembershipByUser(identity.userId);
    if (existing) {
      throw new AppError(ErrorCodes.ALREADY_IN_SPACE, '你已经属于一个空间，不能重复创建');
    }

    const now = new Date();
    const inviteCode = await this.uniqueInviteCode();
    const inviteCodeExpiresAt = new Date(now.getTime() + INVITE_CODE_TTL_MS);
    const space: SpaceRecord = {
      id: newId('sp'),
      name,
      ownerUserId: identity.userId,
      status: SPACE_STATUS_ACTIVE,
      memberCount: 1,
      inviteCode,
      inviteCodeExpiresAt,
      inviteCodeUsedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.createSpace(space);
    await this.repo.createMember({
      id: newId('sm'),
      spaceId: space.id,
      userId: identity.userId,
      role: ROLE_OWNER,
      status: MEMBER_STATUS_ACTIVE,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.writeAudit(identity.userId, space.id, 'space.create', 'space', space.id);

    const view = await this.getSpaceView(identity.userId, space.id);
    return {
      space: view,
      inviteCode,
      inviteCodeExpiresAt: inviteCodeExpiresAt.toISOString(),
    };
  }

  /** 邀请码绑定：验证邀请码/有效期/是否已满/是否已在其他空间，成功后加入为 MEMBER */
  async joinSpace(providerUserId: string, input: JoinSpaceInput): Promise<JoinSpaceResult> {
    const identity = await resolveIdentity(this.repo, providerUserId);
    const code = (input?.inviteCode ?? '').trim().toUpperCase();
    if (!code) {
      throw new AppError(ErrorCodes.VALIDATION, '请输入邀请码');
    }

    const existing = await this.repo.findActiveMembershipByUser(identity.userId);
    if (existing) {
      throw new AppError(ErrorCodes.ALREADY_IN_SPACE, '你已经属于一个空间，不能重复加入');
    }

    const space = await this.repo.findSpaceByInviteCode(code);
    if (!space) {
      throw new AppError(ErrorCodes.INVITE_INVALID, '邀请码无效，请检查后重试');
    }
    if (space.inviteCodeUsedAt) {
      throw new AppError(ErrorCodes.INVITE_USED, '邀请码已被使用');
    }
    if (!space.inviteCodeExpiresAt || space.inviteCodeExpiresAt.getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.INVITE_EXPIRED, '邀请码已过期，请联系空间主人重新生成');
    }
    if (space.memberCount >= 2) {
      throw new AppError(ErrorCodes.SPACE_FULL, '该空间已有两位成员，无法加入');
    }

    const now = new Date();
    await this.repo.createMember({
      id: newId('sm'),
      spaceId: space.id,
      userId: identity.userId,
      role: ROLE_MEMBER,
      status: MEMBER_STATUS_ACTIVE,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.repo.updateSpace(space.id, {
      memberCount: 2,
      inviteCode: null,
      inviteCodeUsedAt: now,
      version: space.version + 1,
      updatedAt: now,
    });
    await this.writeAudit(identity.userId, space.id, 'space.join', 'space', space.id);

    const view = await this.getSpaceView(identity.userId, space.id);
    return { space: view };
  }

  /** 查询“我”的空间：只允许返回当前用户所属空间，不接受客户端传 spaceId */
  async getMySpace(providerUserId: string): Promise<GetMySpaceResult> {
    const identity = await resolveIdentity(this.repo, providerUserId);
    const membership = await this.repo.findActiveMembershipByUser(identity.userId);
    if (!membership) {
      throw new AppError(ErrorCodes.NOT_IN_SPACE, '你还没有加入任何空间');
    }
    const space = await this.getSpaceView(identity.userId, membership.spaceId);
    return { space };
  }

  /** 重新生成一次性邀请码：仅主账号，副账号未加入时可用（PRD §13 家庭管理） */
  async regenerateInviteCode(providerUserId: string): Promise<CreateSpaceResult> {
    const identity = await resolveIdentity(this.repo, providerUserId);
    const membership = await this.repo.findActiveMembershipByUser(identity.userId);
    if (!membership) {
      throw new AppError(ErrorCodes.NOT_IN_SPACE, '你还没有加入任何空间');
    }
    if (membership.role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以重新生成邀请码');
    }
    const space = await this.repo.findSpaceById(membership.spaceId);
    if (!space || space.status !== SPACE_STATUS_ACTIVE) {
      throw new AppError(ErrorCodes.SPACE_NOT_FOUND, '空间不存在或已停用');
    }
    if (space.inviteCodeUsedAt || space.memberCount >= 2) {
      throw new AppError(ErrorCodes.INTERNAL, '副账号已加入，无需邀请码');
    }
    const now = new Date();
    const inviteCode = await this.uniqueInviteCode();
    const inviteCodeExpiresAt = new Date(now.getTime() + INVITE_CODE_TTL_MS);
    await this.repo.updateSpace(space.id, {
      inviteCode,
      inviteCodeExpiresAt,
      version: space.version + 1,
      updatedAt: now,
    });
    await this.writeAudit(identity.userId, space.id, 'space.invite_regen', 'space', space.id);
    const view = await this.getSpaceView(identity.userId, space.id);
    return {
      space: view,
      inviteCode,
      inviteCodeExpiresAt: inviteCodeExpiresAt.toISOString(),
    };
  }

  private async uniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = generateInviteCode();
      const hit = await this.repo.findSpaceByInviteCode(code);
      if (!hit) {
        return code;
      }
    }
    throw new AppError(ErrorCodes.INTERNAL, '邀请码生成失败，请重试');
  }

  private async writeAudit(
    actorUserId: string,
    spaceId: string,
    action: string,
    targetType: string,
    targetId: string,
  ): Promise<void> {
    const log: AuditLogRecord = {
      id: newId('al'),
      spaceId,
      actorUserId,
      action,
      targetType,
      targetId,
      result: 'success',
      createdAt: new Date(),
    };
    await this.repo.writeAudit(log);
  }

  private async getSpaceView(userId: string, spaceId: string): Promise<SpaceView> {
    const space = await this.repo.findSpaceById(spaceId);
    if (!space || space.status !== SPACE_STATUS_ACTIVE) {
      throw new AppError(ErrorCodes.SPACE_NOT_FOUND, '空间不存在或已停用');
    }

    const members = await this.repo.listActiveMembers(spaceId);
    const me = members.find((m) => m.userId === userId);
    if (!me) {
      throw new AppError(ErrorCodes.NOT_IN_SPACE, '你不在该空间中');
    }

    const inviteVisible =
      me.role === ROLE_OWNER &&
      space.inviteCode !== null &&
      space.inviteCodeUsedAt === null &&
      space.inviteCodeExpiresAt !== null &&
      space.inviteCodeExpiresAt.getTime() > Date.now();

    const view: SpaceView = {
      spaceId: space.id,
      spaceName: space.name,
      myRole: me.role,
      members: members.map(toMemberView),
    };
    if (inviteVisible && space.inviteCode !== null && space.inviteCodeExpiresAt !== null) {
      view.inviteCode = space.inviteCode;
      view.inviteCodeExpiresAt = space.inviteCodeExpiresAt.toISOString();
    }
    return view;
  }
}

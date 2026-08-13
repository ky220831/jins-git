import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { MemoryRepo } from './memoryRepo';

async function fresh() {
  const repo = new MemoryRepo();
  const service = new SpaceService(repo);
  return { repo, service };
}

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof Error, '抛出的应是 Error');
    assert.equal((err as { code?: string }).code, code);
    return;
  }
  assert.fail(`预期抛出 ${code}，但没有抛错`);
}

test('首次登录：创建 User 与 UserIdentity，且没有空间', async () => {
  const { repo, service } = await fresh();
  const res = await service.login('openid-A');

  assert.equal(res.hasSpace, false);
  assert.equal(res.user.status, 'active');
  assert.equal(repo.users.size, 1);
  assert.equal(repo.userIdentities.size, 1);

  const identity = [...repo.userIdentities.values()][0];
  assert.equal(identity.providerUserId, 'openid-A');
  assert.equal(identity.userId, res.user.id);
});

test('创建空间：A 成为 OWNER，获得一次性邀请码并写入审计', async () => {
  const { repo, service } = await fresh();
  const res = await service.createSpace('openid-A', { name: '我们的家' });

  assert.equal(res.inviteCode.length, 8);
  assert.equal(res.space.myRole, 'owner');
  assert.equal(res.space.members.length, 1);
  assert.equal(res.space.members[0].role, 'owner');
  assert.equal(repo.spaces.size, 1);
  assert.equal(repo.audits.some((log) => log.action === 'space.create'), true);
});

test('A 已有空间后再次创建：拒绝（ALREADY_IN_SPACE）', async () => {
  const { service } = await fresh();
  await service.createSpace('openid-A', { name: '第一个空间' });
  await expectError(service.createSpace('openid-A', { name: '第二个空间' }), ErrorCodes.ALREADY_IN_SPACE);
});

test('错误邀请码：拒绝（INVITE_INVALID）', async () => {
  const { service } = await fresh();
  await service.createSpace('openid-A', { name: '我们的家' });
  await expectError(service.joinSpace('openid-B', { inviteCode: 'ZZZZZZZZ' }), ErrorCodes.INVITE_INVALID);
});

test('过期邀请码：拒绝（INVITE_EXPIRED）', async () => {
  const { repo, service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });

  const space = repo.spaces.get(created.space.spaceId);
  assert.ok(space);
  space.inviteCodeExpiresAt = new Date(Date.now() - 1000);
  repo.spaces.set(space.id, space);

  await expectError(service.joinSpace('openid-B', { inviteCode: created.inviteCode }), ErrorCodes.INVITE_EXPIRED);
});

test('绑定成功：B 成为 MEMBER，邀请码立即失效，空间满员', async () => {
  const { repo, service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });
  const joined = await service.joinSpace('openid-B', { inviteCode: created.inviteCode });

  assert.equal(joined.space.myRole, 'member');
  assert.equal(joined.space.members.length, 2);
  assert.equal(joined.space.members[1].role, 'member');

  const space = repo.spaces.get(created.space.spaceId);
  assert.ok(space);
  assert.equal(space.memberCount, 2);
  assert.equal(space.inviteCode, null);
  assert.ok(space.inviteCodeUsedAt);
  assert.equal(repo.audits.some((log) => log.action === 'space.join'), true);
});

test('第三人 C 无法加入已满空间（邀请码已失效）', async () => {
  const { service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });
  await service.joinSpace('openid-B', { inviteCode: created.inviteCode });
  await expectError(service.joinSpace('openid-C', { inviteCode: created.inviteCode }), ErrorCodes.INVITE_INVALID);
  await expectError(service.getMySpace('openid-C'), ErrorCodes.NOT_IN_SPACE);
});

test('权限最小化：OWNER 可见邀请码，MEMBER 不可见', async () => {
  const { service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });

  const ownerView = await service.getMySpace('openid-A');
  assert.equal(ownerView.space.inviteCode, created.inviteCode);

  await service.joinSpace('openid-B', { inviteCode: created.inviteCode });
  const memberView = await service.getMySpace('openid-B');
  assert.equal(memberView.space.inviteCode, undefined);
  assert.equal(memberView.space.myRole, 'member');
});

test('跨空间查询：C 无法获取 A 的空间（服务端不接受客户端传 spaceId）', async () => {
  const { service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });

  // 即使“伪造”传入 spaceId，服务端也会忽略并按其真实成员关系返回
  const forged = service as unknown as {
    getMySpace(providerUserId: string, extra: unknown): Promise<unknown>;
  };
  await expectError(
    forged.getMySpace('openid-C', { spaceId: created.space.spaceId }),
    ErrorCodes.NOT_IN_SPACE,
  );
});

test('OWNER 不能使用自己的邀请码加入（已在空间内）', async () => {
  const { service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });
  await expectError(
    service.joinSpace('openid-A', { inviteCode: created.inviteCode }),
    ErrorCodes.ALREADY_IN_SPACE,
  );
});

test('绑定后再次登录：返回已有空间，B 的角色是 MEMBER', async () => {
  const { service } = await fresh();
  const created = await service.createSpace('openid-A', { name: '我们的家' });
  await service.joinSpace('openid-B', { inviteCode: created.inviteCode });

  const loginA = await service.login('openid-A');
  const loginB = await service.login('openid-B');

  assert.equal(loginA.hasSpace, true);
  assert.equal(loginA.space?.myRole, 'owner');
  assert.equal(loginB.hasSpace, true);
  assert.equal(loginB.space?.myRole, 'member');
  assert.equal(loginB.space?.spaceId, created.space.spaceId);
});

test('空间名称校验：空名称与超长名称均被拒绝', async () => {
  const { service } = await fresh();
  await expectError(service.createSpace('openid-A', { name: '   ' }), ErrorCodes.VALIDATION);
  await expectError(service.createSpace('openid-A', { name: 'x'.repeat(21) }), ErrorCodes.VALIDATION);
});

test('同一微信身份两次登录：User 不重复创建', async () => {
  const { repo, service } = await fresh();
  await service.login('openid-A');
  await service.login('openid-A');
  assert.equal(repo.users.size, 1);
  assert.equal(repo.userIdentities.size, 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { ManageService } from '../apps/miniprogram/cloudfunctions/_shared/manageService';
import { enforceRateLimit } from '../apps/miniprogram/cloudfunctions/_shared/rateLimit';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TodoService } from '../apps/miniprogram/cloudfunctions/_shared/todoService';
import { MemoryRepo } from './memoryRepo';

async function fresh() {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const todoService = new TodoService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  return { repo, spaceService, todoService, manageService: new ManageService(repo) };
}

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    assert.equal((err as { code?: string }).code, code);
    return;
  }
  assert.fail(`预期抛出 ${code}，但没有抛错`);
}

test('乐观锁：旧版本更新被 CONFLICT 拒绝，新版本成功（PRD §23）', async () => {
  const { todoService } = await fresh();
  const todo = await todoService.create('openid-A', { title: '买菜', date: '2026-08-15' });
  assert.equal(todo.version, 1);

  // 第一人用正确版本完成
  const done = await todoService.update('openid-A', {
    todoId: todo.id,
    version: 1,
    status: 'completed',
  });
  assert.equal(done.status, 'completed');
  assert.equal(done.version, 2);

  // 第二人手里还是旧版本 1，再改 → 冲突
  await expectError(
    todoService.update('openid-A', { todoId: todo.id, version: 1, title: '篡改' }),
    ErrorCodes.CONFLICT,
  );

  // 用最新版本 2 可以继续改
  const updated = await todoService.update('openid-A', {
    todoId: todo.id,
    version: 2,
    title: '买水果',
  });
  assert.equal(updated.title, '买水果');
  assert.equal(updated.version, 3);
});

test('乐观锁：缺版本号被 VALIDATION 拒绝', async () => {
  const { todoService } = await fresh();
  const todo = await todoService.create('openid-A', { title: '买菜', date: '2026-08-15' });
  await expectError(
    todoService.update('openid-A', { todoId: todo.id, title: 'x' } as never),
    ErrorCodes.VALIDATION,
  );
});

test('审计日志：主账号可查看，副账号被拒绝，动作可读', async () => {
  const { repo, manageService } = await fresh();
  const logs = await manageService.listAuditLogs('openid-A');
  const actions = logs.logs.map((l) => l.action);
  assert.ok(actions.includes('space.create'));
  assert.ok(actions.includes('space.join'));

  // 副账号不能访问审计
  await expectError(manageService.listAuditLogs('openid-B'), ErrorCodes.FORBIDDEN);

  // 未绑定用户也不能访问
  await repo.userIdentities.set('ui_c', {
    id: 'ui_c',
    userId: 'u_c',
    provider: 'wechat_miniprogram',
    providerUserId: 'openid-C',
    createdAt: new Date(),
  });
  await repo.users.set('u_c', {
    id: 'u_c',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await expectError(manageService.listAuditLogs('openid-C'), ErrorCodes.NOT_IN_SPACE);
});

test('频控：超过每分钟限额后拒绝（RATE_LIMITED）', async () => {
  const { repo } = await fresh();
  for (let i = 0; i < 20; i += 1) {
    await enforceRateLimit(repo, 'u_a', 'restaurantSearch');
  }
  await expectError(
    enforceRateLimit(repo, 'u_a', 'restaurantSearch'),
    ErrorCodes.RATE_LIMITED,
  );

  // OCR 限额独立（10 次/分钟），且不同用户互不影响
  for (let i = 0; i < 10; i += 1) {
    await enforceRateLimit(repo, 'u_a', 'restaurantOcr');
  }
  await expectError(enforceRateLimit(repo, 'u_a', 'restaurantOcr'), ErrorCodes.RATE_LIMITED);
  await enforceRateLimit(repo, 'u_b', 'restaurantOcr');
});

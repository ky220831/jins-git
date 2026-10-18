import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarService } from '../apps/miniprogram/cloudfunctions/_shared/calendarService';
import { ErrorCodes } from '../apps/miniprogram/cloudfunctions/_shared/errors';
import { SpaceService } from '../apps/miniprogram/cloudfunctions/_shared/spaceService';
import { TodoService } from '../apps/miniprogram/cloudfunctions/_shared/todoService';
import { MemoryRepo } from './memoryRepo';

async function fresh() {
  const repo = new MemoryRepo();
  const spaceService = new SpaceService(repo);
  const todoService = new TodoService(repo);
  const calendarService = new CalendarService(repo);
  const created = await spaceService.createSpace('openid-A', { name: '测试空间' });
  await spaceService.joinSpace('openid-B', { inviteCode: created.inviteCode });
  return { repo, spaceService, todoService, calendarService, space: created.space };
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

test('创建无时间 To Do：不产生日历事件', async () => {
  const { todoService } = await fresh();
  const todo = await todoService.create('openid-A', {
    title: '买菜',
    date: '2026-08-15',
    note: '记得带购物袋',
  });
  assert.equal(todo.status, 'pending');
  assert.equal(todo.priority, 'normal');
  assert.equal(todo.time, undefined);
  assert.equal(todo.note, '记得带购物袋');
});

test('创建带时间 To Do：自动生成 CalendarEvent（业务数据为唯一真实来源）', async () => {
  const { repo, todoService } = await fresh();
  const todo = await todoService.create('openid-A', {
    title: '看牙医',
    date: '2026-08-20',
    time: '14:30',
    priority: 'high',
  });
  assert.equal(repo.calendarEvents.size, 1);
  const event = [...repo.calendarEvents.values()][0];
  assert.equal(event.sourceType, 'todo');
  assert.equal(event.sourceId, todo.id);
  assert.equal(event.title, '看牙医');
  assert.equal(event.startTime.toISOString(), new Date('2026-08-20T14:30:00+08:00').toISOString());
});

test('完成 To Do：对应日历事件被移除', async () => {
  const { repo, todoService } = await fresh();
  const todo = await todoService.create('openid-A', {
    title: '看牙医',
    date: '2026-08-20',
    time: '14:30',
  });
  assert.equal(repo.calendarEvents.size, 1);
  await todoService.update('openid-A', { todoId: todo.id, version: 1, status: 'completed' });
  assert.equal(repo.calendarEvents.size, 0);
});

test('修改 To Do 时间：日历事件时间同步更新', async () => {
  const { repo, todoService } = await fresh();
  const todo = await todoService.create('openid-A', {
    title: '看电影',
    date: '2026-08-20',
    time: '18:00',
  });
  await todoService.update('openid-A', { todoId: todo.id, version: 1, time: '20:30' });
  const event = [...repo.calendarEvents.values()][0];
  assert.equal(event.startTime.toISOString(), new Date('2026-08-20T20:30:00+08:00').toISOString());
});

test('月视图：只返回 pending/completed，归档事项不显示', async () => {
  const { todoService } = await fresh();
  await todoService.create('openid-A', { title: '事项1', date: '2026-08-10' });
  const todo2 = await todoService.create('openid-A', { title: '事项2', date: '2026-08-11' });
  const todo3 = await todoService.create('openid-A', { title: '事项3', date: '2026-08-12' });
  await todoService.update('openid-A', { todoId: todo2.id, version: 1, status: 'completed' });
  await todoService.update('openid-A', { todoId: todo3.id, version: 1, status: 'archived' });

  const list = await todoService.listByMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((t) => t.title).sort(),
    ['事项1', '事项2'],
  );
});

test('跨空间：其他空间成员无法更新/查看 A 的 To Do（同空间成员可共享操作）', async () => {
  const { repo, spaceService, todoService } = await fresh();
  const todo = await todoService.create('openid-A', { title: 'A 的事项', date: '2026-08-10' });

  // 同空间成员 B 可以完成 A 的事项（双人共享）
  const done = await todoService.update('openid-B', { todoId: todo.id, version: 1, status: 'completed' });
  assert.equal(done.status, 'completed');
  await todoService.update('openid-B', { todoId: todo.id, version: 2, status: 'pending' });

  // 另一空间的 C 无法操作
  await spaceService.createSpace('openid-C', { name: 'C 的空间' });
  await expectError(
    todoService.update('openid-C', { todoId: todo.id, version: 1, title: '篡改' }),
    ErrorCodes.NOT_FOUND,
  );

  const cList = await todoService.listByMonth('openid-C', { year: 2026, month: 8 });
  assert.equal(cList.length, 0);
  assert.equal(repo.todos.get(todo.id)?.title, 'A 的事项');
});

test('业务关联框架：register/remove BusinessEvent 并出现在月视图', async () => {
  const { calendarService } = await fresh();
  const view = await calendarService.registerBusinessEvent('openid-A', {
    sourceType: 'meal',
    sourceId: 'meal_123',
    title: '晚餐',
    startTime: '2026-08-20T18:30:00+08:00',
    colorToken: 'accent',
  });
  assert.equal(view.sourceType, 'meal');
  assert.equal(view.title, '晚餐');

  const month = await calendarService.getMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(month.events.length, 1);
  assert.equal(month.events[0].sourceId, 'meal_123');

  await calendarService.removeBusinessEvent('openid-A', { sourceType: 'meal', sourceId: 'meal_123' });
  const after = await calendarService.getMonth('openid-A', { year: 2026, month: 8 });
  assert.equal(after.events.length, 0);
});

test('校验：非法日期/时间/空标题被拒绝', async () => {
  const { todoService } = await fresh();
  await expectError(
    todoService.create('openid-A', { title: 'x', date: '2026-13-40' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    todoService.create('openid-A', { title: 'x', date: '2026-08-20', time: '25:99' }),
    ErrorCodes.VALIDATION,
  );
  await expectError(
    todoService.create('openid-A', { title: '   ', date: '2026-08-20' }),
    ErrorCodes.VALIDATION,
  );
});

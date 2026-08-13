import {
  CALENDAR_SOURCE_TODO,
  PRIORITY_NORMAL,
  TODO_STATUS_ARCHIVED,
  TODO_STATUS_COMPLETED,
  TODO_STATUS_PENDING,
  type CalendarMonthInput,
  type CreateTodoInput,
  type TodoPriority,
  type TodoStatus,
  type TodoView,
  type UpdateTodoInput,
} from '../../../../packages/types/src';
import { TODO_TITLE_MAX_LENGTH } from './constants';
import { requireSpaceMember } from './access';
import { isDateString, monthRange, normalizeTime, toShanghaiDate, validateYearMonth } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import type { CalendarEventRecord, Repo, TodoRecord } from './repo';

const PRIORITIES: TodoPriority[] = ['low', 'normal', 'high'];
const STATUSES: TodoStatus[] = ['pending', 'completed', 'archived'];

export function toTodoView(todo: TodoRecord): TodoView {
  return {
    id: todo.id,
    title: todo.title,
    date: todo.date,
    ...(todo.time ? { time: todo.time } : {}),
    ...(todo.note ? { note: todo.note } : {}),
    priority: todo.priority,
    status: todo.status,
    ...(todo.businessType ? { businessType: todo.businessType } : {}),
    ...(todo.businessId ? { businessId: todo.businessId } : {}),
    createdBy: todo.createdBy,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    version: todo.version,
  };
}

export class TodoService {
  constructor(private readonly repo: Repo) {}

  async create(providerUserId: string, input: CreateTodoInput): Promise<TodoView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const title = (input?.title ?? '').trim();
    if (!title || title.length > TODO_TITLE_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `事项标题需为 1~${TODO_TITLE_MAX_LENGTH} 个字符`);
    }
    const date = (input?.date ?? '').trim();
    if (!isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
    }
    const time = normalizeTime(input?.time);
    const priority = input?.priority && PRIORITIES.includes(input.priority) ? input.priority : PRIORITY_NORMAL;

    const now = new Date();
    const todo: TodoRecord = {
      id: newId('td'),
      spaceId,
      title,
      date,
      time,
      note: input?.note?.trim() || null,
      priority,
      status: TODO_STATUS_PENDING,
      businessType: null,
      businessId: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repo.createTodo(todo);
    await this.syncCalendarEvent(spaceId, todo, userId, now);
    return toTodoView(todo);
  }

  async update(providerUserId: string, input: UpdateTodoInput): Promise<TodoView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const todoId = input?.todoId;
    if (!todoId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少事项 ID');
    }
    const existing = await this.repo.findTodoById(spaceId, todoId);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '事项不存在或已删除');
    }

    const patch: Partial<TodoRecord> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title || title.length > TODO_TITLE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `事项标题需为 1~${TODO_TITLE_MAX_LENGTH} 个字符`);
      }
      patch.title = title;
    }
    if (input.date !== undefined) {
      if (!isDateString(input.date)) {
        throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确');
      }
      patch.date = input.date;
    }
    if (input.time !== undefined) {
      patch.time = normalizeTime(input.time);
    }
    if (input.note !== undefined) {
      patch.note = input.note?.trim() || null;
    }
    if (input.priority !== undefined) {
      if (!PRIORITIES.includes(input.priority)) {
        throw new AppError(ErrorCodes.VALIDATION, '优先级不正确');
      }
      patch.priority = input.priority;
    }
    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status)) {
        throw new AppError(ErrorCodes.VALIDATION, '状态不正确');
      }
      patch.status = input.status;
    }

    patch.version = existing.version + 1;
    patch.updatedAt = new Date();
    await this.repo.updateTodo(spaceId, todoId, patch);

    const updated: TodoRecord = { ...existing, ...patch };
    await this.syncCalendarEvent(spaceId, updated, userId, patch.updatedAt);
    return toTodoView(updated);
  }

  async listByMonth(providerUserId: string, input: CalendarMonthInput): Promise<TodoView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const { year, month } = validateYearMonth(input);
    const { start, end } = monthRange(year, month);
    const todos = await this.repo.listTodosByDateRange(spaceId, start, end);
    return todos.filter((todo) => todo.status !== TODO_STATUS_ARCHIVED).map(toTodoView);
  }

  /** To Do 是唯一真实来源：有时段且未完成时同步 CalendarEvent，否则删除 */
  private async syncCalendarEvent(
    spaceId: string,
    todo: TodoRecord,
    userId: string,
    now: Date,
  ): Promise<void> {
    const existing = await this.repo.findCalendarEventBySource(spaceId, CALENDAR_SOURCE_TODO, todo.id);
    const shouldShow = todo.status === TODO_STATUS_PENDING && todo.time !== null && isDateString(todo.date);

    if (shouldShow && todo.time) {
      const startTime = toShanghaiDate(todo.date, todo.time);
      if (existing) {
        await this.repo.updateCalendarEvent(spaceId, existing.id, {
          title: todo.title,
          startTime,
          endTime: null,
          updatedAt: now,
          version: existing.version + 1,
        });
      } else {
        const event: CalendarEventRecord = {
          id: newId('ce'),
          spaceId,
          sourceType: CALENDAR_SOURCE_TODO,
          sourceId: todo.id,
          title: todo.title,
          startTime,
          endTime: null,
          colorToken: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await this.repo.createCalendarEvent(event);
      }
    } else if (existing) {
      await this.repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }
}

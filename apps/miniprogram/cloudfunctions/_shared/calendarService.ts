import {
  CALENDAR_SOURCE_TYPES,
  TODO_STATUS_ARCHIVED,
  type CalendarEventView,
  type CalendarMonthInput,
  type CalendarMonthResult,
  type RegisterBusinessEventInput,
  type RemoveBusinessEventInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import { monthRange, toShanghaiDate, validateYearMonth } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { AnniversaryService } from './anniversaryService';
import { HolidayService } from './holidayService';
import { newId } from './ids';
import { PeriodService } from './periodService';
import type { CalendarEventRecord, Repo } from './repo';
import { toTodoView } from './todoService';

export function toCalendarEventView(event: CalendarEventRecord): CalendarEventView {
  return {
    id: event.id,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    title: event.title,
    startTime: event.startTime.toISOString(),
    ...(event.endTime ? { endTime: event.endTime.toISOString() } : {}),
    ...(event.colorToken ? { colorToken: event.colorToken } : {}),
  };
}

export class CalendarService {
  constructor(private readonly repo: Repo) {}

  /** 月视图：聚合 To Do 与业务日历事件 */
  async getMonth(providerUserId: string, input: CalendarMonthInput): Promise<CalendarMonthResult> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const { year, month } = validateYearMonth(input);
    const { start, end } = monthRange(year, month);

    const todos = await this.repo.listTodosByDateRange(spaceId, start, end);
    const events = await this.repo.listCalendarEventsByRange(
      spaceId,
      toShanghaiDate(start, '00:00'),
      toShanghaiDate(end, '23:59'),
    );
    const periodDays = await new PeriodService(this.repo).monthDaysForSpace(spaceId, year, month);
    const holidays = await new HolidayService(this.repo).month(year, month);
    const anniversaryEvents = await new AnniversaryService(this.repo).monthEventsForSpace(
      spaceId,
      year,
      month,
    );

    return {
      year,
      month,
      todos: todos.filter((todo) => todo.status !== TODO_STATUS_ARCHIVED).map(toTodoView),
      events: [...events.map(toCalendarEventView), ...anniversaryEvents].sort((a, b) =>
        a.startTime < b.startTime ? -1 : 1,
      ),
      periodDays,
      holidays,
    };
  }

  /** 业务关联框架：业务模块登记/更新日历事件（业务数据是唯一真实来源） */
  async registerBusinessEvent(
    providerUserId: string,
    input: RegisterBusinessEventInput,
  ): Promise<CalendarEventView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    if (
      !input ||
      !input.sourceType ||
      !input.sourceId ||
      !input.title?.trim() ||
      !input.startTime
    ) {
      throw new AppError(ErrorCodes.VALIDATION, '业务事件参数不完整');
    }
    if (!CALENDAR_SOURCE_TYPES.includes(input.sourceType)) {
      throw new AppError(ErrorCodes.VALIDATION, '不支持的业务类型');
    }
    const startTime = new Date(input.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new AppError(ErrorCodes.VALIDATION, '开始时间格式不正确');
    }
    let endTime: Date | null = null;
    if (input.endTime) {
      endTime = new Date(input.endTime);
      if (Number.isNaN(endTime.getTime())) {
        throw new AppError(ErrorCodes.VALIDATION, '结束时间格式不正确');
      }
    }

    const now = new Date();
    const existing = await this.repo.findCalendarEventBySource(
      spaceId,
      input.sourceType,
      input.sourceId,
    );
    const event: CalendarEventRecord = {
      id: existing?.id || newId('ce'),
      spaceId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title.trim(),
      startTime,
      endTime,
      colorToken: input.colorToken || null,
      createdBy: existing?.createdBy || userId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };

    if (existing) {
      await this.repo.updateCalendarEvent(spaceId, existing.id, {
        title: event.title,
        startTime,
        endTime,
        colorToken: event.colorToken,
        updatedAt: now,
        version: event.version,
      });
    } else {
      await this.repo.createCalendarEvent(event);
    }
    return toCalendarEventView(event);
  }

  async removeBusinessEvent(
    providerUserId: string,
    input: RemoveBusinessEventInput,
  ): Promise<void> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    if (!input?.sourceType || !input?.sourceId) {
      throw new AppError(ErrorCodes.VALIDATION, '业务事件参数不完整');
    }
    const existing = await this.repo.findCalendarEventBySource(
      spaceId,
      input.sourceType,
      input.sourceId,
    );
    if (existing) {
      await this.repo.deleteCalendarEvent(spaceId, existing.id);
    }
  }
}

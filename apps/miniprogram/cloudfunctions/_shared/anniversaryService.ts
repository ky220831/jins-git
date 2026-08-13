import {
  ROLE_OWNER,
  type AnniversaryView,
  type CalendarEventView,
  type CreateAnniversaryInput,
  type DeleteAnniversaryInput,
  type UpdateAnniversaryInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import {
  ANNIVERSARY_NAME_MAX_LENGTH,
  ANNIVERSARY_NOTE_MAX_LENGTH,
  COLLECTIONS,
  TRASH_RETENTION_HOURS,
} from './constants';
import { isDateString, normalizeTime, todayShanghaiString } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import type { AnniversaryRecord, Repo, TrashRecord } from './repo';

const DAY_MS = 24 * 3600000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD → { year, month, day } */
function parseDateKey(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** 构造日期键，2 月 29 日在非闰年回退到 2 月 28 日 */
function dateKeyOf(year: number, month: number, day: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${pad(month)}-${pad(safeDay)}`;
}

/** 该纪念日在某一年份的发生日期；非每年重复时只有原始年份出现 */
function occurrenceInYear(record: AnniversaryRecord, year: number): string | null {
  const { year: originYear, month, day } = parseDateKey(record.date);
  if (!record.yearly && originYear !== year) return null;
  return dateKeyOf(year, month, day);
}

/** 下一次发生日（>= 今天）；每年重复时滚动到下一年 */
function nextOccurrence(record: AnniversaryRecord, today: string): string {
  const { year: originYear, month, day } = parseDateKey(record.date);
  const thisYear = Number(today.slice(0, 4));
  const candidate = dateKeyOf(thisYear, month, day);
  if (candidate >= today) return candidate;
  if (record.yearly) return dateKeyOf(thisYear + 1, month, day);
  return originYear > thisYear ? dateKeyOf(originYear, month, day) : candidate;
}

function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+08:00`).getTime();
  const b = new Date(`${to}T00:00:00+08:00`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export function toAnniversaryView(record: AnniversaryRecord, today = todayShanghaiString()): AnniversaryView {
  const next = nextOccurrence(record, today);
  return {
    id: record.id,
    name: record.name,
    date: record.date,
    ...(record.time ? { time: record.time } : {}),
    ...(record.note ? { note: record.note } : {}),
    yearly: record.yearly,
    nextOccurrence: next,
    daysToNext: dayDiff(today, next),
    elapsedDays: dayDiff(record.date, today),
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export class AnniversaryService {
  constructor(
    private readonly repo: Repo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(providerUserId: string): Promise<AnniversaryView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const today = todayShanghaiString(this.clock);
    return (await this.repo.listAnniversaries(spaceId))
      .sort((a, b) => {
        const na = nextOccurrence(a, today);
        const nb = nextOccurrence(b, today);
        return na < nb ? -1 : na > nb ? 1 : 0;
      })
      .map((r) => toAnniversaryView(r, today));
  }

  async create(providerUserId: string, input: CreateAnniversaryInput): Promise<AnniversaryView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const name = (input?.name ?? '').trim();
    if (!name || name.length > ANNIVERSARY_NAME_MAX_LENGTH) {
      throw new AppError(
        ErrorCodes.VALIDATION,
        `纪念日名称需为 1~${ANNIVERSARY_NAME_MAX_LENGTH} 个字符`,
      );
    }
    const date = (input?.date ?? '').trim();
    if (!isDateString(date)) {
      throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确（YYYY-MM-DD）');
    }
    const time = normalizeTime(input?.time);
    const note = input?.note?.trim() || null;
    if (note && note.length > ANNIVERSARY_NOTE_MAX_LENGTH) {
      throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${ANNIVERSARY_NOTE_MAX_LENGTH} 个字符`);
    }
    const now = this.clock();
    const record: AnniversaryRecord = {
      id: newId('av'),
      spaceId,
      name,
      date,
      time,
      note,
      yearly: input?.yearly !== false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repo.createAnniversary(record);
    await this.audit(userId, spaceId, 'anniversary.create', 'anniversary', record.id, now);
    return toAnniversaryView(record, todayShanghaiString(this.clock));
  }

  async update(providerUserId: string, input: UpdateAnniversaryInput): Promise<AnniversaryView> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const id = input?.anniversaryId?.trim();
    if (!id) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少纪念日 ID');
    }
    const existing = await this.repo.findAnniversaryById(spaceId, id);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '纪念日不存在或已删除');
    }
    const now = this.clock();
    const patch: Partial<AnniversaryRecord> = {};
    if (input?.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > ANNIVERSARY_NAME_MAX_LENGTH) {
        throw new AppError(
          ErrorCodes.VALIDATION,
          `纪念日名称需为 1~${ANNIVERSARY_NAME_MAX_LENGTH} 个字符`,
        );
      }
      patch.name = name;
    }
    if (input?.date !== undefined) {
      const date = (input.date ?? '').trim();
      if (!isDateString(date)) {
        throw new AppError(ErrorCodes.VALIDATION, '日期格式不正确（YYYY-MM-DD）');
      }
      patch.date = date;
    }
    if (input?.time !== undefined) patch.time = normalizeTime(input.time);
    if (input?.note !== undefined) {
      const note = input.note?.trim() || null;
      if (note && note.length > ANNIVERSARY_NOTE_MAX_LENGTH) {
        throw new AppError(ErrorCodes.VALIDATION, `备注不能超过 ${ANNIVERSARY_NOTE_MAX_LENGTH} 个字符`);
      }
      patch.note = note;
    }
    if (input?.yearly !== undefined) patch.yearly = !!input.yearly;
    patch.version = existing.version + 1;
    patch.updatedAt = now;
    await this.repo.updateAnniversary(spaceId, id, patch);
    await this.audit(userId, spaceId, 'anniversary.update', 'anniversary', id, now);
    return toAnniversaryView({ ...existing, ...patch }, todayShanghaiString(this.clock));
  }

  async remove(providerUserId: string, input: DeleteAnniversaryInput): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除纪念日');
    }
    const id = input?.anniversaryId?.trim();
    if (!id) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少纪念日 ID');
    }
    const existing = await this.repo.findAnniversaryById(spaceId, id);
    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, '纪念日不存在或已删除');
    }
    const now = this.clock();
    await this.trashIt(spaceId, userId, existing, 'manual_delete', now);
    await this.repo.deleteAnniversary(spaceId, id);
    await this.audit(userId, spaceId, 'anniversary.delete', 'anniversary', id, now);
  }

  /** 月视图虚拟日历事件：纪念日按年重复，读时计算，不落库（业务数据 = 唯一真实来源） */
  async monthEventsForSpace(spaceId: string, year: number, month: number): Promise<CalendarEventView[]> {
    const records = await this.repo.listAnniversaries(spaceId);
    const monthKey = `${year}-${pad(month)}`;
    const events: CalendarEventView[] = [];
    for (const record of records) {
      const occurrence = occurrenceInYear(record, year);
      if (!occurrence || !occurrence.startsWith(monthKey)) continue;
      const time = record.time || '00:00';
      const startTime = new Date(`${occurrence}T${time}:00+08:00`);
      events.push({
        id: `anniversary:${record.id}:${occurrence}`,
        sourceType: 'anniversary',
        sourceId: record.id,
        title: `❤️ ${record.name}`,
        startTime: startTime.toISOString(),
        colorToken: 'anniversary',
      });
    }
    return events.sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  }

  private async trashIt(
    spaceId: string,
    deletedBy: string,
    record: AnniversaryRecord,
    reason: string,
    now: Date,
  ): Promise<void> {
    const item: TrashRecord = {
      id: newId('tr'),
      spaceId,
      collection: COLLECTIONS.anniversaries,
      recordId: record.id,
      snapshot: { ...record },
      deletedAt: now,
      deletedBy,
      deleteReason: reason,
      purgeAt: new Date(now.getTime() + TRASH_RETENTION_HOURS * 3600000),
      originalStatus: null,
      retentionType: 'permanent',
      status: 'in_trash',
      restoredAt: null,
      restoredBy: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createTrash(item);
  }

  private async audit(
    actorUserId: string,
    spaceId: string,
    action: string,
    targetType: string,
    targetId: string,
    now: Date,
  ): Promise<void> {
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId,
      action,
      targetType,
      targetId,
      result: 'success',
      createdAt: now,
    });
  }
}

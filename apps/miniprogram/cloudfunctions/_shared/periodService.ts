import {
  PERIOD_TYPE_ACTUAL,
  PERIOD_TYPE_PREDICTED,
  ROLE_OWNER,
  type DeletePeriodInput,
  type PeriodDayView,
  type PeriodInfoResult,
  type PeriodRecordView,
  type RecordPeriodInput,
  type SetPeriodVisibilityInput,
  type UpdatePeriodInput,
  type UpdatePeriodEndInput,
} from '../../../../packages/types/src';
import { requireSpaceMember } from './access';
import {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PREDICTED_DURATION,
  PERIOD_ACTUAL_MAX,
  PERIOD_REST_DAYS,
} from './constants';
import { isDateString, monthRange } from './dateTime';
import { AppError, ErrorCodes } from './errors';
import { newId } from './ids';
import type { PeriodRecordRecord, Repo } from './repo';

const SPACE_SETTING_PERIOD_VISIBLE = 'period_calendar_visible';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD 纯日期运算：不依赖设备时区（PRD §73） */
function dateParts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

function addDays(date: string, n: number): string {
  const { y, m, d } = dateParts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function toPeriodRecordView(record: PeriodRecordRecord): PeriodRecordView {
  return {
    id: record.id,
    startDate: record.startDate,
    endDate: record.endDate,
    type: record.type,
    isEstimated: record.isEstimated,
    cycleLength: record.cycleLength,
    createdAt: record.createdAt.toISOString(),
  };
}

export class PeriodService {
  constructor(
    private readonly repo: Repo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 记录一条实际生理期：最多保留 2 条 actual + 1 条 predicted，旧数据滚动 */
  async recordActual(providerUserId: string, input: RecordPeriodInput): Promise<PeriodRecordView[]> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const startDate = (input?.startDate ?? '').trim();
    const endDate = (input?.endDate ?? '').trim();
    if (!isDateString(startDate) || !isDateString(endDate)) {
      throw new AppError(ErrorCodes.VALIDATION, '生理期日期格式不正确');
    }
    if (startDate > endDate) {
      throw new AppError(ErrorCodes.VALIDATION, '开始日期不能晚于结束日期');
    }

    const now = this.clock();
    const record: PeriodRecordRecord = {
      id: newId('pr'),
      spaceId,
      startDate,
      endDate,
      type: PERIOD_TYPE_ACTUAL,
      isEstimated: false,
      cycleLength: DEFAULT_CYCLE_LENGTH,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createPeriodRecord(record);

    // 滚动：只保留最近 2 条 actual
    const actuals = (await this.repo.listPeriodRecords(spaceId))
      .filter((r) => r.type === PERIOD_TYPE_ACTUAL)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    while (actuals.length > PERIOD_ACTUAL_MAX) {
      const oldest = actuals.shift();
      if (oldest) {
        await this.repo.deletePeriodRecord(spaceId, oldest.id);
      }
    }

    await this.recomputePrediction(spaceId, now);
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId: userId,
      action: 'period.record',
      targetType: 'period_record',
      targetId: record.id,
      result: 'success',
      createdAt: now,
    });
    return this.listViews(spaceId);
  }

  /**
   * 补录结束日期：先记开始日期（结束=开始日），期间内再补结束日期。
   * 双人平等可操作；仅允许修改 actual 记录。
   */
  async updateEnd(
    providerUserId: string,
    input: UpdatePeriodEndInput,
  ): Promise<PeriodRecordView[]> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const recordId = input?.recordId?.trim();
    if (!recordId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少生理期记录 ID');
    }
    const endDate = (input?.endDate ?? '').trim();
    if (!isDateString(endDate)) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期格式不正确');
    }
    const record = await this.repo.findPeriodRecordById(spaceId, recordId);
    if (!record) {
      throw new AppError(ErrorCodes.NOT_FOUND, '生理期记录不存在');
    }
    if (record.type !== PERIOD_TYPE_ACTUAL) {
      throw new AppError(ErrorCodes.VALIDATION, '预测记录不能修改结束日期');
    }
    if (endDate < record.startDate) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期不能早于开始日期');
    }
    // 合理范围：一个周期最长约 31 天
    if (endDate > addDays(record.startDate, 31)) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期超出合理范围，请检查');
    }
    const now = this.clock();
    await this.repo.updatePeriodRecord(spaceId, recordId, { endDate, updatedAt: now });
    await this.recomputePrediction(spaceId, now);
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId: userId,
      action: 'period.record.update_end',
      targetType: 'period_record',
      targetId: recordId,
      result: 'success',
      createdAt: now,
    });
    return this.listViews(spaceId);
  }

  /** 修改实际记录的开始/结束日期（替换原记录，不产生新记录） */
  async update(
    providerUserId: string,
    input: UpdatePeriodInput,
  ): Promise<PeriodRecordView[]> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    const recordId = input?.recordId?.trim();
    const startDate = (input?.startDate ?? '').trim();
    const endDate = (input?.endDate ?? '').trim();
    if (!recordId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少生理期记录 ID');
    }
    if (!isDateString(startDate) || !isDateString(endDate)) {
      throw new AppError(ErrorCodes.VALIDATION, '生理期日期格式不正确');
    }
    if (startDate > endDate) {
      throw new AppError(ErrorCodes.VALIDATION, '开始日期不能晚于结束日期');
    }
    if (endDate > addDays(startDate, 31)) {
      throw new AppError(ErrorCodes.VALIDATION, '结束日期超出合理范围，请检查');
    }
    const record = await this.repo.findPeriodRecordById(spaceId, recordId);
    if (!record) {
      throw new AppError(ErrorCodes.NOT_FOUND, '生理期记录不存在');
    }
    if (record.type !== PERIOD_TYPE_ACTUAL) {
      throw new AppError(ErrorCodes.VALIDATION, '预测记录不能修改');
    }
    const now = this.clock();
    await this.repo.updatePeriodRecord(spaceId, recordId, {
      startDate,
      endDate,
      updatedAt: now,
    });
    await this.recomputePrediction(spaceId, now);
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId: userId,
      action: 'period.record.update',
      targetType: 'period_record',
      targetId: recordId,
      result: 'success',
      createdAt: now,
    });
    return this.listViews(spaceId);
  }

  /** 删除生理期记录：仅主账号（与回收站/敏感数据权限一致） */
  async delete(providerUserId: string, input: DeletePeriodInput): Promise<void> {
    const { spaceId, userId, role } = await requireSpaceMember(this.repo, providerUserId);
    if (role !== ROLE_OWNER) {
      throw new AppError(ErrorCodes.FORBIDDEN, '只有主账号可以删除生理期记录');
    }
    const recordId = input?.recordId?.trim();
    if (!recordId) {
      throw new AppError(ErrorCodes.VALIDATION, '缺少生理期记录 ID');
    }
    const records = await this.repo.listPeriodRecords(spaceId);
    const target = records.find((r) => r.id === recordId);
    if (!target) {
      throw new AppError(ErrorCodes.NOT_FOUND, '生理期记录不存在');
    }
    await this.repo.deletePeriodRecord(spaceId, recordId);
    await this.recomputePrediction(spaceId, this.clock());
    await this.repo.writeAudit({
      id: newId('al'),
      spaceId,
      actorUserId: userId,
      action: 'period.delete',
      targetType: 'period_record',
      targetId: recordId,
      result: 'success',
      createdAt: this.clock(),
    });
  }

  async list(providerUserId: string): Promise<PeriodRecordView[]> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    return this.listViews(spaceId);
  }

  /** 今日状态 + 记录 + 下次预测 + 显示开关（首页/日历用） */
  async info(providerUserId: string): Promise<PeriodInfoResult> {
    const { spaceId } = await requireSpaceMember(this.repo, providerUserId);
    const records = (await this.repo.listPeriodRecords(spaceId)).sort((a, b) =>
      a.startDate < b.startDate ? -1 : 1,
    );
    const today = this.todayShanghai();
    const views = records.map(toPeriodRecordView);

    let todayStatus: { date: string; kind: 'period' | 'rest' } | undefined;
    for (const r of records) {
      if (today >= r.startDate && today <= r.endDate) {
        todayStatus = { date: today, kind: 'period' };
        break;
      }
    }
    if (!todayStatus) {
      for (const r of records.filter((x) => x.type === PERIOD_TYPE_ACTUAL)) {
        for (let i = 1; i <= PERIOD_REST_DAYS; i += 1) {
          if (today === addDays(r.endDate, i)) {
            todayStatus = { date: today, kind: 'rest' };
            break;
          }
        }
        if (todayStatus) break;
      }
    }

    const predicted = records.find((r) => r.type === PERIOD_TYPE_PREDICTED);
    const nextPredicted =
      predicted && predicted.endDate >= today
        ? { startDate: predicted.startDate, endDate: predicted.endDate }
        : undefined;

    return {
      records: views,
      ...(todayStatus ? { today: todayStatus } : {}),
      ...(nextPredicted ? { nextPredicted } : {}),
      calendarVisible: await this.getCalendarVisible(spaceId),
    };
  }

  /** “日历显示生理期”开关：隐藏标记，不删除数据（PRD §29） */
  async setCalendarVisible(
    providerUserId: string,
    input: SetPeriodVisibilityInput,
  ): Promise<{ visible: boolean }> {
    const { spaceId, userId } = await requireSpaceMember(this.repo, providerUserId);
    if (typeof input?.visible !== 'boolean') {
      throw new AppError(ErrorCodes.VALIDATION, '开关状态不正确');
    }
    await this.repo.upsertSpaceSetting({
      id: `ss_period_${spaceId}`,
      spaceId,
      key: SPACE_SETTING_PERIOD_VISIBLE,
      value: input.visible,
      updatedBy: userId,
      updatedAt: this.clock(),
    });
    return { visible: input.visible };
  }

  async getCalendarVisible(spaceId: string): Promise<boolean> {
    const setting = await this.repo.findSpaceSetting(spaceId, SPACE_SETTING_PERIOD_VISIBLE);
    return setting?.value !== false;
  }

  /** 供 CalendarService 聚合：某月每天的生理期/休息标记（空间成员已校验） */
  async monthDaysForSpace(spaceId: string, year: number, month: number): Promise<PeriodDayView[]> {
    const { start, end } = monthRange(year, month);
    const records = await this.repo.listPeriodRecords(spaceId);
    const byDate = new Map<string, PeriodDayView>();

    const put = (day: PeriodDayView) => {
      const existing = byDate.get(day.date);
      // 生理期标记优先于休息标记
      if (!existing || (day.kind === 'period' && existing.kind !== 'period')) {
        byDate.set(day.date, day);
      }
    };

    for (const r of records) {
      const rangeStart = r.startDate > start ? r.startDate : start;
      const rangeEnd = r.endDate < end ? r.endDate : end;
      for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
        put({ date: d, kind: 'period', isEstimated: r.isEstimated });
      }
      if (r.type === PERIOD_TYPE_ACTUAL) {
        for (let i = 1; i <= PERIOD_REST_DAYS; i += 1) {
          const restDay = addDays(r.endDate, i);
          if (restDay >= start && restDay <= end) {
            put({ date: restDay, kind: 'rest', isEstimated: false });
          }
        }
      }
    }

    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  private async recomputePrediction(spaceId: string, now: Date): Promise<void> {
    const records = await this.repo.listPeriodRecords(spaceId);
    for (const r of records.filter((x) => x.type === PERIOD_TYPE_PREDICTED)) {
      await this.repo.deletePeriodRecord(spaceId, r.id);
    }
    const actuals = records
      .filter((x) => x.type === PERIOD_TYPE_ACTUAL)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    if (actuals.length === 0) return;

    const latest = actuals[actuals.length - 1];
    const cycleLength = latest.cycleLength || DEFAULT_CYCLE_LENGTH;
    // 用户口径（2026-08-14）：下一个预计开始日 = 最近一次实际开始日 + 28 天；仅单日标记，不再用时间段
    const predictedStart = addDays(latest.startDate, cycleLength);
    const predicted: PeriodRecordRecord = {
      id: newId('pr'),
      spaceId,
      startDate: predictedStart,
      endDate: predictedStart,
      type: PERIOD_TYPE_PREDICTED,
      isEstimated: true,
      cycleLength,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createPeriodRecord(predicted);
  }

  private async listViews(spaceId: string): Promise<PeriodRecordView[]> {
    const records = (await this.repo.listPeriodRecords(spaceId)).sort((a, b) =>
      a.startDate < b.startDate ? -1 : 1,
    );
    return records.map(toPeriodRecordView);
  }

  private todayShanghai(): string {
    const shifted = new Date(this.clock().getTime() + 8 * 3600000);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
      shifted.getUTCDate(),
    )}`;
  }
}

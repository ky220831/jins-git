import type { HolidayDayView } from '../../../../packages/types/src';
import { monthRange } from './dateTime';
import type { HolidayRecord, Repo } from './repo';

function toHolidayView(record: HolidayRecord): HolidayDayView {
  return {
    date: record.date,
    name: record.name,
    type: record.type,
    isHoliday: record.isHoliday,
    isWorkday: record.isWorkday,
    isMakeupWorkday: record.isMakeupWorkday,
  };
}

/** 节假日数据来自 holiday_calendar（官方发布，年度更新），不按星期几猜测（PRD §31/§34） */
export class HolidayService {
  constructor(private readonly repo: Repo) {}

  async listByRange(startDate: string, endDate: string): Promise<HolidayDayView[]> {
    const records = await this.repo.listHolidaysByRange(startDate, endDate);
    return records
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(toHolidayView);
  }

  async month(year: number, month: number): Promise<HolidayDayView[]> {
    const { start, end } = monthRange(year, month);
    return this.listByRange(start, end);
  }
}

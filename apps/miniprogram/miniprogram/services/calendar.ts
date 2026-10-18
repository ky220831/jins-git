import { callFunction } from '../api/cloud';
import type {
  CalendarMonthInput,
  CalendarMonthResult,
  HolidayDayView,
} from '../lib/shared/types/index';

export const CalendarService = {
  month(input: CalendarMonthInput): Promise<CalendarMonthResult> {
    return callFunction<CalendarMonthResult>('calendar-month', { ...input });
  },

  /** 公共节假日（游客模式用）：只含官方公开安排，不含任何私人数据 */
  publicMonth(input: CalendarMonthInput): Promise<{ days: HolidayDayView[] }> {
    return callFunction<{ days: HolidayDayView[] }>('holiday-public', { ...input });
  },
};

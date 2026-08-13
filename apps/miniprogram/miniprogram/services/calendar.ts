import { callFunction } from '../api/cloud';
import type { CalendarMonthInput, CalendarMonthResult } from '../lib/shared/types/index';

export const CalendarService = {
  month(input: CalendarMonthInput): Promise<CalendarMonthResult> {
    return callFunction<CalendarMonthResult>('calendar-month', { ...input });
  },
};

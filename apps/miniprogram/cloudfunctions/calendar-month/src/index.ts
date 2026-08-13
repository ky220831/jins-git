import cloud from 'wx-server-sdk';
import type { CalendarMonthInput, CalendarMonthResult } from '../../../../../packages/types/src';
import { CalendarService } from '../../_shared/calendarService';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';

const service = new CalendarService(new CloudRepo());

export const main = createHandler<CalendarMonthInput, CalendarMonthResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  return service.getMonth(OPENID, event);
});

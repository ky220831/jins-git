import cloud from 'wx-server-sdk';
import type { CalendarMonthInput, TodoView } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { TodoService } from '../../_shared/todoService';

const service = new TodoService(new CloudRepo());

export const main = createHandler<CalendarMonthInput, TodoView[]>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  return service.listByMonth(OPENID, event);
});

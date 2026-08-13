import cloud from 'wx-server-sdk';
import type { TodoView, UpdateTodoInput } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { TodoService } from '../../_shared/todoService';

const service = new TodoService(new CloudRepo());

export const main = createHandler<UpdateTodoInput, TodoView>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  return service.update(OPENID, event);
});

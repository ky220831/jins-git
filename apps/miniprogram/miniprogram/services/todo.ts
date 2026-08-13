import { callFunction } from '../api/cloud';
import type {
  CalendarMonthInput,
  CreateTodoInput,
  TodoView,
  UpdateTodoInput,
} from '../lib/shared/types/index';

export const TodoService = {
  create(input: CreateTodoInput): Promise<TodoView> {
    return callFunction<TodoView>('todo-create', { ...input });
  },

  update(input: UpdateTodoInput): Promise<TodoView> {
    return callFunction<TodoView>('todo-update', { ...input });
  },

  listByMonth(input: CalendarMonthInput): Promise<TodoView[]> {
    return callFunction<TodoView[]>('todo-list', { ...input });
  },
};

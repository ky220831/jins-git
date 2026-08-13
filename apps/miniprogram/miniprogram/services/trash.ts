import { callFunction } from '../api/cloud';
import type {
  TrashActionInput,
  TrashBatchInput,
  TrashItemView,
  TrashListInput,
} from '../lib/shared/types/index';

export const TrashService = {
  list(input?: TrashListInput): Promise<TrashItemView[]> {
    return callFunction<TrashItemView[]>('trash', { action: 'list', ...(input || {}) });
  },
  restore(input: TrashActionInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('trash', { action: 'restore', ...input });
  },
  purge(input: TrashActionInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('trash', { action: 'purge', ...input });
  },
  restoreMany(input: TrashBatchInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('trash', { action: 'restore-many', ...input });
  },
  purgeMany(input: TrashBatchInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('trash', { action: 'purge-many', ...input });
  },
  purgeAll(): Promise<number> {
    return callFunction<number>('trash', { action: 'purge-all' });
  },
};

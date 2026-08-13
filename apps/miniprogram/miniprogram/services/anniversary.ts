import { callFunction } from '../api/cloud';
import type {
  AnniversaryView,
  CreateAnniversaryInput,
  DeleteAnniversaryInput,
  UpdateAnniversaryInput,
} from '../lib/shared/types/index';

export const AnniversaryService = {
  list(): Promise<AnniversaryView[]> {
    return callFunction<AnniversaryView[]>('anniversary', { action: 'list' });
  },
  create(input: CreateAnniversaryInput): Promise<AnniversaryView> {
    return callFunction<AnniversaryView>('anniversary', { action: 'create', ...input });
  },
  update(input: UpdateAnniversaryInput): Promise<AnniversaryView> {
    return callFunction<AnniversaryView>('anniversary', { action: 'update', ...input });
  },
  remove(input: DeleteAnniversaryInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('anniversary', { action: 'delete', ...input });
  },
};

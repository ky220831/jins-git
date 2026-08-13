import cloud from 'wx-server-sdk';
import type {
  TrashActionInput,
  TrashBatchInput,
  TrashItemView,
  TrashListInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { TrashService } from '../../_shared/trashService';

const service = new TrashService(new CloudRepo());

type TrashEvent =
  | ({ action: 'list' } & TrashListInput)
  | ({ action: 'restore' } & TrashActionInput)
  | ({ action: 'purge' } & TrashActionInput)
  | ({ action: 'restore-many' } & TrashBatchInput)
  | ({ action: 'purge-many' } & TrashBatchInput)
  | { action: 'purge-all' };

export const main = createHandler<TrashEvent, TrashItemView[] | { ok: true } | number>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'restore') {
    await service.restore(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'restore-many') {
    await service.restoreMany(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'purge') {
    await service.purge(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'purge-many') {
    await service.purgeMany(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'purge-all') {
    return service.purgeAll(OPENID);
  }
  return service.list(OPENID, event);
});

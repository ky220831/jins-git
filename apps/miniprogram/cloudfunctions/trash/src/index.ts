import cloud from 'wx-server-sdk';
import type { TrashActionInput, TrashItemView, TrashListInput } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { TrashService } from '../../_shared/trashService';

const service = new TrashService(new CloudRepo());

type TrashEvent =
  | ({ action: 'list' } & TrashListInput)
  | ({ action: 'restore' } & TrashActionInput)
  | ({ action: 'purge' } & TrashActionInput);

export const main = createHandler<TrashEvent, TrashItemView[] | { ok: true }>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'restore') {
    await service.restore(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'purge') {
    await service.purge(OPENID, event);
    return { ok: true };
  }
  return service.list(OPENID, event);
});

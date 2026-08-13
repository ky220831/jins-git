import cloud from 'wx-server-sdk';
import type {
  AnniversaryView,
  CreateAnniversaryInput,
  DeleteAnniversaryInput,
  UpdateAnniversaryInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { AnniversaryService } from '../../_shared/anniversaryService';

const service = new AnniversaryService(new CloudRepo());

type AnniversaryEvent =
  | { action: 'list' }
  | ({ action: 'create' } & CreateAnniversaryInput)
  | ({ action: 'update' } & UpdateAnniversaryInput)
  | ({ action: 'delete' } & DeleteAnniversaryInput);

export const main = createHandler<
  AnniversaryEvent,
  AnniversaryView[] | AnniversaryView | { ok: true }
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'create') return service.create(OPENID, event);
  if (event?.action === 'update') return service.update(OPENID, event);
  if (event?.action === 'delete') {
    await service.remove(OPENID, event);
    return { ok: true };
  }
  return service.list(OPENID);
});

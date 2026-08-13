import cloud from 'wx-server-sdk';
import type { CreateSpaceResult, GetMySpaceResult } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { SpaceService } from '../../_shared/spaceService';

const service = new SpaceService(new CloudRepo());

type SpaceInfoEvent = { action?: 'regen-invite' };

export const main = createHandler<SpaceInfoEvent, GetMySpaceResult | CreateSpaceResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'regen-invite') {
    return service.regenerateInviteCode(OPENID);
  }
  return service.getMySpace(OPENID);
});

import cloud from 'wx-server-sdk';
import type { CreateSpaceResult, GetMySpaceResult, SetNicknameInput } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { SpaceService } from '../../_shared/spaceService';

const service = new SpaceService(new CloudRepo());

type SpaceInfoEvent =
  | { action?: 'regen-invite' }
  | ({ action: 'set-nickname' } & SetNicknameInput);

export const main = createHandler<SpaceInfoEvent, GetMySpaceResult | CreateSpaceResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'regen-invite') {
    return service.regenerateInviteCode(OPENID);
  }
  if (event?.action === 'set-nickname') {
    return service.setNickname(OPENID, event);
  }
  return service.getMySpace(OPENID);
});

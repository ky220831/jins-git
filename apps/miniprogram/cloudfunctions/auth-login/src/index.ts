import cloud from 'wx-server-sdk';
import type { LoginResult } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { SpaceService } from '../../_shared/spaceService';

const service = new SpaceService(new CloudRepo());

export const main = createHandler<Record<string, never>, LoginResult>(async () => {
  const { OPENID } = cloud.getWXContext();
  return service.login(OPENID);
});

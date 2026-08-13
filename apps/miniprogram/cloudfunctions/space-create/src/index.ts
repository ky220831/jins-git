import cloud from 'wx-server-sdk';
import type { CreateSpaceInput, CreateSpaceResult } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { SpaceService } from '../../_shared/spaceService';

const service = new SpaceService(new CloudRepo());

export const main = createHandler<CreateSpaceInput, CreateSpaceResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  return service.createSpace(OPENID, event);
});

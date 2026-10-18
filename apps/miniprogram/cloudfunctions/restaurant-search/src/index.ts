import cloud from 'wx-server-sdk';
import type { RestaurantSearchInput, RestaurantSearchResult } from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { enforceRateLimit } from '../../_shared/rateLimit';
import { LbsRestaurantSearchProvider } from '../../_shared/restaurantSearchProvider';

const provider = new LbsRestaurantSearchProvider();
const repo = new CloudRepo();

export const main = createHandler<RestaurantSearchInput, RestaurantSearchResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { userId } = await requireSpaceMember(repo, OPENID);
  await enforceRateLimit(repo, userId, 'restaurantSearch');
  return provider.search(event);
});

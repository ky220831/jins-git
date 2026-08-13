import type { RestaurantSearchInput, RestaurantSearchResult } from '../../../../../packages/types/src';
import { createHandler } from '../../_shared/handler';
import { LbsRestaurantSearchProvider } from '../../_shared/restaurantSearchProvider';

const provider = new LbsRestaurantSearchProvider();

export const main = createHandler<RestaurantSearchInput, RestaurantSearchResult>(async (event) => {
  return provider.search(event);
});

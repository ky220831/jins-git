import cloud from 'wx-server-sdk';
import type {
  CalendarMonthInput,
  CreateRestaurantInput,
  CreateRestaurantVisitInput,
  DeleteRestaurantInput,
  DeleteRestaurantVisitInput,
  OfflineRestaurantVisitInput,
  RestaurantView,
  RestaurantVisitView,
  UpdateRestaurantInput,
  UpdateRestaurantVisitInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { RestaurantService } from '../../_shared/restaurantService';

const service = new RestaurantService(new CloudRepo());

type RestaurantEvent =
  | { action: 'list' }
  | ({ action: 'create' } & CreateRestaurantInput)
  | ({ action: 'update' } & UpdateRestaurantInput)
  | ({ action: 'delete' } & DeleteRestaurantInput)
  | ({ action: 'visits-month' } & CalendarMonthInput)
  | ({ action: 'create-visit' } & CreateRestaurantVisitInput)
  | ({ action: 'update-visit' } & UpdateRestaurantVisitInput)
  | ({ action: 'offline-visit' } & OfflineRestaurantVisitInput)
  | ({ action: 'delete-visit' } & DeleteRestaurantVisitInput);

export const main = createHandler<
  RestaurantEvent,
  RestaurantView[] | RestaurantView | RestaurantVisitView[] | RestaurantVisitView | { ok: true }
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'create') return service.createRestaurant(OPENID, event);
  if (event?.action === 'update') return service.updateRestaurant(OPENID, event);
  if (event?.action === 'delete') {
    await service.deleteRestaurant(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'create-visit') return service.createVisit(OPENID, event);
  if (event?.action === 'update-visit') return service.updateVisit(OPENID, event);
  if (event?.action === 'offline-visit') return service.offlineVisit(OPENID, event);
  if (event?.action === 'delete-visit') {
    await service.deleteVisit(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'visits-month') return service.listVisitsByMonth(OPENID, event);
  return service.listRestaurants(OPENID);
});

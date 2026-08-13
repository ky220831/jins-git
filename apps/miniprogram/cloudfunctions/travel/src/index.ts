import cloud from 'wx-server-sdk';
import type {
  CalendarMonthInput,
  CreateTripInput,
  CreateTripPlanInput,
  DeleteTripInput,
  DeleteTripPlanInput,
  OfflineTripPlanInput,
  TripPlanView,
  TripView,
  UpdateTripInput,
  UpdateTripPlanInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { TravelService } from '../../_shared/travelService';

const service = new TravelService(new CloudRepo());

type TravelEvent =
  | { action: 'trips' }
  | ({ action: 'create-trip' } & CreateTripInput)
  | ({ action: 'update-trip' } & UpdateTripInput)
  | ({ action: 'delete-trip' } & DeleteTripInput)
  | ({ action: 'plans-month' } & CalendarMonthInput)
  | ({ action: 'create-plan' } & CreateTripPlanInput)
  | ({ action: 'update-plan' } & UpdateTripPlanInput)
  | ({ action: 'offline-plan' } & OfflineTripPlanInput)
  | ({ action: 'delete-plan' } & DeleteTripPlanInput);

export const main = createHandler<
  TravelEvent,
  TripView[] | TripView | TripPlanView[] | TripPlanView | { ok: true }
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'create-trip') return service.createTrip(OPENID, event);
  if (event?.action === 'update-trip') return service.updateTrip(OPENID, event);
  if (event?.action === 'delete-trip') {
    await service.deleteTrip(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'create-plan') return service.createPlan(OPENID, event);
  if (event?.action === 'update-plan') return service.updatePlan(OPENID, event);
  if (event?.action === 'offline-plan') return service.offlinePlan(OPENID, event);
  if (event?.action === 'delete-plan') {
    await service.deletePlan(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'plans-month') return service.listPlansByMonth(OPENID, event);
  return service.listTrips(OPENID);
});

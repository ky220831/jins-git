import { callFunction } from '../api/cloud';
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
} from '../lib/shared/types/index';

export const TravelService = {
  trips(): Promise<TripView[]> {
    return callFunction<TripView[]>('travel', { action: 'trips' });
  },
  createTrip(input: CreateTripInput): Promise<TripView> {
    return callFunction<TripView>('travel', { action: 'create-trip', ...input });
  },
  updateTrip(input: UpdateTripInput): Promise<TripView> {
    return callFunction<TripView>('travel', { action: 'update-trip', ...input });
  },
  deleteTrip(input: DeleteTripInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('travel', { action: 'delete-trip', ...input });
  },
  plansMonth(input: CalendarMonthInput): Promise<TripPlanView[]> {
    return callFunction<TripPlanView[]>('travel', { action: 'plans-month', ...input });
  },
  createPlan(input: CreateTripPlanInput): Promise<TripPlanView> {
    return callFunction<TripPlanView>('travel', { action: 'create-plan', ...input });
  },
  updatePlan(input: UpdateTripPlanInput): Promise<TripPlanView> {
    return callFunction<TripPlanView>('travel', { action: 'update-plan', ...input });
  },
  offlinePlan(input: OfflineTripPlanInput): Promise<TripPlanView> {
    return callFunction<TripPlanView>('travel', { action: 'offline-plan', ...input });
  },
  deletePlan(input: DeleteTripPlanInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('travel', { action: 'delete-plan', ...input });
  },
};

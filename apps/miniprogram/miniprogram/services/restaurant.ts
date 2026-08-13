import { callFunction } from '../api/cloud';
import type {
  CalendarMonthInput,
  CreateRestaurantInput,
  CreateRestaurantVisitInput,
  DeleteRestaurantInput,
  DeleteRestaurantVisitInput,
  OfflineRestaurantVisitInput,
  RestaurantImagesResult,
  RestaurantOcrDraft,
  RestaurantOcrInput,
  RestaurantSearchInput,
  RestaurantSearchResult,
  RestaurantView,
  RestaurantVisitView,
  UpdateRestaurantInput,
  UpdateRestaurantVisitInput,
} from '../lib/shared/types/index';

export const RestaurantService = {
  list(): Promise<RestaurantView[]> {
    return callFunction<RestaurantView[]>('restaurant', { action: 'list' });
  },
  create(input: CreateRestaurantInput): Promise<RestaurantView> {
    return callFunction<RestaurantView>('restaurant', { action: 'create', ...input });
  },
  update(input: UpdateRestaurantInput): Promise<RestaurantView> {
    return callFunction<RestaurantView>('restaurant', { action: 'update', ...input });
  },
  remove(input: DeleteRestaurantInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('restaurant', { action: 'delete', ...input });
  },
  visitsMonth(input: CalendarMonthInput): Promise<RestaurantVisitView[]> {
    return callFunction<RestaurantVisitView[]>('restaurant', { action: 'visits-month', ...input });
  },
  createVisit(input: CreateRestaurantVisitInput): Promise<RestaurantVisitView> {
    return callFunction<RestaurantVisitView>('restaurant', { action: 'create-visit', ...input });
  },
  updateVisit(input: UpdateRestaurantVisitInput): Promise<RestaurantVisitView> {
    return callFunction<RestaurantVisitView>('restaurant', { action: 'update-visit', ...input });
  },
  offlineVisit(input: OfflineRestaurantVisitInput): Promise<RestaurantVisitView> {
    return callFunction<RestaurantVisitView>('restaurant', { action: 'offline-visit', ...input });
  },
  removeVisit(input: DeleteRestaurantVisitInput): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('restaurant', { action: 'delete-visit', ...input });
  },
};

export const RestaurantSearchService = {
  search(input: RestaurantSearchInput): Promise<RestaurantSearchResult> {
    return callFunction<RestaurantSearchResult>('restaurant-search', { ...input });
  },
};

export const RestaurantOcrService = {
  recognize(input: RestaurantOcrInput): Promise<RestaurantOcrDraft> {
    return callFunction<RestaurantOcrDraft>('restaurant-ocr', { ...input });
  },
};

export const RestaurantImagesService = {
  tempUrls(fileIDs: string[]): Promise<RestaurantImagesResult> {
    return callFunction<RestaurantImagesResult>('restaurant-images', { fileIDs });
  },
};

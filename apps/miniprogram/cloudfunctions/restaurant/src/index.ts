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
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { ReminderService } from '../../_shared/reminderService';
import { RestaurantService } from '../../_shared/restaurantService';

const service = new RestaurantService(new CloudRepo());
const repo = new CloudRepo();

/** 餐厅行程新增/编辑后，给已授权的另一方发一次性订阅消息（失败不影响主流程） */
async function notifyVisitChange(
  openid: string,
  visit: RestaurantVisitView,
): Promise<void> {
  try {
    const { spaceId } = await requireSpaceMember(repo, openid);
    await new ReminderService(repo).notifyChange(
      spaceId,
      'visit',
      `下馆子已更新：${visit.name}`,
      visit.date,
      visit.time || undefined,
      openid,
    );
  } catch {
    // 通知失败不阻塞保存
  }
}

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
  if (event?.action === 'create-visit') {
    const visit = await service.createVisit(OPENID, event);
    await notifyVisitChange(OPENID, visit);
    return visit;
  }
  if (event?.action === 'update-visit') {
    const visit = await service.updateVisit(OPENID, event);
    await notifyVisitChange(OPENID, visit);
    return visit;
  }
  if (event?.action === 'offline-visit') return service.offlineVisit(OPENID, event);
  if (event?.action === 'delete-visit') {
    await service.deleteVisit(OPENID, event);
    return { ok: true };
  }
  if (event?.action === 'visits-month') return service.listVisitsByMonth(OPENID, event);
  return service.listRestaurants(OPENID);
});

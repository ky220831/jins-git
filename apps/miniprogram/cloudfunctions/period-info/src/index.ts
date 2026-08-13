import cloud from 'wx-server-sdk';
import type {
  PeriodInfoResult,
  SetPeriodVisibilityInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { PeriodService } from '../../_shared/periodService';

const service = new PeriodService(new CloudRepo());

type PeriodInfoEvent =
  | { action?: 'info' }
  | ({ action: 'set-visible' } & SetPeriodVisibilityInput);

export const main = createHandler<PeriodInfoEvent, PeriodInfoResult | { visible: boolean }>(
  async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (event?.action === 'set-visible') {
      return service.setCalendarVisible(OPENID, event);
    }
    return service.info(OPENID);
  },
);

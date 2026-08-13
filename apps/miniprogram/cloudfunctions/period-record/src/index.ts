import cloud from 'wx-server-sdk';
import type {
  DeletePeriodInput,
  PeriodRecordView,
  RecordPeriodInput,
} from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { PeriodService } from '../../_shared/periodService';

const service = new PeriodService(new CloudRepo());

type PeriodRecordEvent =
  | ({ action: 'add' } & RecordPeriodInput)
  | { action: 'list' }
  | ({ action: 'delete' } & DeletePeriodInput);

export const main = createHandler<PeriodRecordEvent, PeriodRecordView[] | { ok: true }>(
  async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (event?.action === 'add') {
      return service.recordActual(OPENID, event);
    }
    if (event?.action === 'delete') {
      await service.delete(OPENID, event);
      return { ok: true };
    }
    return service.list(OPENID);
  },
);

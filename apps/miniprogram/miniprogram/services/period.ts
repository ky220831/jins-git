import { callFunction } from '../api/cloud';
import type {
  PeriodInfoResult,
  PeriodRecordView,
  RecordPeriodInput,
  UpdatePeriodEndInput,
} from '../lib/shared/types/index';

export const PeriodService = {
  /** 今日状态 + 记录 + 下次预测 + 显示开关 */
  info(): Promise<PeriodInfoResult> {
    return callFunction<PeriodInfoResult>('period-info', {});
  },

  setVisible(visible: boolean): Promise<{ visible: boolean }> {
    return callFunction<{ visible: boolean }>('period-info', { action: 'set-visible', visible });
  },

  record(input: RecordPeriodInput): Promise<PeriodRecordView[]> {
    return callFunction<PeriodRecordView[]>('period-record', { action: 'add', ...input });
  },

  updateEnd(input: UpdatePeriodEndInput): Promise<PeriodRecordView[]> {
    return callFunction<PeriodRecordView[]>('period-record', { action: 'update-end', ...input });
  },

  list(): Promise<PeriodRecordView[]> {
    return callFunction<PeriodRecordView[]>('period-record', { action: 'list' });
  },

  remove(recordId: string): Promise<{ ok: true }> {
    return callFunction<{ ok: true }>('period-record', { action: 'delete', recordId });
  },
};

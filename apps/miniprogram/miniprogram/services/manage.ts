import { callFunction } from '../api/cloud';
import type { ExportDataResult, ManageOverview } from '../lib/shared/types/index';

export const ManageService = {
  overview(): Promise<ManageOverview> {
    return callFunction<ManageOverview>('manage', { action: 'overview' });
  },
  exportJson(): Promise<ExportDataResult> {
    return callFunction<ExportDataResult>('manage', { action: 'export' });
  },
};

import { callFunction } from '../api/cloud';
import type {
  GrantReminderInput,
  ReminderConfigResult,
  ReminderTopic,
} from '../lib/shared/types/index';

export const ReminderService = {
  config(): Promise<ReminderConfigResult> {
    return callFunction<ReminderConfigResult>('reminder', { action: 'config' });
  },

  grant(topic: ReminderTopic): Promise<{ ok: true }> {
    const input: GrantReminderInput = { topic };
    return callFunction<{ ok: true }>('reminder', { action: 'grant', ...input });
  },
};

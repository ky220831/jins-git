import cloud from 'wx-server-sdk';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { REMINDER_TEMPLATES, type ReminderTopic } from '../../_shared/constants';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import { ReminderService } from '../../_shared/reminderService';

const repo = new CloudRepo();
const service = new ReminderService(repo);

export interface ReminderConfigResult {
  topics: {
    topic: ReminderTopic;
    configured: boolean;
    templateId: string;
  }[];
}

type ReminderEvent =
  | { action: 'config' }
  | { action: 'grant'; topic: ReminderTopic };

export const main = createHandler<ReminderEvent, ReminderConfigResult | { ok: true }>(
  async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (event?.action === 'grant') {
      const { spaceId } = await requireSpaceMember(repo, OPENID);
      const topic = event.topic as ReminderTopic;
      if (!(topic in REMINDER_TEMPLATES)) {
        throw new AppError(ErrorCodes.VALIDATION, '不支持的提醒类型');
      }
      try {
        await service.grant(OPENID, spaceId, topic);
      } catch {
        throw new AppError(ErrorCodes.VALIDATION, '提醒模板尚未配置，请先在后台选用模板');
      }
      return { ok: true };
    }
    // config：客户端据此显示“开启提醒”按钮
    const topics = (Object.keys(REMINDER_TEMPLATES) as ReminderTopic[]).map((topic) => ({
      topic,
      configured: !!REMINDER_TEMPLATES[topic].templateId,
      templateId: REMINDER_TEMPLATES[topic].templateId,
    }));
    return { topics };
  },
);

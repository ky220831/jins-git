import type { ReminderTopic } from '../lib/shared/types/index';
import { ReminderService } from '../services/reminders';

/** 点击“开启提醒”：先取模板配置，再请求用户订阅授权，最后记录一次性授权 */
export async function enableReminder(topic: ReminderTopic): Promise<void> {
  const cfg = await ReminderService.config();
  const t = cfg.topics.find((x) => x.topic === topic);
  if (!t || !t.configured || !t.templateId) {
    wx.showToast({ title: '提醒模板尚未配置', icon: 'none' });
    return;
  }
  const res = await wx.requestSubscribeMessage({ tmplIds: [t.templateId] });
  if (res && res[t.templateId] === 'accept') {
    await ReminderService.grant(topic);
    wx.showToast({ title: '已开启提醒', icon: 'success' });
  } else {
    wx.showToast({ title: '未授权，不会收到提醒', icon: 'none' });
  }
}

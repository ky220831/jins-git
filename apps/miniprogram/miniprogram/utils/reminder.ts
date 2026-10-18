import type { ReminderTopic } from '../lib/shared/types/index';
import { ReminderService } from '../services/reminders';

/**
 * 前端模板 ID 常量（与后端 _shared/constants.ts 保持一致）。
 * 必须放在这里：wx.requestSubscribeMessage 只能在用户点击的同一次调用里同步触发，
 * 不能先 await 云函数再弹授权（会提示“开启失败”）。
 */
const CLIENT_REMINDER_TEMPLATES: Partial<Record<ReminderTopic, string>> = {
  anniversary: '1ng1-0er5XGCXPwvoBOllnRJmQxDqN1mk-Sy4gSWWJk',
  meal: 'N5jv5qGBh-rBB3qeKvC1Tr7Q2KBD9p0lMlb81Z5W1TY',
  visit: 'N5jv5qGBh-rBB3qeKvC1Tr7Q2KBD9p0lMlb81Z5W1TY',
};

/** 点击“开启提醒”：同步请求授权（保留用户点击手势），同意后再异步记录一次性授权 */
export function enableReminder(topic: ReminderTopic): void {
  const templateId = CLIENT_REMINDER_TEMPLATES[topic];
  if (!templateId) {
    wx.showToast({ title: '提醒模板尚未配置', icon: 'none' });
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success: (res) => {
      if (res && res[templateId] === 'accept') {
        ReminderService.grant(topic)
          .then(() => {
            wx.showToast({ title: '已开启提醒', icon: 'success' });
          })
          .catch(() => {
            wx.showToast({ title: '开启失败，请重试', icon: 'none' });
          });
      } else {
        wx.showToast({ title: '未授权，不会收到提醒', icon: 'none' });
      }
    },
    fail: () => {
      wx.showToast({ title: '开启失败，请重试', icon: 'none' });
    },
  });
}

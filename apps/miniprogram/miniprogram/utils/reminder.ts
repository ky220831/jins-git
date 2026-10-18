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
export function enableReminder(topic: ReminderTopic): Promise<void> {
  const templateId = CLIENT_REMINDER_TEMPLATES[topic];
  if (!templateId) {
    return Promise.reject(new Error('提醒模板尚未配置'));
  }
  // wx.requestSubscribeMessage 必须在本函数调用栈内同步发起，结果用 Promise 通知页面
  return new Promise<void>((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res && res[templateId] === 'accept') {
          ReminderService.grant(topic)
            .then(() => {
              wx.showToast({ title: '已开启提醒', icon: 'success' });
              resolve();
            })
            .catch(() => {
              reject(new Error('开启失败，请重试'));
            });
        } else {
          reject(new Error('未授权，不会收到提醒'));
        }
      },
      fail: () => {
        reject(new Error('开启失败，请重试'));
      },
    });
  });
}

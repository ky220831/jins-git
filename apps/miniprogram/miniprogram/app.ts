import { ENV_ID } from './config/env';

/** 全局错误上报（v1.1.18）：写 client_logs 集合，便于真机问题排查；失败静默 */
function reportError(message: string, stack: string, page: string): void {
  try {
    wx.cloud.callFunction({
      name: 'client-log',
      data: { message, stack, page },
    });
  } catch {
    // 静默：上报失败不影响业务
  }
}

App<IAppOption>({
  globalData: {},

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云能力，请在开发者工具中升级基础库');
      return;
    }
    // 只有一个云环境时留空即可（使用默认环境）；多环境时在 config/env.ts 填入环境 ID
    wx.cloud.init(ENV_ID ? { env: ENV_ID, traceUser: true } : { traceUser: true });
  },

  onError(msg: string) {
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route || '' : '';
    reportError(msg || 'unknown error', '', route);
  },

  onUnhandledRejection(res: { reason?: unknown }) {
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route || '' : '';
    const reason = res?.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'unhandledRejection');
    const stack = reason instanceof Error ? reason.stack || '' : '';
    reportError(message, stack, route);
  },
});

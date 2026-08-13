import { ENV_ID } from './config/env';

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
});

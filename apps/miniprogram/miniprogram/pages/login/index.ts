import { ApiError } from '../../api/cloud';
import { AuthService } from '../../services/auth';
import { SpaceService } from '../../services/space';
import { currentThemeClass, themeBgPath } from '../../utils/theme';

Page({
  data: {
    themeClass: currentThemeClass(),
    themeBg: themeBgPath(),
    logging: false,
    error: '',
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass(), themeBg: themeBgPath() });
    // 已登录且已有空间时，直接进入首页；否则停留在登录页
    SpaceService.mySpace()
      .then(() => {
        wx.reLaunch({ url: '/pages/calendar/index' });
      })
      .catch(() => {
        // 未登录或无空间：停留在登录页
      });
  },

  async onLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true, error: '' });
    try {
      const res = await AuthService.login();
      if (res.hasSpace) {
        wx.reLaunch({ url: '/pages/calendar/index' });
      } else {
        wx.navigateTo({ url: '/pages/space/index' });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '登录失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
      this.setData({ error: message });
    } finally {
      this.setData({ logging: false });
    }
  },
});

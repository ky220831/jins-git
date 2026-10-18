import { currentThemeClass, themeBgPath } from '../../utils/theme';

Page({
  data: {
    themeClass: currentThemeClass(),
    themeBg: themeBgPath(),
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass(), themeBg: themeBgPath() });
  },

  onCreateSpace() {
    wx.navigateTo({ url: '/pages/space-create/index' });
  },

  onJoinSpace() {
    wx.navigateTo({ url: '/pages/space-join/index' });
  },
});

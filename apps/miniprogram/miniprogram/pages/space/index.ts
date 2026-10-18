import { currentThemeClass } from '../../utils/theme';

Page({
  data: {
    themeClass: currentThemeClass(),
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass() });
  },

  onCreateSpace() {
    wx.navigateTo({ url: '/pages/space-create/index' });
  },

  onJoinSpace() {
    wx.navigateTo({ url: '/pages/space-join/index' });
  },
});

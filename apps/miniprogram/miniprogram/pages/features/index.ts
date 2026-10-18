import { ApiError } from '../../api/cloud';
import { ROLE_OWNER } from '../../lib/shared/types/index';
import { SpaceService } from '../../services/space';
import { currentThemeClass, setThemeAuto, themeAutoEnabled } from '../../utils/theme';

Page({
  data: {
    themeClass: currentThemeClass(),
    themeAuto: themeAutoEnabled(),
    isOwner: false,
    loading: true,
    error: '',
  },

  onShow() {
    SpaceService.mySpace()
      .then((res) => {
        this.setData({
          isOwner: res.space.myRole === ROLE_OWNER,
          loading: false,
          error: '',
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err instanceof ApiError ? err.message : '加载失败',
        });
      });
  },

  onOpenMeal() {
    wx.navigateTo({ url: '/pages/meal/index' });
  },

  onOpenRestaurant() {
    wx.navigateTo({ url: '/pages/restaurant/index' });
  },

  onOpenAnniversary() {
    wx.navigateTo({ url: '/pages/anniversary/index' });
  },

  onOpenTravel() {
    wx.navigateTo({ url: '/pages/travel/index' });
  },

  onOpenPeriod() {
    wx.navigateTo({ url: '/pages/period/index' });
  },

  onOpenManage() {
    wx.navigateTo({ url: '/pages/manage/index' });
  },

  onToggleTheme(e: WechatMiniprogram.SwitchChange) {
    const enabled = !!e.detail.value;
    setThemeAuto(enabled);
    this.setData({ themeAuto: enabled, themeClass: currentThemeClass() });
  },
});

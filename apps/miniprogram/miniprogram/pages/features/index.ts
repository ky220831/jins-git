import { ApiError } from '../../api/cloud';
import { ROLE_OWNER } from '../../lib/shared/types/index';
import { moduleLabels } from '../../lib/shared/tokens/index';
import { SpaceService } from '../../services/space';
import { currentThemeClass, setThemeAuto, themeAutoEnabled } from '../../utils/theme';

interface FeatureItem {
  key: string;
  icon: string;
  label: string;
  sub: string;
}

/** 默认功能列表：进入页面立即渲染，避免空白闪现；onShow 后仅更新主/副文案 */
const DEFAULT_FEATURE_LIST: FeatureItem[] = [
  { key: 'meal', icon: moduleLabels.meal.icon, label: moduleLabels.meal.label, sub: '今天想吃什么 · 随机选 · 素材库' },
  { key: 'restaurant', icon: moduleLabels.restaurant.icon, label: moduleLabels.restaurant.label, sub: '收藏想去的餐厅 · 行程 · 搜索' },
  { key: 'anniversary', icon: moduleLabels.anniversary.icon, label: moduleLabels.anniversary.label, sub: '属于我们的日子 · 每年重复' },
  { key: 'trip', icon: moduleLabels.trip.icon, label: moduleLabels.trip.label, sub: '去过的国家和城市' },
  { key: 'period', icon: moduleLabels.period.icon, label: moduleLabels.period.label, sub: '记录与预测 · 日历显示开关' },
  { key: 'manage', icon: moduleLabels.manage.icon, label: moduleLabels.manage.label, sub: '回收站 · 数据 · 家庭' },
];

Page({
  data: {
    themeClass: currentThemeClass(),
    themeAuto: themeAutoEnabled(),
    isOwner: false,
    featureList: DEFAULT_FEATURE_LIST,
    loading: true,
    error: '',
  },

  buildFeatureList(isOwner: boolean) {
    const list = DEFAULT_FEATURE_LIST.map((item) =>
      item.key === 'manage'
        ? { ...item, sub: isOwner ? '回收站 · 数据 · 家庭' : '副管理' }
        : item,
    );
    this.setData({ featureList: list });
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass() });
    const tabBar = (this as unknown as { getTabBar?: () => { setData(d: Record<string, unknown>): void } }).getTabBar?.();
    if (tabBar) {
      tabBar.setData({ selected: 1, themeClass: currentThemeClass() });
    }
    SpaceService.mySpace()
      .then((res) => {
        this.buildFeatureList(res.space.myRole === ROLE_OWNER);
        this.setData({
          isOwner: res.space.myRole === ROLE_OWNER,
          loading: false,
          error: '',
        });
      })
      .catch((err) => {
        this.buildFeatureList(false);
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

  onOpenFeature(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const routes: Record<string, string> = {
      meal: '/pages/meal/index',
      restaurant: '/pages/restaurant/index',
      anniversary: '/pages/anniversary/index',
      trip: '/pages/travel/index',
      period: '/pages/period/index',
      manage: '/pages/manage/index',
    };
    const route = routes[key];
    if (route) {
      wx.navigateTo({ url: route });
    }
  },

  onToggleTheme(e: WechatMiniprogram.SwitchChange) {
    const enabled = !!e.detail.value;
    setThemeAuto(enabled);
    this.setData({ themeAuto: enabled, themeClass: currentThemeClass() });
  },
});

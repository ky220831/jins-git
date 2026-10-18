// 自定义导航栏：背景跟随月度/昼夜主题，适配状态栏与右上角胶囊按钮，标题完整显示
Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
  },
  data: {
    statusBarHeight: 20,
    navHeight: 44,
    capsuleRight: 0,
  },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      let menu;
      try {
        menu = wx.getMenuButtonBoundingClientRect();
      } catch {
        menu = null;
      }
      const statusBarHeight = info.statusBarHeight || 20;
      let navHeight = 44;
      let capsuleRight = 0;
      if (menu && menu.top > 0) {
        navHeight = (menu.top - statusBarHeight) * 2 + menu.height;
        capsuleRight = info.windowWidth - menu.left;
      }
      this.setData({ statusBarHeight, navHeight, capsuleRight });
    },
  },
  methods: {
    onBack() {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.reLaunch({ url: '/pages/calendar/index' });
        },
      });
    },
  },
});

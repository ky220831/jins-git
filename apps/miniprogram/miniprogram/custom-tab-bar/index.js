// 自定义底部导航：背景跟随月度主题/昼夜（解决原生 tabBar 无法动态配色、底色不铺满的问题）
Component({
  options: {
    // 允许 app.wxss 中的主题类（theme-m* / theme-period-*）作用于组件根节点，
    // 使底部导航背景跟随月度主题与昼夜模式
    styleIsolation: 'apply-shared',
  },
  data: {
    selected: 0,
    themeClass: 'theme-base',
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index || 0);
      const url = index === 0 ? '/pages/calendar/index' : '/pages/features/index';
      wx.switchTab({ url });
    },
  },
});

/**
 * 月度季节自动换肤（1.0.16）：
 * 默认开启，按公历当前月份套用 theme-m1 ~ theme-m12 微渐变；
 * 用户可在功能页关闭，关闭后锁定基础风格 theme-base。
 */
const THEME_AUTO_KEY = 'themeAuto';

export function themeAutoEnabled(): boolean {
  return wx.getStorageSync(THEME_AUTO_KEY) !== false;
}

export function setThemeAuto(enabled: boolean): void {
  wx.setStorageSync(THEME_AUTO_KEY, enabled);
}

export function currentThemeClass(): string {
  if (!themeAutoEnabled()) return 'theme-base';
  const now = new Date();
  return `theme-m${now.getMonth() + 1}`;
}

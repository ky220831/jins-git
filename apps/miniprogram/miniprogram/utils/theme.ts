/**
 * 随时节动态换肤（v1.2）：
 * 1) 二十四节气 → 专属配色 theme-jq-1..24（低饱和渐变背景）
 * 2) 传统节日 → 叠加 theme-festival-*（轻量点缀色）
 * 3) 昼夜三档 → theme-period-day / dusk / night（夜间自动深色可读）
 * 只替换 CSS 变量与背景纹理，页面布局结构不变。
 * 默认开启，用户可在功能页关闭，关闭后锁定基础风格 theme-base。
 */
import { themeDayContext, type DayPeriod } from './solar';

const THEME_AUTO_KEY = 'themeAuto';
const THEME_PERIOD_KEY = 'themePeriod'; // 'auto' | 'day' | 'dusk' | 'night'
const THEME_NIGHT_KEY = 'themeNight'; // 独立夜间模式开关（1.1.18）

/** 换肤绑定日历查看的月份（1.1.18 规划落地）：日历翻到哪个月，全局皮肤/背景图跟随哪个月 */
let viewedMonth = 0;

export function setThemeMonth(month: number): void {
  viewedMonth = month >= 1 && month <= 12 ? month : 0;
}

function effectiveMonth(ctx: { month: number }): number {
  return viewedMonth >= 1 && viewedMonth <= 12 ? viewedMonth : ctx.month;
}

export function themeAutoEnabled(): boolean {
  return wx.getStorageSync(THEME_AUTO_KEY) !== false;
}

export function setThemeAuto(enabled: boolean): void {
  wx.setStorageSync(THEME_AUTO_KEY, enabled);
}

export function periodPreference(): 'auto' | DayPeriod {
  const v = wx.getStorageSync(THEME_PERIOD_KEY);
  return v === 'day' || v === 'dusk' || v === 'night' ? v : 'auto';
}

export function setPeriodPreference(p: 'auto' | DayPeriod): void {
  wx.setStorageSync(THEME_PERIOD_KEY, p);
}

/** 独立夜间模式开关：开启后强制夜间深色，与“随时节自动换肤”互不干扰 */
export function nightModeEnabled(): boolean {
  return wx.getStorageSync(THEME_NIGHT_KEY) === true;
}

export function setNightMode(enabled: boolean): void {
  wx.setStorageSync(THEME_NIGHT_KEY, enabled);
}

export function currentThemeClass(): string {
  applyStatusBarStyle();
  const auto = themeAutoEnabled();
  const night = nightModeEnabled();
  if (!auto && !night) return 'theme-base';
  const ctx = themeDayContext();
  const parts: string[] = [];
  // 每月专属主题（theme-m1..m12，配色集中配置在 design-tokens monthlyThemes）
  parts.push(`theme-m${effectiveMonth(ctx)}`);
  if (auto && ctx.festivalKey) parts.push(`theme-festival-${ctx.festivalKey}`);
  // 深浅只由「夜间模式」开关决定；自动换肤不再强制夜间（夜晚自动回退白天档，保留黄昏微暖）
  const autoPeriod = periodPreference() === 'auto' ? ctx.period : periodPreference();
  const period: DayPeriod = night
    ? 'night'
    : auto
      ? autoPeriod === 'night'
        ? 'day'
        : autoPeriod
      : 'day';
  parts.push(`theme-period-${period}`);
  return parts.join(' ');
}

/** 状态栏文字颜色：浅色主题黑字，夜间白字（自定义导航时微信深色模式会强制黑状态栏，需显式声明 darkmode + 动态设置） */
export function applyStatusBarStyle(): void {
  try {
    wx.setNavigationBarColor({
      frontColor: nightModeEnabled() ? '#ffffff' : '#000000',
      backgroundColor: '#ffffff',
      animation: { duration: 0, timingFunc: 'linear' },
    });
  } catch {
    // 低版本基础库可能不支持，静默忽略
  }
}

/** 月度背景图本地路径（WXSS background-image 不支持本地图片，必须用 <image> 组件承载） */
export function themeBgPath(): string {
  if (!themeAutoEnabled()) return '';
  const ctx = themeDayContext();
  return `/images/theme-bg/m${effectiveMonth(ctx)}.jpg`;
}


/** 供功能页展示当前主题信息（节气/节日/昼夜） */
export function currentThemeInfo(): { term: string; festival: string; period: DayPeriod } {
  const ctx = themeDayContext();
  return {
    term: ctx.termName,
    festival: ctx.festivalName,
    period: periodPreference() === 'auto' ? ctx.period : periodPreference(),
  };
}

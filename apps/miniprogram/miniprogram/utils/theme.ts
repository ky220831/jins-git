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

export function currentThemeClass(): string {
  if (!themeAutoEnabled()) return 'theme-base';
  const ctx = themeDayContext();
  const parts: string[] = [];
  // 每月专属主题（theme-m1..m12，配色集中配置在 design-tokens monthlyThemes）
  parts.push(`theme-m${ctx.month}`);
  if (ctx.festivalKey) parts.push(`theme-festival-${ctx.festivalKey}`);
  const pref = periodPreference();
  parts.push(`theme-period-${pref === 'auto' ? ctx.period : pref}`);
  return parts.join(' ');
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

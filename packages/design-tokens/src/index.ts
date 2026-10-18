/**
 * 统一设计 Token V2（docs/13-新UI设计规范.md）。
 * 与 apps/miniprogram/miniprogram/style/theme.wxss 中的 CSS 变量保持一致。
 * 轻奢高级简约 · 随时节动态换肤：
 * - 固定层：品牌主色、正文色、分类语义色（任何主题不变）
 * - 动态层：节气专属背景 / 昼夜三档 / 节日点缀，只替换变量与背景纹理
 */

/** 固定层：品牌与分类语义色 */
export const tokens = {
  color: {
    bg: '#FAF8F4',
    surface: '#FFFFFF',
    text: '#3D3A3E',
    textSecondary: '#A5A1A8',
    border: '#EDE9E4',
    primary: '#F08A9B',
    primaryDeep: '#DD6F84',
    accent: '#E0A26B',
    blue: '#7FA8C9',
    red: '#D96E80',
    success: '#A8D8B9',
    danger: '#DE6B7C',
    purple: '#B48AB5',
    mint: '#7FB5AE',
    todo: '#B8B4BC',
    meal: '#E0A26B',
    restaurant: '#E18FA0',
    anniversary: '#D96E80',
    travel: '#7FA8C9',
    period: '#D96E80',
    rest: '#7FA8C9',
    tagTodo: '#EFEDF1',
    tagMeal: '#F6E7D8',
    tagRestaurant: '#F8E6EA',
    tagAnniversary: '#F7E2E6',
    tagTravel: '#E3ECF3',
    tagPeriod: '#F7E2E6',
    tagRest: '#E3ECF3',
  },
  radius: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  shadow: {
    card: '0 8rpx 32rpx rgba(80, 70, 90, 0.06)',
    soft: '0 4rpx 16rpx rgba(80, 70, 90, 0.05)',
    float: '0 12rpx 48rpx rgba(80, 70, 90, 0.12)',
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif",
    sizes: {
      hero: 40,
      section: 32,
      body: 28,
      helper: 24,
      calendarDay: 30,
      calendarLunar: 20,
      tag: 20,
    },
  },
} as const;

/** 二十四节气专属配色（index 0=立春 … 23=大寒，与 utils/solar.ts TERM_NAMES 对齐） */
export const solarTerms = [
  { name: '立春', bg: '#F7F3EC', surface: '#FFFCF8', gradA: '#F7F3EC', gradB: '#E8F0E2', mood: '嫩芽绿' },
  { name: '雨水', bg: '#F4F3F0', surface: '#FCFBFA', gradA: '#F4F3F0', gradB: '#E4EBE9', mood: '雨雾青' },
  { name: '惊蛰', bg: '#F5F5EE', surface: '#FDFCF7', gradA: '#F5F5EE', gradB: '#E7EEDD', mood: '浅草绿' },
  { name: '春分', bg: '#F3F7F0', surface: '#FCFEF9', gradA: '#F3F7F0', gradB: '#E1EDDB', mood: '春绿' },
  { name: '清明', bg: '#F2F6F2', surface: '#FAFCF9', gradA: '#F2F6F2', gradB: '#DCEAE2', mood: '青灰雨雾' },
  { name: '谷雨', bg: '#EFF6F1', surface: '#F9FCFA', gradA: '#EFF6F1', gradB: '#D8EADF', mood: '翠绿' },
  { name: '立夏', bg: '#F0F6F5', surface: '#F9FCFB', gradA: '#F0F6F5', gradB: '#D9EBE8', mood: '浅青' },
  { name: '小满', bg: '#F4F6EE', surface: '#FBFCF7', gradA: '#F4F6EE', gradB: '#E4EDD8', mood: '麦青' },
  { name: '芒种', bg: '#F7F5EA', surface: '#FDFBF4', gradA: '#F7F5EA', gradB: '#EFE8CD', mood: '麦黄' },
  { name: '夏至', bg: '#EDF4FA', surface: '#F8FBFD', gradA: '#EDF4FA', gradB: '#DCECF6', mood: '晴空蓝' },
  { name: '小暑', bg: '#EDF6F6', surface: '#F8FCFB', gradA: '#EDF6F6', gradB: '#DAEDEA', mood: '水青' },
  { name: '大暑', bg: '#EBF5F2', surface: '#F7FCFA', gradA: '#EBF5F2', gradB: '#D8EBE5', mood: '薄荷' },
  { name: '立秋', bg: '#F8F4EC', surface: '#FDFAF4', gradA: '#F8F4EC', gradB: '#F0E5D2', mood: '浅杏' },
  { name: '处暑', bg: '#F9F3E8', surface: '#FEFAF3', gradA: '#F9F3E8', gradB: '#F2E2CC', mood: '淡橘' },
  { name: '白露', bg: '#F8F6F0', surface: '#FDFBF7', gradA: '#F8F6F0', gradB: '#EFEAE0', mood: '米白' },
  { name: '秋分', bg: '#F7F3E9', surface: '#FCF9F2', gradA: '#F7F3E9', gradB: '#EFE5CC', mood: '麦金' },
  { name: '寒露', bg: '#F9F2E8', surface: '#FEFAF3', gradA: '#F9F2E8', gradB: '#F2E3CE', mood: '暖杏' },
  { name: '霜降', bg: '#F6F0E9', surface: '#FCF9F4', gradA: '#F6F0E9', gradB: '#EAE0D4', mood: '灰棕' },
  { name: '立冬', bg: '#F5F2ED', surface: '#FBF9F6', gradA: '#F5F2ED', gradB: '#E9E4DB', mood: '暖灰' },
  { name: '小雪', bg: '#F2F3F1', surface: '#FAFAF8', gradA: '#F2F3F1', gradB: '#E2E7E9', mood: '淡灰蓝' },
  { name: '大雪', bg: '#F1F1F2', surface: '#FAFAFA', gradA: '#F1F1F2', gradB: '#E3E1E8', mood: '雾紫灰' },
  { name: '冬至', bg: '#F2F2F4', surface: '#FAFAFB', gradA: '#F2F2F4', gradB: '#E4E5EC', mood: '冷瓷' },
  { name: '小寒', bg: '#F2F4F6', surface: '#FAFBFB', gradA: '#F2F4F6', gradB: '#E2E8ED', mood: '淡蓝灰' },
  { name: '大寒', bg: '#F3F1F6', surface: '#FBFAFC', gradA: '#F3F1F6', gradB: '#E6E1EE', mood: '淡紫灰' },
] as const;

/** 昼夜三档（时段 Asia/Shanghai） */
export const dayPeriods = {
  day: { label: '白天', range: '06:00–17:30', bg: '#FAF8F4', surface: '#FFFFFF', text: '#3D3A3E' },
  dusk: { label: '黄昏', range: '17:30–19:30', bg: '#F6EFE6', surface: '#FFFBF6', text: '#4A4038' },
  night: { label: '夜间', range: '19:30–06:00', bg: '#23272E', surface: '#2E333B', text: '#E6E4EA' },
} as const;

/** 传统节日轻点缀（叠加在节气主题上，只改 --festival-accent） */
export const festivals = {
  spring: { name: '春节', accent: '#C96A5F', gold: '#C9A76B' },
  lantern: { name: '元宵', accent: '#C98D6F' },
  qingming: { name: '清明', accent: '#7FAE9A' },
  dragon: { name: '端午', accent: '#8FAE7E' },
  qixi: { name: '七夕', accent: '#B48AB5' },
  midautumn: { name: '中秋', accent: '#C9A76B' },
  chongyang: { name: '重阳', accent: '#C29B6B' },
  dongzhi: { name: '冬至', accent: '#9AA0B8' },
} as const;

/**
 * 业务模块统一显示名（v1.1.9 命名规范，单一事实源）。
 * 全局（功能页 / 日历日程 / TabBar / 订阅消息 / 管理页）都从这里取，
 * 改模块名只需改这一处，禁止在各页面散落硬编码模块名。
 */
export const moduleLabels: Record<string, { icon: string; label: string }> = {
  meal: { icon: '🍚', label: '今天吃什么' },
  restaurant: { icon: '🍴', label: '下馆子' },
  anniversary: { icon: '❤️', label: '纪念日' },
  trip: { icon: '✈️', label: '旅行' },
  period: { icon: '🌸', label: '生理期' },
  todo: { icon: '📝', label: '待办' },
  custom: { icon: '📌', label: '事项' },
  manage: { icon: '🛠️', label: '设置与数据' },
};

/**
 * 统一设计 Token（第一阶段先建立基础色，后续阶段扩展）。
 * 与 apps/miniprogram/miniprogram/style/theme.wxss 中的 CSS 变量保持一致。
 */
export const tokens = {
  color: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    text: '#3A3A3A',
    textSecondary: '#8C8C8C',
    border: '#EDE7DF',
    primary: '#D98E8E',
    accent: '#E0A06E',
    blue: '#7FA3B8',
    red: '#C96F6F',
    success: '#7FA98C',
    danger: '#C0564F',
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 20,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
} as const;

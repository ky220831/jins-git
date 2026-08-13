/**
 * 统一设计 Token（第九阶段：韩风可爱风）。
 * 与 apps/miniprogram/miniprogram/style/theme.wxss 中的 CSS 变量保持一致。
 */
export const tokens = {
  color: {
    bg: '#FFF7F0',
    surface: '#FFFFFF',
    text: '#4E4547',
    textSecondary: '#B9A8A0',
    border: '#F6E8DC',
    primary: '#FF96A1',
    primaryDeep: '#F4778A',
    accent: '#FFC28E',
    blue: '#9BC7DE',
    red: '#F56A6A',
    success: '#A8D8B9',
    danger: '#F2556D',
    purple: '#C3A6E1',
    mint: '#A8E0D0',
  },
  radius: {
    sm: 16,
    md: 24,
    lg: 36,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  shadow: {
    card: '0 8rpx 24rpx rgba(244, 177, 177, 0.16)',
    soft: '0 4rpx 16rpx rgba(244, 177, 177, 0.12)',
  },
} as const;

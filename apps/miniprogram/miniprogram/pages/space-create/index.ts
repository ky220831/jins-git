import { ApiError } from '../../api/cloud';
import { SpaceService } from '../../services/space';
import { currentThemeClass, themeBgPath } from '../../utils/theme';
import { formatDateTime } from '../../utils/time';

interface InviteResult {
  inviteCode: string;
  inviteCodeExpiresAt: string;
}

Page({
  data: {
    themeClass: currentThemeClass(),
    themeBg: themeBgPath(),
    name: '',
    submitting: false,
    result: null as InviteResult | null,
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass(), themeBg: themeBgPath() });
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },

  async onSubmit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '请先填写空间名称', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true });
    try {
      const res = await SpaceService.create({ name });
      this.setData({
        result: {
          inviteCode: res.inviteCode,
          inviteCodeExpiresAt: formatDateTime(res.inviteCodeExpiresAt),
        },
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '创建失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onCopyInvite() {
    const code = this.data.result?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制邀请码', icon: 'success' });
      },
    });
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/calendar/index' });
  },
});

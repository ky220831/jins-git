import { ApiError } from '../../api/cloud';
import { SpaceService } from '../../services/space';

Page({
  data: {
    inviteCode: '',
    submitting: false,
  },

  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() });
  },

  async onSubmit() {
    const code = this.data.inviteCode.trim();
    if (code.length !== 8) {
      wx.showToast({ title: '请输入 8 位邀请码', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true });
    try {
      await SpaceService.join({ inviteCode: code });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/home/index' });
      }, 800);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '加入失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

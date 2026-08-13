import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type SpaceMemberView, type SpaceView } from '../../lib/shared/types/index';
import { SpaceService } from '../../services/space';
import { formatDate, formatDateTime } from '../../utils/time';

interface MemberRow extends SpaceMemberView {
  shortId: string;
  joinedAtLabel: string;
  roleLabel: string;
}

Page({
  data: {
    loading: true,
    space: null as SpaceView | null,
    members: [] as MemberRow[],
    isOwner: false,
    inviteExpiresAt: '',
    error: '',
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await SpaceService.mySpace();
      const space = res.space;
      const members: MemberRow[] = space.members.map((m) => ({
        ...m,
        shortId: m.userId.slice(-8),
        joinedAtLabel: formatDate(m.joinedAt),
        roleLabel: m.role === ROLE_OWNER ? '主账号' : '副账号',
      }));
      this.setData({
        space,
        members,
        isOwner: space.myRole === ROLE_OWNER,
        inviteExpiresAt: space.inviteCodeExpiresAt ? formatDateTime(space.inviteCodeExpiresAt) : '',
        error: '',
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_IN_SPACE') {
        wx.reLaunch({ url: '/pages/space/index' });
        return;
      }
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.refresh();
  },

  onCopyInvite() {
    const code = this.data.space?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制邀请码', icon: 'success' });
      },
    });
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/calendar/index' });
  },
});

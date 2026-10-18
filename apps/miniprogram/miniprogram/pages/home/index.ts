import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type SpaceMemberView, type SpaceView } from '../../lib/shared/types/index';
import { SpaceService } from '../../services/space';
import { startSilentRefresh } from '../../utils/realtime';
import { formatDateTime } from '../../utils/time';

interface MemberRow extends SpaceMemberView {
  displayName: string;
  avatar: string;
}

Page({
  data: {
    loading: true,
    space: null as SpaceView | null,
    members: [] as MemberRow[],
    isOwner: false,
    myDisplayName: '',
    partnerDisplayName: '',
    inviteCode: '',
    inviteExpiresAt: '',
    error: '',
    showNameEdit: false,
    nameInput: '',
    savingName: false,
  },

  onShow() {
    this.refresh();
    this.startSilent();
  },

  onHide() {
    this.stopSilent();
  },

  onUnload() {
    this.stopSilent();
  },

  startSilent() {
    this.stopSilent();
    (this as unknown as { _stopSilent?: () => void })._stopSilent = startSilentRefresh(() =>
      this.refresh(true),
    );
  },

  stopSilent() {
    const stop = (this as unknown as { _stopSilent?: () => void })._stopSilent;
    if (stop) {
      stop();
      (this as unknown as { _stopSilent?: () => void })._stopSilent = undefined;
    }
  },

  async refresh(silent = false) {
    if (!silent) {
      this.setData({ loading: true, error: '' });
    }
    try {
      const spaceRes = await SpaceService.mySpace();
      const space = spaceRes.space;
      const isOwner = space.myRole === ROLE_OWNER;
      const members: MemberRow[] = space.members.map((m) => ({
        ...m,
        displayName: m.nickname || (m.role === ROLE_OWNER ? '主账号' : '副账号'),
        avatar: m.role === ROLE_OWNER ? '👑' : '💗',
      }));
      const me = members.find((m) =>
        isOwner ? m.role === ROLE_OWNER : m.role !== ROLE_OWNER,
      );
      const partner = members.find((m) =>
        isOwner ? m.role !== ROLE_OWNER : m.role === ROLE_OWNER,
      );
      this.setData({
        space,
        members,
        isOwner,
        myDisplayName: me?.displayName || '',
        partnerDisplayName: partner?.displayName || '',
        inviteCode: space.inviteCode || '',
        inviteExpiresAt: space.inviteCodeExpiresAt
          ? formatDateTime(space.inviteCodeExpiresAt)
          : '',
        error: '',
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_IN_SPACE') {
        wx.reLaunch({ url: '/pages/space/index' });
        return;
      }
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      if (!silent) {
        this.setData({ error: message });
      }
    } finally {
      if (!silent) {
        this.setData({ loading: false });
      }
    }
  },

  onRetry() {
    this.refresh();
  },

  onCopyInvite() {
    const code = this.data.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制邀请码', icon: 'success' });
      },
    });
  },

  onStartEditName() {
    this.setData({ showNameEdit: true, nameInput: this.data.myDisplayName });
  },

  onHideNameEdit() {
    this.setData({ showNameEdit: false });
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ nameInput: e.detail.value });
  },

  async onSaveName() {
    const nickname = this.data.nameInput.trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (this.data.savingName) return;
    this.setData({ savingName: true });
    try {
      await SpaceService.setNickname({ nickname });
      this.setData({ showNameEdit: false });
      this.refresh();
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingName: false });
    }
  },

  onOpenFullCalendar() {
    wx.navigateTo({ url: '/pages/calendar/index' });
  },

  onOpenMeal() {
    wx.navigateTo({ url: '/pages/meal/index' });
  },

  onOpenRestaurant() {
    wx.navigateTo({ url: '/pages/restaurant/index' });
  },

  onOpenAnniversary() {
    wx.navigateTo({ url: '/pages/anniversary/index' });
  },

  onOpenTravel() {
    wx.navigateTo({ url: '/pages/travel/index' });
  },

  onOpenManage() {
    wx.navigateTo({ url: '/pages/manage/index' });
  },
});

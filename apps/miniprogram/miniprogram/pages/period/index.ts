import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type PeriodRecordView } from '../../lib/shared/types/index';
import { PeriodService } from '../../services/period';
import { SpaceService } from '../../services/space';

interface PeriodRow extends PeriodRecordView {
  rangeLabel: string;
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    loading: true,
    error: '',
    periodRecords: [] as PeriodRow[],
    periodVisible: true,
    isOwner: false,
    saving: false,
    periodStart: '',
    periodEnd: '',
  },

  onLoad() {
    const today = dateKey(new Date());
    this.setData({ periodStart: today, periodEnd: today });
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const [info, space] = await Promise.all([
        PeriodService.info(),
        SpaceService.mySpace(),
      ]);
      this.setData({
        loading: false,
        periodVisible: info.calendarVisible,
        periodRecords: info.records
          .map((r) => ({
            ...r,
            rangeLabel: `${r.startDate} ~ ${r.endDate}`,
          }))
          .sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
        isOwner: space.space.myRole === ROLE_OWNER,
        error: '',
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err instanceof ApiError ? err.message : '加载失败，请重试',
      });
    }
  },

  onStartChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ periodStart: e.detail.value });
  },

  onEndChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ periodEnd: e.detail.value });
  },

  async onSave() {
    const start = this.data.periodStart;
    const end = this.data.periodEnd;
    if (!start || !end) {
      wx.showToast({ title: '请选择开始和结束日期', icon: 'none' });
      return;
    }
    if (end < start) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await PeriodService.record({ startDate: start, endDate: end });
      const today = dateKey(new Date());
      this.setData({ periodStart: today, periodEnd: today });
      this.refresh();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggleVisible(e: WechatMiniprogram.SwitchChange) {
    const visible = !!e.detail.value;
    this.setData({ periodVisible: visible });
    try {
      await PeriodService.setVisible(visible);
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '设置失败', icon: 'none' });
      this.refresh();
    }
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除生理期记录',
      content: '删除后将重新计算预测，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await PeriodService.remove(id);
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },
});

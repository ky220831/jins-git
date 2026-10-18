import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type PeriodRecordView } from '../../lib/shared/types/index';
import { PeriodService } from '../../services/period';
import { SpaceService } from '../../services/space';

interface PeriodRow extends PeriodRecordView {
  rangeLabel: string;
  metaLabel: string;
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

Page({
  data: {
    loading: true,
    error: '',
    periodRecords: [] as PeriodRow[],
    periodVisible: true,
    isOwner: false,
    saving: false,
    mode: 'start' as 'start' | 'end',
    startDate: '',
    endDate: '',
    ongoingRecord: null as { id: string; startDate: string } | null,
    ongoingEndMax: '',
  },

  onLoad() {
    const today = dateKey(new Date());
    this.setData({ startDate: today, endDate: today });
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
      const today = dateKey(new Date());
      const actuals = info.records
        .filter((r) => r.type === 'actual')
        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      const latest = actuals[actuals.length - 1];
      const ongoing =
        latest &&
        latest.endDate === latest.startDate &&
        today >= latest.startDate &&
        today <= addDays(latest.startDate, 21)
          ? { id: latest.id, startDate: latest.startDate }
          : null;
      this.setData({
        loading: false,
        periodVisible: info.calendarVisible,
        periodRecords: info.records
          .map((r) => ({
            ...r,
            rangeLabel:
              r.type === 'predicted'
                ? `${r.startDate}（预计开始）`
                : r.endDate === r.startDate
                  ? `${r.startDate} 起`
                  : `${r.startDate} ~ ${r.endDate}`,
            metaLabel:
              r.type === 'predicted'
                ? '预测 · 预计开始日'
                : r.endDate === r.startDate
                  ? '实际 · 进行中，待补结束日期'
                  : `实际 · 周期 ${r.cycleLength} 天`,
          }))
          .sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
        isOwner: space.space.myRole === ROLE_OWNER,
        mode: ongoing ? 'end' : 'start',
        ongoingRecord: ongoing,
        ongoingEndMax: ongoing ? addDays(ongoing.startDate, 30) : '',
        endDate: ongoing ? today : this.data.endDate,
        startDate: ongoing ? ongoing.startDate : this.data.startDate,
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
    this.setData({ startDate: e.detail.value });
  },

  onEndChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ endDate: e.detail.value });
  },

  async onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const today = dateKey(new Date());
      if (this.data.mode === 'end' && this.data.ongoingRecord) {
        const end = this.data.endDate;
        if (end < this.data.ongoingRecord.startDate) {
          wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
          return;
        }
        await PeriodService.updateEnd({
          recordId: this.data.ongoingRecord.id,
          endDate: end,
        });
        wx.showToast({ title: '已补录结束日期', icon: 'success' });
      } else {
        const start = this.data.startDate;
        if (!start) {
          wx.showToast({ title: '请选择开始日期', icon: 'none' });
          return;
        }
        await PeriodService.record({ startDate: start, endDate: start });
        wx.showToast({ title: '已记录开始日期', icon: 'success' });
      }
      this.setData({ startDate: today, endDate: today });
      this.refresh();
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

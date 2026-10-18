import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type AnniversaryView } from '../../lib/shared/types/index';
import { AnniversaryService } from '../../services/anniversary';
import { SpaceService } from '../../services/space';

interface AnniversaryRow extends AnniversaryView {
  countLabel: string;
  elapsedLabel: string;
  repeatLabel: string;
}

Page({
  data: {
    items: [] as AnniversaryRow[],
    isOwner: false,
    loading: false,
    error: '',
    showForm: false,
    editingId: '',
    fName: '',
    fDate: '',
    fTime: '',
    fNote: '',
    pendingDate: '',
    fYearly: true,
    saving: false,
  },

  onShow() {
    this.refresh();
  },

  onLoad(options?: Record<string, string>) {
    if (options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      this.setData({ pendingDate: options.date });
    }
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const [list, space] = await Promise.all([
        AnniversaryService.list(),
        SpaceService.mySpace(),
      ]);
      this.setData({
        items: list.map((a) => ({
          ...a,
          countLabel:
            a.daysToNext > 0
              ? `还有 ${a.daysToNext} 天`
              : a.daysToNext === 0
                ? '就是今天'
                : `已过 ${-a.daysToNext} 天`,
          elapsedLabel: a.elapsedDays >= 0 ? `已 ${a.elapsedDays} 天` : '',
          repeatLabel: a.yearly ? '每年' : '不重复',
        })),
        isOwner: space.space.myRole === ROLE_OWNER,
        error: '',
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  onShowForm() {
    this.setData({
      showForm: true,
      editingId: '',
      fName: '',
      fDate: this.data.pendingDate || '',
      fTime: '',
      fNote: '',
      fYearly: true,
    });
  },

  onHideForm() {
    this.setData({ showForm: false });
  },

  onFieldInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value } as Record<string, string>);
  },

  onFieldChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value } as Record<string, string>);
  },

  onToggleYearly(e: WechatMiniprogram.SwitchChange) {
    this.setData({ fYearly: !!e.detail.value });
  },

  onEdit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const item = this.data.items.find((x) => x.id === id);
    if (!item) return;
    this.setData({
      showForm: true,
      editingId: item.id,
      fName: item.name,
      fDate: item.date,
      fTime: item.time || '',
      fNote: item.note || '',
      fYearly: item.yearly,
    });
  },

  async onSave() {
    const name = this.data.fName.trim();
    const date = this.data.fDate.trim();
    if (!name) {
      wx.showToast({ title: '请填写纪念日名称', icon: 'none' });
      return;
    }
    if (!date) {
      wx.showToast({ title: '请填写日期 YYYY-MM-DD', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const common = {
        name,
        date,
        time: this.data.fTime.trim() || null,
        note: this.data.fNote.trim() || null,
        yearly: this.data.fYearly,
      };
      if (this.data.editingId) {
        const editing = this.data.items.find((a) => a.id === this.data.editingId);
        if (!editing) {
          wx.showToast({ title: '纪念日不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await AnniversaryService.update({ anniversaryId: this.data.editingId, version: editing.version, ...common });
      } else {
        await AnniversaryService.create(common);
      }
      this.setData({ showForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除纪念日',
      content: '删除后进入回收站，72 小时内可恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await AnniversaryService.remove({ anniversaryId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },
});

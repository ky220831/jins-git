import { ApiError } from '../../api/cloud';
import {
  ROLE_OWNER,
  type MealPlanView,
  type RestaurantView,
  type SpaceMemberView,
  type SpaceView,
  type TrashItemView,
} from '../../lib/shared/types/index';
import { ManageService } from '../../services/manage';
import { MealService } from '../../services/meal';
import { RestaurantService } from '../../services/restaurant';
import { SpaceService } from '../../services/space';
import { TrashService } from '../../services/trash';
import { formatDate, formatDateTime } from '../../utils/time';

interface TrashRow extends TrashItemView {
  collectionLabel: string;
  deletedLabel: string;
  purgeLabel: string;
  selected: boolean;
}

interface MemberRow extends SpaceMemberView {
  roleLabel: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  meal_templates: '今日菜单素材',
  meal_plans: '今日菜单',
  restaurants: '餐厅',
  restaurant_visits: '餐厅行程',
  anniversaries: '纪念日',
  trips: '旅行资料',
  trip_plans: '旅游行程',
};

const COLLECTION_OPTIONS = [
  { label: '全部类型', value: '' },
  ...Object.entries(COLLECTION_LABELS).map(([value, label]) => ({ label, value })),
];

function collectionLabel(collection: string): string {
  return COLLECTION_LABELS[collection] || collection;
}

Page({
  data: {
    isOwner: false,
    loading: false,
    error: '',
    counts: {
      mealTemplates: 0,
      mealPlans: 0,
      restaurants: 0,
      restaurantVisits: 0,
      anniversaries: 0,
      trips: 0,
      tripPlans: 0,
      todos: 0,
      trash: 0,
    },
    trash: [] as TrashRow[],
    trashFilterIndex: 0,
    trashFilterLabel: '全部类型',
    collectionOptions: COLLECTION_OPTIONS,
    exporting: false,
    exportUrl: '',
    exportName: '',
    exportSizeLabel: '',
    space: null as SpaceView | null,
    members: [] as MemberRow[],
    inviteCode: '',
    inviteExpiresAt: '',
    mealPlans: [] as MealPlanView[],
    restaurants: [] as RestaurantView[],
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const spaceRes = await SpaceService.mySpace();
      const isOwner = spaceRes.space.myRole === ROLE_OWNER;
      if (isOwner) {
        const [overview, trash, space] = await Promise.all([
          ManageService.overview(),
          TrashService.list(),
          Promise.resolve(spaceRes),
        ]);
        this.setData({
          isOwner: true,
          counts: overview.counts,
          trash: this.buildTrashRows(trash),
          members: space.space.members.map((m) => ({
            ...m,
            roleLabel: m.role === ROLE_OWNER ? '主账号' : '副账号',
          })),
          space: space.space,
          inviteCode: space.space.inviteCode || '',
          inviteExpiresAt: space.space.inviteCodeExpiresAt
            ? formatDateTime(space.space.inviteCodeExpiresAt)
            : '',
          error: '',
        });
      } else {
        const [todayPlans, restaurants] = await Promise.all([
          MealService.today(),
          RestaurantService.list(),
        ]);
        this.setData({
          isOwner: false,
          mealPlans: todayPlans.filter((p) => p.status === 'published'),
          restaurants: restaurants.filter((r) => r.enabled),
          error: '',
        });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  buildTrashRows(items: TrashItemView[]): TrashRow[] {
    return items.map((t) => ({
      ...t,
      collectionLabel: collectionLabel(t.collection),
      deletedLabel: formatDateTime(t.deletedAt),
      purgeLabel: formatDateTime(t.purgeAt),
      selected: false,
    }));
  },

  onTrashFilterChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    this.setData({
      trashFilterIndex: index,
      trashFilterLabel: COLLECTION_OPTIONS[index]?.label || '全部类型',
    });
    const collection = COLLECTION_OPTIONS[index]?.value;
    TrashService.list(collection ? { collection } : undefined)
      .then((items) => this.setData({ trash: this.buildTrashRows(items) }))
      .catch((err) => {
        wx.showToast({ title: err instanceof ApiError ? err.message : '加载失败', icon: 'none' });
      });
  },

  onToggleSelect(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const trash = this.data.trash.map((t) =>
      t.id === id ? { ...t, selected: !t.selected } : t,
    );
    this.setData({ trash });
  },

  onSelectAll() {
    const allSelected = this.data.trash.length > 0 && this.data.trash.every((t) => t.selected);
    this.setData({
      trash: this.data.trash.map((t) => ({ ...t, selected: !allSelected })),
    });
  },

  selectedIds(): string[] {
    return this.data.trash.filter((t) => t.selected).map((t) => t.id);
  },

  async onBatchRestore() {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      wx.showToast({ title: '请先勾选要恢复的记录', icon: 'none' });
      return;
    }
    try {
      await TrashService.restoreMany({ trashIds: ids });
      wx.showToast({ title: `已恢复 ${ids.length} 条`, icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '恢复失败', icon: 'none' });
    }
  },

  onBatchPurge() {
    const ids = this.selectedIds();
    if (ids.length === 0) {
      wx.showToast({ title: '请先勾选要删除的记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '永久删除',
      content: `将永久删除 ${ids.length} 条记录，删除后将无法恢复。确定吗？`,
      confirmColor: '#C0564F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TrashService.purgeMany({ trashIds: ids });
          wx.showToast({ title: `已删除 ${ids.length} 条`, icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  onPurgeAll() {
    const count = this.data.trash.length;
    if (count === 0) {
      wx.showToast({ title: '回收站是空的', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空回收站',
      content: `将永久删除回收站全部 ${count} 条记录，删除后将无法恢复。确定吗？`,
      confirmColor: '#C0564F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TrashService.purgeAll();
          wx.showToast({ title: '回收站已清空', icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '清理失败', icon: 'none' });
        }
      },
    });
  },

  onRestoreOne(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    TrashService.restore({ trashId: id })
      .then(() => {
        wx.showToast({ title: '已恢复', icon: 'success' });
        this.refresh();
      })
      .catch((err) => {
        wx.showToast({ title: err instanceof ApiError ? err.message : '恢复失败', icon: 'none' });
      });
  },

  onPurgeOne(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '永久删除',
      content: '永久删除后将无法恢复。确定吗？',
      confirmColor: '#C0564F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TrashService.purge({ trashId: id });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  async onExport() {
    if (this.data.exporting) return;
    this.setData({ exporting: true, exportUrl: '', exportName: '', exportSizeLabel: '' });
    try {
      const res = await ManageService.exportJson();
      this.setData({
        exportUrl: res.tempFileURL,
        exportName: res.fileName,
        exportSizeLabel: res.sizeBytes > 1024 ? `${(res.sizeBytes / 1024).toFixed(1)} KB` : `${res.sizeBytes} B`,
      });
      wx.showModal({
        title: '导出成功',
        content: `文件：${res.fileName}\n链接 1 小时内有效，可复制到电脑浏览器下载。`,
        confirmText: '复制链接',
        cancelText: '关闭',
        success: (m) => {
          if (m.confirm) this.onCopyExportUrl();
        },
      });
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '导出失败，请重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  onCopyExportUrl() {
    if (!this.data.exportUrl) return;
    wx.setClipboardData({ data: this.data.exportUrl });
  },

  onCopyInvite() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({ data: this.data.inviteCode });
  },

  onRegenInvite() {
    wx.showModal({
      title: '重新生成邀请码',
      content: '旧邀请码会立即失效，新邀请码有效期 7 天。确定吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await SpaceService.regenInvite();
          this.setData({
            space: result.space,
            inviteCode: result.inviteCode,
            inviteExpiresAt: formatDateTime(result.inviteCodeExpiresAt),
          });
          wx.showToast({ title: '已生成新邀请码', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '生成失败', icon: 'none' });
        }
      },
    });
  },

  async onOfflineMeal(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await MealService.offlinePlan({ planId: id });
      wx.showToast({ title: '已下架', icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '下架失败', icon: 'none' });
    }
  },

  async onOfflineRestaurant(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await RestaurantService.update({ restaurantId: id, enabled: false });
      wx.showToast({ title: '已下架', icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '下架失败', icon: 'none' });
    }
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
});

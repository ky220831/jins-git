import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type RestaurantSearchItem, type RestaurantView, type RestaurantVisitView } from '../../lib/shared/types/index';
import {
  RestaurantImagesService,
  RestaurantOcrService,
  RestaurantSearchService,
  RestaurantService,
} from '../../services/restaurant';
import { SpaceService } from '../../services/space';

interface RestaurantRow extends RestaurantView {
  coverUrl: string;
  tagsLabel: string;
  priceLabel: string;
  ratingLabel: string;
}

interface VisitRow extends RestaurantVisitView {
  timeLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function todayKey(): string {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

Page({
  data: {
    restaurants: [] as RestaurantRow[],
    visits: [] as VisitRow[],
    searchResults: [] as RestaurantSearchItem[],
    isOwner: false,
    loading: false,
    error: '',
    showForm: false,
    editingId: '',
    fName: '',
    fAddress: '',
    fCity: '',
    fCategory: '',
    fPrice: '',
    fRating: '',
    fTags: '',
    fDishes: '',
    fNote: '',
    fHours: '',
    fFavorite: false,
    fVisited: false,
    fLat: '',
    fLng: '',
    saving: false,
    showSearch: false,
    searchKeyword: '',
    searchRegion: '',
    searching: false,
    ocrHint: '',
    showVisitForm: false,
    visitRestaurantId: '',
    visitRestaurantName: '',
    vDate: '',
    pendingVisitDate: '',
    vTime: '',
    vNote: '',
  },

  onShow() {
    this.refresh();
  },

  onLoad(options?: Record<string, string>) {
    if (options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      this.setData({ pendingVisitDate: options.date });
    }
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const now = new Date();
      const [restaurants, visits, space] = await Promise.all([
        RestaurantService.list(),
        RestaurantService.visitsMonth({ year: now.getFullYear(), month: now.getMonth() + 1 }),
        SpaceService.mySpace(),
      ]);
      const fileIDs = Array.from(
        new Set(
          restaurants.flatMap((r) => [
            ...(r.coverImage ? [r.coverImage] : []),
            ...r.images,
            ...r.menuImages,
          ]),
        ),
      );
      let urlMap = new Map<string, string>();
      if (fileIDs.length > 0) {
        const res = await RestaurantImagesService.tempUrls(fileIDs);
        urlMap = new Map(res.urls.map((u) => [u.fileID, u.tempFileURL]));
      }
      this.setData({
        restaurants: restaurants.map((r) => ({
          ...r,
          coverUrl: r.coverImage ? urlMap.get(r.coverImage) || '' : '',
          tagsLabel: r.tags.join(' · '),
          priceLabel: typeof r.pricePerPerson === 'number' ? `¥${r.pricePerPerson}` : '',
          ratingLabel: typeof r.rating === 'number' ? `${r.rating} 分` : '',
        })),
        visits: visits.map((v) => ({ ...v, timeLabel: v.time || '全天' })),
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

  // ---- 添加 / 编辑 ----
  onShowForm() {
    this.setData({
      showForm: true,
      editingId: '',
      fName: '',
      fAddress: '',
      fCity: '',
      fCategory: '',
      fPrice: '',
      fRating: '',
      fTags: '',
      fDishes: '',
      fNote: '',
      fHours: '',
      fFavorite: false,
      fVisited: false,
      fLat: '',
      fLng: '',
      ocrHint: '',
    });
  },

  onEditRestaurant(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const r = this.data.restaurants.find((x) => x.id === id);
    if (!r) return;
    this.setData({
      showForm: true,
      editingId: r.id,
      fName: r.name,
      fAddress: r.address || '',
      fCity: r.city || '',
      fCategory: r.category || '',
      fPrice: typeof r.pricePerPerson === 'number' ? String(r.pricePerPerson) : '',
      fRating: typeof r.rating === 'number' ? String(r.rating) : '',
      fTags: r.tags.join(', '),
      fDishes: r.recommendedDishes.join(', '),
      fNote: r.note || '',
      fHours: r.businessHours || '',
      fFavorite: r.favorite,
      fVisited: r.visited,
      fLat: typeof r.lat === 'number' ? String(r.lat) : '',
      fLng: typeof r.lng === 'number' ? String(r.lng) : '',
      ocrHint: '',
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

  onToggleFormField(e: WechatMiniprogram.SwitchChange) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: !!e.detail.value } as Record<string, boolean>);
  },

  async onSaveRestaurant() {
    const name = this.data.fName.trim();
    if (!name) {
      wx.showToast({ title: '请填写餐厅名称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const splitList = (v: string) =>
        v
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean);
      const common = {
        name,
        address: this.data.fAddress.trim() || null,
        city: this.data.fCity.trim() || null,
        category: this.data.fCategory.trim() || null,
        pricePerPerson: this.data.fPrice.trim() ? Number(this.data.fPrice) : null,
        rating: this.data.fRating.trim() ? Number(this.data.fRating) : null,
        tags: splitList(this.data.fTags),
        recommendedDishes: splitList(this.data.fDishes),
        note: this.data.fNote.trim() || null,
        businessHours: this.data.fHours.trim() || null,
        favorite: this.data.fFavorite,
        visited: this.data.fVisited,
        lat: this.data.fLat.trim() ? Number(this.data.fLat) : null,
        lng: this.data.fLng.trim() ? Number(this.data.fLng) : null,
      };
      if (this.data.editingId) {
        const editing = this.data.restaurants.find((x) => x.id === this.data.editingId);
        if (!editing) {
          wx.showToast({ title: '餐厅不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await RestaurantService.update({ restaurantId: this.data.editingId, version: editing.version, ...common });
      } else {
        await RestaurantService.create(common);
      }
      this.setData({ showForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggleRestaurant(e: WechatMiniprogram.TouchEvent) {
    const { id, field } = e.currentTarget.dataset as { id: string; field: 'favorite' | 'visited' | 'enabled' };
    const r = this.data.restaurants.find((x) => x.id === id);
    if (!r) return;
    try {
      await RestaurantService.update({ restaurantId: id, version: r.version, [field]: !r[field] } as never);
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '操作失败', icon: 'none' });
    }
  },

  onDeleteRestaurant(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除餐厅',
      content: '餐厅资料会进入回收站，72 小时内可恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await RestaurantService.remove({ restaurantId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ---- POI 搜索 ----
  onShowSearch() {
    this.setData({ showSearch: true, searchResults: [], searchKeyword: '' });
  },

  onHideSearch() {
    this.setData({ showSearch: false });
  },

  onSearchKeyword(e: WechatMiniprogram.Input) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchRegion(e: WechatMiniprogram.Input) {
    this.setData({ searchRegion: e.detail.value });
  },

  async onSearch() {
    if (!this.data.searchKeyword.trim()) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    this.setData({ searching: true });
    try {
      const res = await RestaurantSearchService.search({
        keyword: this.data.searchKeyword.trim(),
        region: this.data.searchRegion.trim() || undefined,
      });
      this.setData({ searchResults: res.items });
      if (res.items.length === 0) {
        wx.showToast({ title: '没有找到相关餐厅', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '搜索失败', icon: 'none' });
    } finally {
      this.setData({ searching: false });
    }
  },

  onImportSearch(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.searchResults[index];
    if (!item) return;
    this.setData({
      showSearch: false,
      showForm: true,
      editingId: '',
      fName: item.name,
      fAddress: item.address || '',
      fCity: item.city || '',
      fCategory: item.category || '',
      fLat: typeof item.lat === 'number' ? String(item.lat) : '',
      fLng: typeof item.lng === 'number' ? String(item.lng) : '',
    });
    wx.showToast({ title: '已导入，请核对后保存', icon: 'none' });
  },

  // ---- OCR ----
  async onOcr() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], sizeType: ['compressed'] });
      const tempFile = res.tempFiles[0].tempFilePath;
      wx.showLoading({ title: '识别中...' });
      const compressed = await this.compressImage(tempFile);
      const cloudPath = `restaurants/ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
      const draft = await RestaurantOcrService.recognize({ fileID: upload.fileID });
      wx.hideLoading();
      this.setData({
        showForm: true,
        editingId: '',
        fName: draft.name || '',
        fAddress: draft.address || '',
        fCategory: draft.category || '',
        fPrice: typeof draft.pricePerPerson === 'number' ? String(draft.pricePerPerson) : '',
        fHours: draft.businessHours || '',
        ocrHint: 'OCR 识别结果仅供参考，请核对后保存',
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err instanceof ApiError ? err.message : 'OCR 失败，请改用手动录入', icon: 'none' });
    }
  },

  compressImage(src: string): Promise<string> {
    return new Promise((resolve) => {
      wx.compressImage({ src, quality: 75, success: (r) => resolve(r.tempFilePath), fail: () => resolve(src) });
    });
  },

  // ---- 图片上传 ----
  onUploadImage(e: WechatMiniprogram.TouchEvent) {
    const field = e.currentTarget.dataset.field as 'cover' | 'images' | 'menuImages';
    const id = e.currentTarget.dataset.id as string;
    this.uploadPhoto(field, id);
  },

  async uploadPhoto(field: 'cover' | 'images' | 'menuImages', restaurantId: string) {
    const r = this.data.restaurants.find((x) => x.id === restaurantId);
    if (!r) return;
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], sizeType: ['compressed'] });
      const compressed = await this.compressImage(res.tempFiles[0].tempFilePath);
      wx.showLoading({ title: '上传中...' });
      const cloudPath = `restaurants/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
      wx.hideLoading();
      const patch: Record<string, unknown> = { restaurantId };
      if (field === 'cover') patch.coverImage = upload.fileID;
      if (field === 'images') patch.images = [...r.images, upload.fileID];
      if (field === 'menuImages') patch.menuImages = [...r.menuImages, upload.fileID];
      await RestaurantService.update({ ...patch, version: r.version } as never);
      this.refresh();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err instanceof ApiError ? err.message : '上传失败，请重试', icon: 'none' });
    }
  },

  // ---- 行程 ----
  onShowVisitForm(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const r = this.data.restaurants.find((x) => x.id === id);
    if (!r) return;
    this.setData({
      showVisitForm: true,
      visitRestaurantId: r.id,
      visitRestaurantName: r.name,
      vDate: this.data.pendingVisitDate || todayKey(),
      vTime: '',
      vNote: '',
    });
  },

  onHideVisitForm() {
    this.setData({ showVisitForm: false });
  },

  async onSaveVisit() {
    const { visitRestaurantId, vDate, vTime, vNote } = this.data;
    if (!vDate.trim()) {
      wx.showToast({ title: '请填写日期', icon: 'none' });
      return;
    }
    try {
      await RestaurantService.createVisit({
        restaurantId: visitRestaurantId,
        date: vDate.trim(),
        ...(vTime.trim() ? { time: vTime.trim() } : {}),
        ...(vNote.trim() ? { note: vNote.trim() } : {}),
      });
      this.setData({ showVisitForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    }
  },

  async onOfflineVisit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const visit = this.data.visits.find((v) => v.id === id);
    if (!visit) return;
    try {
      await RestaurantService.offlineVisit({ visitId: id, version: visit.version });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '下架失败', icon: 'none' });
    }
  },

  onDeleteVisit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '删除行程',
      content: '删除后进入回收站，72 小时内可恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await RestaurantService.removeVisit({ visitId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ---- 怎么去（仅在主动点击时获取位置，不保存，PRD §48/§50）----
  onHowToGo(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const r = this.data.restaurants.find((x) => x.id === id);
    if (!r || typeof r.lat !== 'number' || typeof r.lng !== 'number') {
      wx.showToast({ title: '该餐厅还没有坐标，请先补充地址', icon: 'none' });
      return;
    }
    wx.getLocation({
      type: 'gcj02',
      success: () => {
        wx.openLocation({
          latitude: r.lat as number,
          longitude: r.lng as number,
          name: r.name,
          address: r.address || '',
        });
      },
      fail: () => {
        wx.openLocation({
          latitude: r.lat as number,
          longitude: r.lng as number,
          name: r.name,
          address: r.address || '',
        });
      },
    });
  },
});

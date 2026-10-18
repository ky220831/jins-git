import { ApiError } from '../../api/cloud';
import {
  ROLE_OWNER,
  type TripItemView,
  type TripPlanView,
  type TripView,
} from '../../lib/shared/types/index';
import { SpaceService } from '../../services/space';
import { TravelService } from '../../services/travel';
import { RestaurantImagesService } from '../../services/restaurant';

interface TripRow extends TripView {
  coverUrl: string;
  itinLabel: string;
}

interface PlanRow extends TripPlanView {
  dateLabel: string;
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

/** 每行：可选 YYYY-MM-DD + 标题 + 可选 | 备注 */
function parseItinerary(text: string): TripItemView[] {
  const out: TripItemView[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let date = '';
    let rest = line;
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
    if (m) {
      date = m[1];
      rest = m[2];
    }
    const [title, note] = rest.split('|').map((s) => s.trim());
    if (!title) continue;
    out.push({
      id: `${out.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...(date ? { date } : {}),
      title,
      ...(note ? { note } : {}),
    });
  }
  return out;
}

function joinItinerary(items: TripItemView[]): string {
  return items
    .map((item) => {
      const datePart = item.date ? `${item.date} ` : '';
      const notePart = item.note ? ` | ${item.note}` : '';
      return `${datePart}${item.title}${notePart}`;
    })
    .join('\n');
}

Page({
  data: {
    trips: [] as TripRow[],
    plans: [] as PlanRow[],
    isOwner: false,
    loading: false,
    error: '',
    showTripForm: false,
    editingTripId: '',
    tName: '',
    tCountry: '',
    tCity: '',
    tTransport: '',
    tHotel: '',
    tNote: '',
    tItinerary: '',
    tLat: '',
    tLng: '',
    tImages: [] as string[],
    tImageUrls: [] as string[],
    savingTrip: false,
    showPlanForm: false,
    editingPlanId: '',
    pTripIndex: 0,
    pName: '',
    pStart: '',
    pEnd: '',
    pTime: '',
    pNote: '',
    pendingPlanDate: '',
    savingPlan: false,
  },

  onShow() {
    this.refresh();
  },

  onLoad(options?: Record<string, string>) {
    if (options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      this.setData({ pendingPlanDate: options.date });
    }
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const now = new Date();
      const [trips, plans, space] = await Promise.all([
        TravelService.trips(),
        TravelService.plansMonth({ year: now.getFullYear(), month: now.getMonth() + 1 }),
        SpaceService.mySpace(),
      ]);
      const fileIDs = Array.from(new Set(trips.flatMap((t) => t.images)));
      let urlMap = new Map<string, string>();
      if (fileIDs.length > 0) {
        const res = await RestaurantImagesService.tempUrls(fileIDs);
        urlMap = new Map(res.urls.map((u) => [u.fileID, u.tempFileURL]));
      }
      this.setData({
        trips: trips.map((t) => ({
          ...t,
          coverUrl: t.images[0] ? urlMap.get(t.images[0]) || '' : '',
          itinLabel: t.itinerary
            .map((item) => (item.date ? `${item.date} ${item.title}` : item.title))
            .join('；'),
        })),
        plans: plans.map((p) => ({
          ...p,
          dateLabel: p.endDate && p.endDate !== p.startDate ? `${p.startDate} ~ ${p.endDate}` : p.startDate,
          timeLabel: p.time || '全天',
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

  // ---- 旅行资料（永久）----
  onShowTripForm(e?: WechatMiniprogram.TouchEvent) {
    const editingId = (e?.currentTarget?.dataset?.id as string) || '';
    const item = this.data.trips.find((x) => x.id === editingId);
    this.setData({
      showTripForm: true,
      editingTripId: editingId,
      tName: item?.name || '',
      tCountry: item?.country || '',
      tCity: item?.city || '',
      tTransport: item?.transport || '',
      tHotel: item?.hotel || '',
      tNote: item?.note || '',
      tItinerary: item ? joinItinerary(item.itinerary) : '',
      tLat: typeof item?.lat === 'number' ? String(item.lat) : '',
      tLng: typeof item?.lng === 'number' ? String(item.lng) : '',
      tImages: item?.images || [],
      tImageUrls: [],
    });
    if (item && item.images.length > 0) {
      RestaurantImagesService.tempUrls(item.images).then((res) => {
        const map = new Map(res.urls.map((u) => [u.fileID, u.tempFileURL]));
        this.setData({ tImageUrls: item.images.map((f) => map.get(f) || '') });
      });
    }
  },

  onHideTripForm() {
    this.setData({ showTripForm: false });
  },

  onFieldInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value } as Record<string, string>);
  },

  onFieldChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [field]: e.detail.value } as Record<string, string>);
  },

  async onSaveTrip() {
    const name = this.data.tName.trim();
    if (!name) {
      wx.showToast({ title: '请填写旅行名称', icon: 'none' });
      return;
    }
    if (this.data.savingTrip) return;
    this.setData({ savingTrip: true });
    try {
      const common = {
        name,
        country: this.data.tCountry.trim() || null,
        city: this.data.tCity.trim() || null,
        transport: this.data.tTransport.trim() || null,
        hotel: this.data.tHotel.trim() || null,
        note: this.data.tNote.trim() || null,
        itinerary: parseItinerary(this.data.tItinerary),
        lat: this.data.tLat.trim() ? Number(this.data.tLat) : null,
        lng: this.data.tLng.trim() ? Number(this.data.tLng) : null,
        images: this.data.tImages,
      };
      if (this.data.editingTripId) {
        const editing = this.data.trips.find((t) => t.id === this.data.editingTripId);
        if (!editing) {
          wx.showToast({ title: '旅行资料不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await TravelService.updateTrip({ tripId: this.data.editingTripId, version: editing.version, ...common });
      } else {
        await TravelService.createTrip(common);
      }
      this.setData({ showTripForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingTrip: false });
    }
  },

  async onUploadTripImage() {
    try {
      const res = await wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
      });
      const fileIDs = [...this.data.tImages];
      for (const file of res.tempFiles) {
        const compressed = await this.compressImage(file.tempFilePath);
        const cloudPath = `trips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const upload = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
        fileIDs.push(upload.fileID);
      }
      this.setData({ tImages: fileIDs.slice(0, 20) });
    } catch (err) {
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    }
  },

  compressImage(src: string): Promise<string> {
    return new Promise((resolve) => {
      wx.compressImage({ src, quality: 75, success: (r) => resolve(r.tempFilePath), fail: () => resolve(src) });
    });
  },

  onDeleteTrip(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除旅行资料',
      content: '删除后进入回收站，72 小时内可恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TravelService.deleteTrip({ tripId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ---- 临时行程（14 天）----
  onShowPlanForm(e: WechatMiniprogram.TouchEvent) {
    const tripId = (e?.currentTarget?.dataset?.tripId as string) || '';
    const planId = (e?.currentTarget?.dataset?.planId as string) || '';
    const plan = this.data.plans.find((x) => x.id === planId);
    let tripIndex = 0;
    if (plan?.tripId) {
      tripIndex = this.data.trips.findIndex((t) => t.id === plan.tripId) + 1;
    } else if (tripId) {
      tripIndex = this.data.trips.findIndex((t) => t.id === tripId) + 1;
    }
    this.setData({
      showPlanForm: true,
      editingPlanId: planId,
      pTripIndex: tripIndex,
      pName: plan?.name || (tripId ? this.data.trips.find((t) => t.id === tripId)?.name || '' : ''),
      pStart: plan?.startDate || this.data.pendingPlanDate || '',
      pEnd: plan?.endDate || '',
      pTime: plan?.time || '',
      pNote: plan?.note || '',
    });
  },

  onHidePlanForm() {
    this.setData({ showPlanForm: false });
  },

  onTripPickerChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ pTripIndex: Number(e.detail.value) });
  },

  async onSavePlan() {
    const startDate = this.data.pStart.trim();
    if (!startDate) {
      wx.showToast({ title: '请填写开始日期 YYYY-MM-DD', icon: 'none' });
      return;
    }
    if (this.data.savingPlan) return;
    this.setData({ savingPlan: true });
    try {
      const tripId = this.data.pTripIndex > 0 ? this.data.trips[this.data.pTripIndex - 1]?.id : undefined;
      const common = {
        tripId,
        name: this.data.pName.trim() || undefined,
        startDate,
        endDate: this.data.pEnd.trim() || null,
        time: this.data.pTime.trim() || null,
        note: this.data.pNote.trim() || null,
      };
      if (this.data.editingPlanId) {
        const editing = this.data.plans.find((p) => p.id === this.data.editingPlanId);
        if (!editing) {
          wx.showToast({ title: '行程记录不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await TravelService.updatePlan({ planId: this.data.editingPlanId, version: editing.version, ...common });
      } else {
        await TravelService.createPlan(common);
      }
      this.setData({ showPlanForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingPlan: false });
    }
  },

  async onOfflinePlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const plan = this.data.plans.find((p) => p.id === id);
    if (!plan) return;
    try {
      await TravelService.offlinePlan({ planId: id, version: plan.version });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '操作失败', icon: 'none' });
    }
  },

  onDeletePlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除行程',
      content: '删除后进入回收站，72 小时内可恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TravelService.deletePlan({ planId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  onPlanDateToday() {
    this.setData({ pStart: todayKey() });
  },
});

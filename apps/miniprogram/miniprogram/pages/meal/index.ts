import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type MealPlanView, type MealTemplateView, type TrashItemView } from '../../lib/shared/types/index';
import { MealService } from '../../services/meal';
import { SpaceService } from '../../services/space';
import { TrashService } from '../../services/trash';
import { currentThemeClass } from '../../utils/theme';
import { enableReminder } from '../../utils/reminder';

interface PlanRow extends MealPlanView {
  timeLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

Page({
  data: {
    themeClass: currentThemeClass(),
    todayDate: '',
    todayPlans: [] as PlanRow[],
    templates: [] as MealTemplateView[],
    enabledTemplates: [] as MealTemplateView[],
    trashItems: [] as TrashItemView[],
    isOwner: false,
    loading: false,
    error: '',
    showPlanForm: false,
    editingPlanId: '',
    planName: '',
    planDate: '',
    planTime: '',
    planNote: '',
    planImage: '',
    planSaveAsTemplate: false,
    templatePickerIndex: -1,
    showTemplateForm: false,
    editingTemplateId: '',
    templateName: '',
    templateCategory: '',
    saving: false,
  },

  onLoad(options?: Record<string, string>) {
    const now = new Date();
    const today = dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const date =
      options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : today;
    this.setData({
      todayDate: today,
      planDate: date,
      // 从日历跳转：自动打开“添加菜单”并带入当天日期
      showPlanForm: options?.date ? true : false,
    });
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass() });
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const [plans, templates, space] = await Promise.all([
        MealService.today(),
        MealService.templates(),
        SpaceService.mySpace(),
      ]);
      const isOwner = space.space.myRole === ROLE_OWNER;
      const enabledTemplates = templates.filter((t) => t.enabled);
      const trashItems = isOwner ? await TrashService.list() : [];
      this.setData({
        todayPlans: plans.map((p) => ({ ...p, timeLabel: p.time || '全天' })),
        templates,
        enabledTemplates,
        trashItems,
        isOwner,
        error: '',
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  // ---- 今天吃什么（菜单）----
  onShowPlanForm() {
    this.setData({
      showPlanForm: true,
      editingPlanId: '',
      planName: '',
      planDate: this.data.todayDate,
      planTime: '',
      planNote: '',
      planImage: '',
      planSaveAsTemplate: false,
      templatePickerIndex: -1,
    });
  },

  onHidePlanForm() {
    this.setData({ showPlanForm: false });
  },

  onTemplatePick(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    const template = this.data.enabledTemplates[index];
    this.setData({
      templatePickerIndex: index,
      // 选了素材后自动带出名称，用户可直接看到已选内容（可再手动改）
      planName: template ? template.name : this.data.planName,
    });
  },

  onPlanNameInput(e: WechatMiniprogram.Input) {
    this.setData({ planName: e.detail.value });
  },

  onPlanDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ planDate: e.detail.value });
  },

  onPlanTimeChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ planTime: e.detail.value });
  },

  onPlanNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ planNote: e.detail.value });
  },

  /** 编辑今日已有菜单（1.1.7） */
  onEditPlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const plan = this.data.todayPlans.find((p) => p.id === id);
    if (!plan) return;
    this.setData({
      showPlanForm: true,
      editingPlanId: id,
      planName: plan.name,
      planDate: plan.date,
      planTime: plan.time || '',
      planNote: plan.note || '',
      planImage: plan.image || '',
      planSaveAsTemplate: false,
      templatePickerIndex: -1,
    });
  },

  /** 菜单图片：选择 → 压缩 → 上传云存储，上传成功才保留 fileID（PRD §78） */
  async onPickPlanImage() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
      });
      const temp = res.tempFiles[0];
      if (!temp) return;
      const compressed = await this.compressImage(temp.tempFilePath);
      wx.showLoading({ title: '上传中' });
      const cloudPath = `meals/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: compressed });
      this.setData({ planImage: upload.fileID });
    } catch {
      wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onClearPlanImage() {
    this.setData({ planImage: '' });
  },

  onToggleSaveTemplate(e: WechatMiniprogram.SwitchChange) {
    this.setData({ planSaveAsTemplate: !!e.detail.value });
  },

  compressImage(src: string): Promise<string> {
    return new Promise((resolve) => {
      wx.compressImage({ src, quality: 80, success: (r) => resolve(r.tempFilePath), fail: () => resolve(src) });
    });
  },

  async onSavePlan() {
    const {
      editingPlanId,
      templatePickerIndex,
      enabledTemplates,
      planName,
      planDate,
      planTime,
      planNote,
      planImage,
      planSaveAsTemplate,
    } = this.data;
    const template = templatePickerIndex >= 0 ? enabledTemplates[templatePickerIndex] : undefined;
    if (!template && !planName.trim()) {
      wx.showToast({ title: '请选择菜品或填写名称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      if (editingPlanId) {
        const plan = this.data.todayPlans.find((p) => p.id === editingPlanId);
        if (!plan) {
          wx.showToast({ title: '菜单记录不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await MealService.updatePlan({
          planId: editingPlanId,
          version: plan.version,
          name: planName.trim(),
          time: planTime.trim() || null,
          note: planNote.trim() || null,
          image: planImage || null,
        });
      } else {
        await MealService.createPlan({
          date: planDate.trim(),
          ...(template ? { templateId: template.id } : { name: planName.trim() }),
          ...(planTime.trim() ? { time: planTime.trim() } : {}),
          ...(planNote.trim() ? { note: planNote.trim() } : {}),
          ...(planImage ? { image: planImage } : {}),
        });
      }
      if (planSaveAsTemplate && !template) {
        try {
          await MealService.createTemplate({
            name: planName.trim(),
            ...(planImage ? { image: planImage } : {}),
          });
        } catch {
          wx.showToast({ title: '菜单已保存，但素材添加失败，可手动添加', icon: 'none' });
        }
      }
      this.setData({ showPlanForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onRandom() {
    try {
      const plan = await MealService.random({});
      wx.showToast({ title: `今天吃：${plan.name}`, icon: 'none' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '随机失败', icon: 'none' });
    }
  },

  async onOfflinePlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    try {
      const plan = this.data.todayPlans.find((p) => p.id === id);
      if (!plan) return;
      await MealService.offlinePlan({ planId: id, version: plan.version });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '收起失败', icon: 'none' });
    }
  },

  onDeletePlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '移出今天的安排',
      content: '移出后进入回收站，72 小时内可恢复。确定移出吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await MealService.deletePlan({ planId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ---- 素材库 ----
  onShowTemplateForm() {
    this.setData({ showTemplateForm: true, editingTemplateId: '', templateName: '', templateCategory: '' });
  },

  onHideTemplateForm() {
    this.setData({ showTemplateForm: false });
  },

  /** 点击家庭小菜单图片放大预览 */
  onPreviewTemplateImage(e: WechatMiniprogram.TouchEvent) {
    const src = e.currentTarget.dataset.src as string;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },

  onEditTemplate(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const template = this.data.templates.find((t) => t.id === id);
    if (!template) return;
    this.setData({
      showTemplateForm: true,
      editingTemplateId: id,
      templateName: template.name,
      templateCategory: template.category || '',
    });
  },

  onTemplateNameInput(e: WechatMiniprogram.Input) {
    this.setData({ templateName: e.detail.value });
  },

  onTemplateCategoryInput(e: WechatMiniprogram.Input) {
    this.setData({ templateCategory: e.detail.value });
  },

  async onSaveTemplate() {
    const { editingTemplateId, templateName, templateCategory } = this.data;
    if (!templateName.trim()) {
      wx.showToast({ title: '请填写菜名', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      if (editingTemplateId) {
        const template = this.data.templates.find((t) => t.id === editingTemplateId);
        if (!template) {
          wx.showToast({ title: '菜品不存在，请刷新后重试', icon: 'none' });
          return;
        }
        await MealService.updateTemplate({
          templateId: editingTemplateId,
          version: template.version,
          name: templateName.trim(),
          category: templateCategory.trim() || null,
        });
      } else {
        await MealService.createTemplate({
          name: templateName.trim(),
          category: templateCategory.trim() || undefined,
        });
      }
      this.setData({ showTemplateForm: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggleTemplate(e: WechatMiniprogram.SwitchChange) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    const template = this.data.templates.find((t) => t.id === id);
    if (!template) return;
    try {
      await MealService.updateTemplate({ templateId: id, version: template.version, enabled: !!e.detail.value });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err instanceof ApiError ? err.message : '操作失败', icon: 'none' });
    }
  },

  onDeleteTemplate(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '移出家庭小菜单',
      content: '移出后会进入回收站，72 小时内可恢复。确定移出吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await MealService.deleteTemplate({ templateId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ---- 回收站（仅主账号）----
  onRestoreTrash(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '恢复数据',
      content: '恢复后回到原状态，确定恢复吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TrashService.restore({ trashId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '恢复失败', icon: 'none' });
        }
      },
    });
  },

  onPurgeTrash(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '永久删除',
      content: '永久删除后将无法恢复。确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await TrashService.purge({ trashId: id });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiError ? err.message : '删除失败', icon: 'none' });
        }
      },
    });
  },

    onRemind() {
      enableReminder('meal').catch((err) => {
        wx.showToast({ title: err instanceof Error ? err.message : '开启失败', icon: 'none' });
      });
    },
});

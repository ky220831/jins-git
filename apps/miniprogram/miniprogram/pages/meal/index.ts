import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type MealPlanView, type MealTemplateView, type TrashItemView } from '../../lib/shared/types/index';
import { MealService } from '../../services/meal';
import { SpaceService } from '../../services/space';
import { TrashService } from '../../services/trash';

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
    todayDate: '',
    todayPlans: [] as PlanRow[],
    templates: [] as MealTemplateView[],
    enabledTemplates: [] as MealTemplateView[],
    trashItems: [] as TrashItemView[],
    isOwner: false,
    loading: false,
    error: '',
    showPlanForm: false,
    planName: '',
    planDate: '',
    planTime: '',
    planNote: '',
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

  // ---- 今日菜单 ----
  onShowPlanForm() {
    this.setData({
      showPlanForm: true,
      planName: '',
      planDate: this.data.todayDate,
      planTime: '',
      planNote: '',
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

  async onAddPlan() {
    const { templatePickerIndex, enabledTemplates, planName, planDate, planTime, planNote } = this.data;
    const template = templatePickerIndex >= 0 ? enabledTemplates[templatePickerIndex] : undefined;
    if (!template && !planName.trim()) {
      wx.showToast({ title: '请选择素材或填写名称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await MealService.createPlan({
        date: planDate.trim(),
        ...(template ? { templateId: template.id } : { name: planName.trim() }),
        ...(planTime.trim() ? { time: planTime.trim() } : {}),
        ...(planNote.trim() ? { note: planNote.trim() } : {}),
      });
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
      wx.showToast({ title: err instanceof ApiError ? err.message : '下架失败', icon: 'none' });
    }
  },

  onDeletePlan(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除菜单',
      content: '删除后进入回收站，72 小时内可恢复。确定删除吗？',
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
      wx.showToast({ title: '请填写菜谱名称', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      if (editingTemplateId) {
        const template = this.data.templates.find((t) => t.id === editingTemplateId);
        if (!template) {
          wx.showToast({ title: '素材不存在，请刷新后重试', icon: 'none' });
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
      title: '删除素材',
      content: '素材会进入回收站，72 小时内可恢复。确定删除吗？',
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
});

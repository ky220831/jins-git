import { ApiError } from '../../api/cloud';
import {
  ROLE_OWNER,
  type CalendarEventView,
  type HolidayDayView,
  type PeriodDayView,
  type PeriodRecordView,
  type TodoView,
} from '../../lib/shared/types/index';
import { CalendarService } from '../../services/calendar';
import { PeriodService } from '../../services/period';
import { SpaceService } from '../../services/space';
import { TodoService } from '../../services/todo';
import { startSilentRefresh } from '../../utils/realtime';
import { formatDateTime } from '../../utils/time';

interface DayCell {
  uid: number;
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  /** 普通周末（无节假日时显示“周末”标识） */
  isWeekend: boolean;
  hasTodo: boolean;
  hasEvent: boolean;
  eventCount: number;
  /** 生理期三态 + 休息：ongoing 进行中 / past 已过去 / predicted 预计 / rest 休息 */
  periodState: '' | 'ongoing' | 'past' | 'predicted' | 'rest';
  holidayLabel: string;
  /** holiday 法定节假日 / makeup_workday 调休上班 / weekend 普通周末 */
  holidayKind: '' | 'holiday' | 'makeup_workday' | 'weekend';
}

interface TodoRow extends TodoView {
  timeLabel: string;
  priorityLabel: string;
}

interface EventRow extends CalendarEventView {
  timeLabel: string;
}

interface PeriodRow extends PeriodRecordView {
  rangeLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** ISO 时间 → Asia/Shanghai 墙钟（日期键 + HH:mm），避免设备时区/UTC 差异（PRD §73） */
function toShanghaiParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + 8 * 3600000);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** 日历格子显示短标签：国庆节 → 国庆；调休上班 → 调休 */
function holidayLabel(h: HolidayDayView): string {
  if (h.type === 'makeup_workday') return '调休';
  const name = h.name || '';
  return name.length > 2 && name.endsWith('节') ? name.slice(0, -1) : name;
}

function isWeekendKey(key: string): boolean {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** 生理期状态：预计（isEstimated）优先，其次按日期是否已过区分过去/进行中 */
function periodStateOf(
  period: PeriodDayView | undefined,
  key: string,
  todayKey: string,
): '' | 'ongoing' | 'past' | 'predicted' | 'rest' {
  if (!period) return '';
  if (period.kind === 'rest') return 'rest';
  if (period.isEstimated) return 'predicted';
  return key < todayKey ? 'past' : 'ongoing';
}

Page({
  data: {
    year: 0,
    month: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    days: [] as DayCell[],
    myDisplayName: '',
    partnerDisplayName: '',
    inviteCode: '',
    inviteExpiresAt: '',
    showNameEdit: false,
    nameInput: '',
    savingName: false,
    selectedDate: '',
    monthTodos: [] as TodoView[],
    monthEvents: [] as CalendarEventView[],
    periodDays: [] as PeriodDayView[],
    holidays: [] as HolidayDayView[],
    dayTodos: [] as TodoRow[],
    dayEvents: [] as EventRow[],
    dayPeriod: null as { kind: 'period' | 'rest'; isEstimated: boolean } | null,
    dayPeriodState: '' as '' | 'ongoing' | 'past' | 'predicted' | 'rest',
    dayMarks: [] as { label: string; kind: string }[],
    dayHoliday: null as HolidayDayView | null,
    periodVisible: true,
    periodRecords: [] as PeriodRow[],
    isOwner: false,
    loading: false,
    error: '',
    showForm: false,
    formTitle: '',
    formTime: '',
    formNote: '',
    saving: false,
    showPeriodForm: false,
    periodStart: '',
    periodEnd: '',
    savingPeriod: false,
  },

  onLoad() {
    const now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    this.loadRole();
  },

  onShow() {
    if (this.data.year) {
      this.refresh();
    }
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

  async loadRole() {
    try {
      const res = await SpaceService.mySpace();
      this.setData({ isOwner: res.space.myRole === ROLE_OWNER });
    } catch {
      // 角色仅影响删除按钮显示，失败不阻塞日历
    }
  },

  async refresh(silent = false) {
    const { year, month } = this.data;
    if (!silent) {
      this.setData({ loading: true, error: '' });
    }
    try {
      const [monthRes, periodInfo, spaceRes] = await Promise.all([
        CalendarService.month({ year, month }),
        PeriodService.info(),
        SpaceService.mySpace(),
      ]);
      const space = spaceRes.space;
      const isOwner = space.myRole === ROLE_OWNER;
      const me = space.members.find((m) => (isOwner ? m.role === ROLE_OWNER : m.role !== ROLE_OWNER));
      const partner = space.members.find((m) => (isOwner ? m.role !== ROLE_OWNER : m.role === ROLE_OWNER));
      this.setData({
        isOwner,
        myDisplayName: me?.nickname || (me?.role === ROLE_OWNER ? '主账号' : '副账号'),
        partnerDisplayName: partner?.nickname || (partner?.role === ROLE_OWNER ? '主账号' : '副账号'),
        inviteCode: space.inviteCode || '',
        inviteExpiresAt: space.inviteCodeExpiresAt
          ? formatDateTime(space.inviteCodeExpiresAt)
          : '',
      });
      this.buildMonth(
        monthRes.todos,
        monthRes.events,
        monthRes.periodDays,
        monthRes.holidays,
        periodInfo.calendarVisible,
      );
      this.setData({
        periodVisible: periodInfo.calendarVisible,
        periodRecords: periodInfo.records
          .map((r) => ({
            ...r,
            rangeLabel: `${r.startDate} ~ ${r.endDate}`,
          }))
          .sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '日历加载失败，请重试';
      if (!silent) {
        this.setData({ error: message });
      }
    } finally {
      if (!silent) {
        this.setData({ loading: false });
      }
    }
  },

  buildMonth(
    todos: TodoView[],
    events: CalendarEventView[],
    periodDays: PeriodDayView[],
    holidays: HolidayDayView[],
    periodVisible: boolean,
  ) {
    const { year, month, selectedDate } = this.data;
    const todoDates = new Set(todos.map((todo) => todo.date));
    const eventDates = new Map<string, number>();
    for (const event of events) {
      const date = toShanghaiParts(event.startTime).date;
      eventDates.set(date, (eventDates.get(date) ?? 0) + 1);
    }
    const periodByDate = new Map(periodDays.map((d) => [d.date, d]));
    const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
    const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const todayKeyLocal = todayKey;

    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const emptyCell = (): DayCell => ({
      uid: 0,
      key: '',
      day: 0,
      inMonth: false,
      isToday: false,
      isWeekend: false,
      hasTodo: false,
      hasEvent: false,
      eventCount: 0,
      periodState: '',
      holidayLabel: '',
      holidayKind: '',
    });
    const cells: DayCell[] = [];
    let uid = 0;
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ ...emptyCell(), uid: (uid += 1) });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, month, day);
      const period = periodByDate.get(key);
      const holiday = holidayByDate.get(key);
      const weekend = !holiday && isWeekendKey(key);
      const eventCount = eventDates.get(key) ?? 0;
      cells.push({
        uid: (uid += 1),
        key,
        day,
        inMonth: true,
        isToday: key === todayKey,
        isWeekend: weekend,
        hasTodo: todoDates.has(key),
        hasEvent: eventCount > 0,
        eventCount,
        periodState:
          periodVisible && period ? periodStateOf(period, key, todayKeyLocal) : '',
        holidayLabel: holiday ? holidayLabel(holiday) : weekend ? '周末' : '',
        holidayKind: holiday ? holiday.type : weekend ? 'weekend' : '',
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ ...emptyCell(), uid: (uid += 1) });
    }
    this.setData({
      days: cells,
      monthTodos: todos,
      monthEvents: events,
      periodDays,
      holidays,
    });
    this.updateDayDetail(selectedDate || todayKey, todos, events);
  },

  updateDayDetail(date: string, todos?: TodoView[], events?: CalendarEventView[]) {
    const todoList = todos ?? this.data.monthTodos;
    const eventList = events ?? this.data.monthEvents;
    const dayTodos: TodoRow[] = todoList
      .filter((todo) => todo.date === date)
      .map((todo) => ({
        ...todo,
        timeLabel: todo.time || '全天',
        priorityLabel: todo.priority === 'high' ? '高' : todo.priority === 'low' ? '低' : '普通',
      }));
    const dayEvents: EventRow[] = eventList
      .map((event) => ({ event, parts: toShanghaiParts(event.startTime) }))
      .filter(({ parts }) => parts.date === date)
      .map(({ event, parts }) => ({
        ...event,
        timeLabel: parts.time === '00:00' ? '全天' : parts.time,
      }));
    const period = this.data.periodVisible
      ? this.data.periodDays.find((p) => p.date === date)
      : undefined;
    const holiday = this.data.holidays.find((h) => h.date === date);
    const marks: { label: string; kind: string }[] = [];
    if (holiday) {
      marks.push({
        label: holiday.type === 'makeup_workday' ? '🔄 调休上班' : `🇨🇳 ${holiday.name}`,
        kind: holiday.type,
      });
    } else if (isWeekendKey(date)) {
      marks.push({ label: '☕ 周末', kind: 'weekend' });
    }
    const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const dayPeriodState = period ? periodStateOf(period, date, todayKey) : '';
    this.setData({
      selectedDate: date,
      dayTodos,
      dayEvents,
      dayPeriod: period ? { kind: period.kind, isEstimated: period.isEstimated } : null,
      dayPeriodState,
      dayMarks: marks,
      dayHoliday: holiday || null,
    });
  },

  onPrev() {
    const { year, month } = this.data;
    const d = new Date(year, month - 2, 1);
    this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
    this.refresh();
  },

  onNext() {
    const { year, month } = this.data;
    const d = new Date(year, month, 1);
    this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
    this.refresh();
  },

  onToday() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    });
    this.refresh();
  },

  onTapDay(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset.key || '') as string;
    if (!key) return;
    this.setData({ selectedDate: key });
    this.updateDayDetail(key);
  },

  /** 日程 → 业务模块（PRD §20/§21 双向联动） */
  onTapEvent(e: WechatMiniprogram.TouchEvent) {
    const { type, id } = e.currentTarget.dataset as { type: string; id: string };
    if (!type || !id) return;
    const routes: Record<string, string> = {
      meal: '/pages/meal/index',
      restaurant: '/pages/restaurant/index',
      anniversary: '/pages/anniversary/index',
      trip: '/pages/travel/index',
    };
    const route = routes[type];
    if (route) {
      wx.navigateTo({ url: route });
    }
  },

  async onTogglePeriodVisible(e: WechatMiniprogram.SwitchChange) {
    const visible = !!e.detail.value;
    this.setData({ periodVisible: visible });
    try {
      await PeriodService.setVisible(visible);
      this.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '设置失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
      this.refresh();
    }
  },

  // ---- 顶部双人头部：邀请码 + 昵称 ----
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

  // ---- 日历 → 核心功能快速入口（PRD §19：自动带入日期）----
  onQuickMeal() {
    wx.navigateTo({ url: `/pages/meal/index?date=${this.data.selectedDate}` });
  },

  onQuickRestaurant() {
    wx.navigateTo({ url: `/pages/restaurant/index?date=${this.data.selectedDate}` });
  },

  onQuickTravel() {
    wx.navigateTo({ url: `/pages/travel/index?date=${this.data.selectedDate}` });
  },

  onQuickAnniversary() {
    wx.navigateTo({ url: `/pages/anniversary/index?date=${this.data.selectedDate}` });
  },

  onShowForm() {
    this.setData({ showForm: true, formTitle: '', formTime: '', formNote: '' });
  },

  onHideForm() {
    this.setData({ showForm: false });
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ formTitle: e.detail.value });
  },

  onTimeInput(e: WechatMiniprogram.Input) {
    this.setData({ formTime: e.detail.value });
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ formNote: e.detail.value });
  },

  async onAddTodo() {
    const title = this.data.formTitle.trim();
    if (!title) {
      wx.showToast({ title: '请填写事项标题', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await TodoService.create({
        title,
        date: this.data.selectedDate,
        time: this.data.formTime.trim() || undefined,
        note: this.data.formNote.trim() || undefined,
      });
      this.setData({ showForm: false });
      this.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '保存失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggleTodo(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const status = e.currentTarget.dataset.status as string;
    if (!id) return;
    const todo = this.data.dayTodos.find((t) => t.id === id);
    if (!todo) return;
    try {
      await TodoService.update({
        todoId: id,
        version: todo.version,
        status: status === 'completed' ? 'pending' : 'completed',
      });
      this.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '操作失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    }
  },

  onShowPeriodForm() {
    const date = this.data.selectedDate;
    this.setData({
      showPeriodForm: true,
      periodStart: date,
      periodEnd: date,
    });
  },

  onHidePeriodForm() {
    this.setData({ showPeriodForm: false });
  },

  onPeriodStartInput(e: WechatMiniprogram.Input) {
    this.setData({ periodStart: e.detail.value });
  },

  onPeriodEndInput(e: WechatMiniprogram.Input) {
    this.setData({ periodEnd: e.detail.value });
  },

  async onAddPeriod() {
    const start = this.data.periodStart.trim();
    const end = this.data.periodEnd.trim();
    if (!start || !end) {
      wx.showToast({ title: '请填写开始和结束日期', icon: 'none' });
      return;
    }
    if (this.data.savingPeriod) return;
    this.setData({ savingPeriod: true });
    try {
      await PeriodService.record({ startDate: start, endDate: end });
      this.setData({ showPeriodForm: false });
      this.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '保存失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ savingPeriod: false });
    }
  },

  onDeletePeriod(e: WechatMiniprogram.TouchEvent) {
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
          const message = err instanceof ApiError ? err.message : '删除失败，请重试';
          wx.showToast({ title: message, icon: 'none' });
        }
      },
    });
  },
});

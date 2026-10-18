import { ApiError } from '../../api/cloud';
import {
  ROLE_OWNER,
  type CalendarEventView,
  type HolidayDayView,
  type PeriodDayView,
  type TodoView,
} from '../../lib/shared/types/index';
import { CalendarService } from '../../services/calendar';
import { PeriodService } from '../../services/period';
import { SpaceService } from '../../services/space';
import { TodoService } from '../../services/todo';
import { moduleLabels } from '../../lib/shared/tokens';
import { startSilentRefresh } from '../../utils/realtime';
import { lunarDayName, termNameOf, toLunar } from '../../utils/solar';
import { formatDateTime } from '../../utils/time';
import { currentThemeClass } from '../../utils/theme';

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
  /** 底部边缘分类圆点（最多 4 个，分类色，不压日期数字） */
  eventDotList: string[];
  /** 格子内次级标签：法定节假日/调休/周末 > 节气 > 农历 */
  cellLabel: string;
  cellKind: '' | 'holiday' | 'makeup' | 'weekend' | 'term' | 'lunar';
  /** 生理期三态 + 休息：ongoing 进行中 / past 已过去 / predicted 预计 / rest 休息 */
  periodState: '' | 'ongoing' | 'past' | 'predicted' | 'rest';
}

interface TodoRow extends TodoView {
  timeLabel: string;
  priorityLabel: string;
  icon: string;
  moduleLabel: string;
}

interface EventRow extends CalendarEventView {
  timeLabel: string;
  icon: string;
  moduleLabel: string;
}

/** 日程分类 → 圆点/色条 class（与功能页图标一致，V2 分类语义色） */
const DOT_CLASS: Record<string, string> = {
  meal: 'dot-meal',
  restaurant: 'dot-restaurant',
  anniversary: 'dot-anniversary',
  trip: 'dot-trip',
  period: 'dot-period',
  todo: 'dot-todo',
  custom: 'dot-custom',
};

/** 去掉标题前已有的模块 emoji，避免图标重复（如 🍴 晚餐 → 晚餐） */
function stripModuleEmoji(title: string, icon: string): string {
  if (icon && title.startsWith(icon)) {
    return title.slice([...icon].length).replace(/^\s+/, '');
  }
  const m = title.match(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/);
  return m ? title.slice(m[0].length) : title;
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
    themeClass: currentThemeClass(),
    year: 0,
    month: 0,
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    days: [] as DayCell[],
    myDisplayName: '',
    partnerDisplayName: '',
    myNameLong: false,
    partnerNameLong: false,
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
    legendOpen: false,
    isOwner: false,
    /** 未绑定空间的游客模式：只显示本地公共日历，不请求任何业务数据 */
    guestMode: false,
    guestError: false,
    /** 游客模式公共节假日缓存（按年月） */
    guestHolidayKey: '',
    guestHolidays: [] as HolidayDayView[],
    loading: false,
    error: '',
    showForm: false,
    formTitle: '',
    formTime: '',
    formNote: '',
    saving: false,
  },

  onLoad() {
    const now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    this.bootstrap();
  },

  onShow() {
    this.setData({ themeClass: currentThemeClass() });
    if (this.data.year && !this.data.guestMode) {
      this.refresh();
    } else if (this.data.guestMode) {
      // 游客模式：只重建本地公共日历，不调云函数
      this.buildGuestMonth();
    }
    if (!this.data.guestMode) {
      this.startSilent();
    }
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

  /**
   * 启动身份探测（静默）：已绑定 → 完整日历；未绑定 → 游客模式公共日历。
   * 微信云函数身份由微信静默下发，全程无按钮、无授权弹窗（目标 1）。
   */
  async bootstrap() {
    try {
      const res = await SpaceService.mySpace();
      this.setData({
        isOwner: res.space.myRole === ROLE_OWNER,
        guestMode: false,
        guestError: false,
      });
      this.refresh();
    } catch (err) {
      const notInSpace = err instanceof ApiError && err.code === 'NOT_IN_SPACE';
      this.setData({ guestMode: true, guestError: !notInSpace });
      await this.buildGuestMonth();
    }
  },

  /**
   * 游客模式（方案 B）：公共日历 = 本地算法（周末/农历/节气）
   * + 官方节假日/调休（holiday-public 公共接口，只含公开字段）。
   * 不请求任何业务云函数，不产生私人数据（目标 2）。
   */
  async buildGuestMonth() {
    const { year, month, guestHolidayKey } = this.data;
    const cacheKey = `${year}-${month}`;
    let holidays = this.data.guestHolidays;
    if (guestHolidayKey !== cacheKey) {
      try {
        const res = await CalendarService.publicMonth({ year, month });
        holidays = res.days;
        this.setData({ guestHolidayKey: cacheKey, guestHolidays: holidays, guestError: false });
      } catch {
        // 节假日拉取失败不阻塞：本地周末/农历/节气仍可显示
        this.setData({ guestError: true });
      }
    }
    this.buildMonth([], [], [], holidays, false);
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
        myNameLong: (me?.nickname?.length ?? 0) > 6,
        partnerNameLong: (partner?.nickname?.length ?? 0) > 6,
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
      this.setData({ periodVisible: periodInfo.calendarVisible });
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
    const eventDots = new Map<string, string[]>();
    for (const event of events) {
      const date = toShanghaiParts(event.startTime).date;
      eventDates.set(date, (eventDates.get(date) ?? 0) + 1);
      const cls = DOT_CLASS[event.sourceType] || DOT_CLASS.custom;
      const list = eventDots.get(date) ?? [];
      if (list.length < 4 && !list.includes(cls)) list.push(cls);
      eventDots.set(date, list);
    }
    const periodByDate = new Map(periodDays.map((d) => [d.date, d]));
    const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
    const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const todayKeyLocal = todayKey;

    // 周一起始：周一=0 … 周日=6（与视觉稿一致）
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
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
      eventDotList: [],
      cellLabel: '',
      cellKind: '',
      periodState: '',
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
      const termName = termNameOf(year, month, day);
      const lunarLabel = lunarDayName(toLunar(year, month, day).day);
      let cellLabel = lunarLabel;
      let cellKind: DayCell['cellKind'] = 'lunar';
      if (holiday) {
        cellLabel = holidayLabel(holiday);
        cellKind = holiday.type === 'makeup_workday' ? 'makeup' : 'holiday';
      } else if (weekend) {
        cellLabel = '周末';
        cellKind = 'weekend';
      } else if (termName) {
        cellLabel = termName;
        cellKind = 'term';
      }
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
        eventDotList: eventDots.get(key) ?? [],
        cellLabel,
        cellKind,
        periodState:
          periodVisible && period ? periodStateOf(period, key, todayKeyLocal) : '',
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
        icon: (todo.businessType && moduleLabels[todo.businessType]?.icon) || '📝',
        moduleLabel: (todo.businessType && moduleLabels[todo.businessType]?.label) || '待办',
      }));
    const dayEvents: EventRow[] = eventList
      .map((event) => ({ event, parts: toShanghaiParts(event.startTime) }))
      .filter(({ parts }) => parts.date === date)
      .map(({ event, parts }) => {
        const meta = moduleLabels[event.sourceType] || moduleLabels.custom;
        return {
          ...event,
          title: stripModuleEmoji(event.title, meta.icon),
          timeLabel: parts.time === '00:00' ? '全天' : parts.time,
          icon: meta.icon,
          moduleLabel: meta.label,
        };
      });
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
    this.data.guestMode ? this.buildGuestMonth() : this.refresh();
  },

  onNext() {
    const { year, month } = this.data;
    const d = new Date(year, month, 1);
    this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
    this.data.guestMode ? this.buildGuestMonth() : this.refresh();
  },

  onToday() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    });
    this.data.guestMode ? this.buildGuestMonth() : this.refresh();
  },

  onTapDay(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset.key || '') as string;
    if (!key) return;
    this.setData({ selectedDate: key });
    this.updateDayDetail(key);
  },

  onToggleLegend() {
    this.setData({ legendOpen: !this.data.legendOpen });
  },

  // ---- 游客模式：引导创建/加入空间（目标 1/2） ----
  onGuestAction() {
    wx.showModal({
      title: '体验模式',
      content: '创建或加入空间后，才能记录和查看两个人的生活。所有私人数据仅对绑定双方可见。',
      confirmText: '去创建/加入',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/space/index' });
        }
      },
    });
  },

  onGuestCreate() {
    wx.navigateTo({ url: '/pages/space/index' });
  },

  onGuestJoin() {
    wx.navigateTo({ url: '/pages/space/index' });
  },

  onRetry() {
    this.bootstrap();
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
    if (this.data.guestMode) return this.onGuestAction();
    wx.navigateTo({ url: `/pages/meal/index?date=${this.data.selectedDate}` });
  },

  onQuickRestaurant() {
    if (this.data.guestMode) return this.onGuestAction();
    wx.navigateTo({ url: `/pages/restaurant/index?date=${this.data.selectedDate}` });
  },

  onQuickPeriod() {
    if (this.data.guestMode) return this.onGuestAction();
    wx.navigateTo({ url: '/pages/period/index' });
  },

  onQuickTravel() {
    if (this.data.guestMode) return this.onGuestAction();
    wx.navigateTo({ url: `/pages/travel/index?date=${this.data.selectedDate}&add=1` });
  },

  onQuickAnniversary() {
    if (this.data.guestMode) return this.onGuestAction();
    wx.navigateTo({ url: `/pages/anniversary/index?date=${this.data.selectedDate}` });
  },

  onShowForm() {
    if (this.data.guestMode) return this.onGuestAction();
    this.setData({ showForm: true, formTitle: '', formTime: '', formNote: '' });
  },

  onHideForm() {
    this.setData({ showForm: false });
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ formTitle: e.detail.value });
  },

  onTimeChange(e: WechatMiniprogram.PickerChange) {
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

});

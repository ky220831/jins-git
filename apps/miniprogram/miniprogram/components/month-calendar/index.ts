import { ApiError } from '../../api/cloud';
import type {
  CalendarEventView,
  HolidayDayView,
  PeriodDayView,
  TodoView,
} from '../../lib/shared/types/index';
import { CalendarService } from '../../services/calendar';
import { PeriodService } from '../../services/period';
import { TodoService } from '../../services/todo';

interface DayCell {
  uid: number;
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  hasTodo: boolean;
  hasEvent: boolean;
  periodKind: '' | 'period' | 'rest';
  holidayLabel: string;
  holidayType: string;
}

interface TodoRow extends TodoView {
  timeLabel: string;
  priorityLabel: string;
}

interface EventRow extends CalendarEventView {
  timeLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** ISO 时间 → Asia/Shanghai 墙钟（日期键 + HH:mm） */
function toShanghaiParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + 8 * 3600000);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

function holidayLabel(h: HolidayDayView): string {
  if (h.type === 'makeup_workday') return '调休';
  const name = h.name || '';
  return name.length > 2 && name.endsWith('节') ? name.slice(0, -1) : name;
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  data: {
    year: 0,
    month: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    days: [] as DayCell[],
    selectedDate: '',
    monthTodos: [] as TodoView[],
    monthEvents: [] as CalendarEventView[],
    periodDays: [] as PeriodDayView[],
    holidays: [] as HolidayDayView[],
    dayTodos: [] as TodoRow[],
    dayEvents: [] as EventRow[],
    dayPeriod: null as { kind: 'period' | 'rest'; isEstimated: boolean } | null,
    dayHoliday: null as HolidayDayView | null,
    periodVisible: true,
    loading: false,
    error: '',
  },

  lifetimes: {
    attached() {
      const now = new Date();
      this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
      this.load();
    },
  },

  pageLifetimes: {
    show() {
      if (this.data.year) {
        this.load();
      }
    },
  },

  methods: {
    async load() {
      const { year, month } = this.data;
      this.setData({ loading: true, error: '' });
      try {
        const [monthRes, periodInfo] = await Promise.all([
          CalendarService.month({ year, month }),
          PeriodService.info(),
        ]);
        this.buildMonth(
          monthRes.todos,
          monthRes.events,
          monthRes.periodDays,
          monthRes.holidays,
          periodInfo.calendarVisible,
        );
      } catch (err) {
        this.setData({ error: err instanceof ApiError ? err.message : '日历加载失败' });
      } finally {
        this.setData({ loading: false });
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
      const eventDates = new Set(events.map((event) => toShanghaiParts(event.startTime).date));
      const periodByDate = new Map(periodDays.map((d) => [d.date, d]));
      const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
      const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

      const firstWeekday = new Date(year, month - 1, 1).getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      const emptyCell = (): DayCell => ({
        uid: 0,
        key: '',
        day: 0,
        inMonth: false,
        isToday: false,
        hasTodo: false,
        hasEvent: false,
        periodKind: '',
        holidayLabel: '',
        holidayType: '',
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
        cells.push({
          uid: (uid += 1),
          key,
          day,
          inMonth: true,
          isToday: key === todayKey,
          hasTodo: todoDates.has(key),
          hasEvent: eventDates.has(key),
          periodKind: periodVisible && period ? period.kind : '',
          holidayLabel: holiday ? holidayLabel(holiday) : '',
          holidayType: holiday ? holiday.type : '',
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
        periodVisible,
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
      this.setData({
        selectedDate: date,
        dayTodos,
        dayEvents,
        dayPeriod: period ? { kind: period.kind, isEstimated: period.isEstimated } : null,
        dayHoliday: holiday || null,
      });
    },

    onPrev() {
      const { year, month } = this.data;
      const d = new Date(year, month - 2, 1);
      this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
      this.load();
    },

    onNext() {
      const { year, month } = this.data;
      const d = new Date(year, month, 1);
      this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
      this.load();
    },

    onToday() {
      const now = new Date();
      this.setData({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
      this.load();
    },

    onTapDay(e: WechatMiniprogram.TouchEvent) {
      const key = (e.currentTarget.dataset.key || '') as string;
      if (!key) return;
      this.setData({ selectedDate: key });
      this.updateDayDetail(key);
    },

    async onToggleTodo(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string;
      const status = e.currentTarget.dataset.status as string;
      if (!id) return;
      try {
        await TodoService.update({
          todoId: id,
          status: status === 'completed' ? 'pending' : 'completed',
        });
        this.load();
      } catch (err) {
        wx.showToast({ title: err instanceof ApiError ? err.message : '操作失败', icon: 'none' });
      }
    },

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

    onOpenFullCalendar() {
      wx.navigateTo({ url: '/pages/calendar/index' });
    },
  },
});

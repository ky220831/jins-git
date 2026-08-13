import { ApiError } from '../../api/cloud';
import type { CalendarEventView, TodoView } from '../../lib/shared/types/index';
import { CalendarService } from '../../services/calendar';
import { TodoService } from '../../services/todo';

interface DayCell {
  uid: number;
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  hasTodo: boolean;
  hasEvent: boolean;
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

Page({
  data: {
    year: 0,
    month: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    days: [] as DayCell[],
    selectedDate: '',
    monthTodos: [] as TodoView[],
    monthEvents: [] as CalendarEventView[],
    dayTodos: [] as TodoRow[],
    dayEvents: [] as EventRow[],
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
  },

  onShow() {
    if (this.data.year) {
      this.refresh();
    }
  },

  async refresh() {
    const { year, month } = this.data;
    this.setData({ loading: true, error: '' });
    try {
      const res = await CalendarService.month({ year, month });
      this.buildMonth(res.todos, res.events);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '日历加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  buildMonth(todos: TodoView[], events: CalendarEventView[]) {
    const { year, month, selectedDate } = this.data;
    const todoDates = new Set(todos.map((todo) => todo.date));
    const eventDates = new Set(events.map((event) => event.startTime.slice(0, 10)));
    const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: DayCell[] = [];
    let uid = 0;
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ uid: uid += 1, key: '', day: 0, inMonth: false, isToday: false, hasTodo: false, hasEvent: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, month, day);
      cells.push({
        uid: uid += 1,
        key,
        day,
        inMonth: true,
        isToday: key === todayKey,
        hasTodo: todoDates.has(key),
        hasEvent: eventDates.has(key),
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ uid: uid += 1, key: '', day: 0, inMonth: false, isToday: false, hasTodo: false, hasEvent: false });
    }
    this.setData({ days: cells, monthTodos: todos, monthEvents: events });
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
      .filter((event) => event.startTime.slice(0, 10) === date)
      .map((event) => ({
        ...event,
        timeLabel: event.startTime.slice(11, 16),
      }));
    this.setData({ selectedDate: date, dayTodos, dayEvents });
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
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1, selectedDate: dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate()) });
    this.refresh();
  },

  onTapDay(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset.key || '') as string;
    if (!key) return;
    this.setData({ selectedDate: key });
    this.updateDayDetail(key);
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
    try {
      await TodoService.update({
        todoId: id,
        status: status === 'completed' ? 'pending' : 'completed',
      });
      this.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '操作失败，请重试';
      wx.showToast({ title: message, icon: 'none' });
    }
  },
});

import { ApiError } from '../../api/cloud';
import { ROLE_OWNER, type SpaceMemberView, type SpaceView } from '../../lib/shared/types/index';
import { CalendarService } from '../../services/calendar';
import { PeriodService } from '../../services/period';
import { SpaceService } from '../../services/space';
import { formatDate, formatDateTime } from '../../utils/time';

interface MemberRow extends SpaceMemberView {
  shortId: string;
  joinedAtLabel: string;
  roleLabel: string;
}

interface TodaySummary {
  date: string;
  weekday: string;
  holidayLabel: string;
  periodLabel: string;
  todoCount: number;
  eventCount: number;
  nextPredictedLabel: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** ISO 时间 → Asia/Shanghai 日期键 */
function toShanghaiDateKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3600000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

Page({
  data: {
    loading: true,
    space: null as SpaceView | null,
    members: [] as MemberRow[],
    isOwner: false,
    inviteExpiresAt: '',
    today: null as TodaySummary | null,
    error: '',
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const now = new Date();
      const [spaceRes, monthRes, periodInfo] = await Promise.all([
        SpaceService.mySpace(),
        CalendarService.month({ year: now.getFullYear(), month: now.getMonth() + 1 }),
        PeriodService.info(),
      ]);
      const space = spaceRes.space;
      const members: MemberRow[] = space.members.map((m) => ({
        ...m,
        shortId: m.userId.slice(-8),
        joinedAtLabel: formatDate(m.joinedAt),
        roleLabel: m.role === ROLE_OWNER ? '主账号' : '副账号',
      }));
      const todayKey = dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const holiday = monthRes.holidays.find((h) => h.date === todayKey);
      const todoCount = monthRes.todos.filter((t) => t.date === todayKey).length;
      const eventCount = monthRes.events
        .map((e) => toShanghaiDateKey(e.startTime))
        .filter((d) => d === todayKey).length;
      const periodToday = periodInfo.today;
      const periodRecordToday = periodToday
        ? periodInfo.records.find((r) => r.startDate <= todayKey && r.endDate >= todayKey)
        : undefined;
      const periodLabel = periodToday
        ? periodToday.kind === 'period'
          ? periodRecordToday?.isEstimated
            ? '生理期（预计）'
            : '生理期'
          : '休息'
        : '';
      const today: TodaySummary = {
        date: todayKey,
        weekday: `星期${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`,
        holidayLabel: holiday
          ? holiday.type === 'makeup_workday'
            ? '🔄 调休上班'
            : `🇨🇳 ${holiday.name}`
          : '',
        periodLabel,
        todoCount,
        eventCount,
        nextPredictedLabel: periodInfo.nextPredicted
          ? `预计 ${periodInfo.nextPredicted.startDate} ~ ${periodInfo.nextPredicted.endDate}`
          : '',
      };
      this.setData({
        space,
        members,
        isOwner: space.myRole === ROLE_OWNER,
        inviteExpiresAt: space.inviteCodeExpiresAt ? formatDateTime(space.inviteCodeExpiresAt) : '',
        today,
        error: '',
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_IN_SPACE') {
        wx.reLaunch({ url: '/pages/space/index' });
        return;
      }
      const message = err instanceof ApiError ? err.message : '加载失败，请重试';
      this.setData({ error: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.refresh();
  },

  onCopyInvite() {
    const code = this.data.space?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制邀请码', icon: 'success' });
      },
    });
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/calendar/index' });
  },

  onOpenMeal() {
    wx.navigateTo({ url: '/pages/meal/index' });
  },
});

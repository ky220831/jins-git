import { AppError, ErrorCodes } from './errors';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(d.getTime());
}

export function normalizeTime(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const time = value.trim();
  if (!TIME_RE.test(time)) {
    throw new AppError(ErrorCodes.VALIDATION, '时间格式应为 HH:mm');
  }
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) {
    throw new AppError(ErrorCodes.VALIDATION, '时间超出有效范围');
  }
  return time;
}

/** Asia/Shanghai 日期键 → 当月首日与末日（YYYY-MM-DD） */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function validateYearMonth(input: { year?: number; month?: number }): {
  year: number;
  month: number;
} {
  const year = Number(input?.year);
  const month = Number(input?.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(ErrorCodes.VALIDATION, '年份不正确');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError(ErrorCodes.VALIDATION, '月份不正确');
  }
  return { year, month };
}

/** 'YYYY-MM-DD' + 'HH:mm' → Asia/Shanghai 时间点 */
export function toShanghaiDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

/** Asia/Shanghai 当前墙钟日期（YYYY-MM-DD），不依赖设备时区 */
export function todayShanghaiString(clock: () => Date = () => new Date()): string {
  const shifted = new Date(clock().getTime() + 8 * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

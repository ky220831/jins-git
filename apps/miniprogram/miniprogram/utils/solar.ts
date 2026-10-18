/**
 * 节气 / 农历 / 传统节日 / 昼夜 计算（v1.2 动态换肤用）。
 * 统一 Asia/Shanghai 时区；纯本地计算，不请求网络、不消耗云资源。
 *
 * 说明：
 * - 二十四节气用太阳黄经算法（NOAA 简化式），按“日”判定足够 UI 换肤使用；
 * - 农历用 1900–2100 年数据表，覆盖春节/元宵/端午/七夕/中秋/重阳等农历节日。
 */

export type DayPeriod = 'day' | 'dusk' | 'night';

export interface ThemeDayContext {
  /** 上海时区 年月日时分 */
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 节气序号 0..23（0=立春…23=大寒），非节气日为 -1 */
  termIndex: number;
  termName: string;
  /** 农历（无闰月时 isLeap=false） */
  lunar: { month: number; day: number; isLeap: boolean };
  /** 传统节日 key（spring/lantern/qingming/dragon/qixi/midautumn/chongyang/dongzhi），无则空串 */
  festivalKey: string;
  festivalName: string;
  /** 昼夜档位 */
  period: DayPeriod;
}

export const TERM_NAMES = [
  '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑',
  '立秋', '处暑', '白露', '秋分', '寒露', '霜降',
  '立冬', '小雪', '大雪', '冬至', '小寒', '大寒',
] as const;

/** 节气黄经（0=立春…23=大寒，与 TERM_NAMES 对齐） */
const TERM_LONGITUDES = [315, 330, 345, 0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300] as const;

/** 儒略日（UTC） */
function julianDay(y: number, m: number, d: number, hourUTC: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn =
    d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
    Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  return jdn + (hourUTC - 12) / 24;
}

/** 太阳视黄经（度，0–360），NOAA 简化式 */
function solarLongitudeDeg(jd: number): number {
  const rad = Math.PI / 180;
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * rad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * rad) +
    0.000289 * Math.sin(3 * M * rad);
  const trueLong = (L0 + C) % 360;
  return trueLong < 0 ? trueLong + 360 : trueLong;
}

/** 最短角距 */
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 农历数据表（1900–2100，201 项）：低位 12 bit 表示每月大小，高 4 bit 表示闰月位置/闰月大小 */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
] as const;

/** 农历 1900-01-31 是 1900 年正月初一 */
function daysBetween(base: { y: number; m: number; d: number }, target: { y: number; m: number; d: number }): number {
  const a = Date.UTC(base.y, base.m - 1, base.d);
  const b = Date.UTC(target.y, target.m - 1, target.d);
  return Math.round((b - a) / 86400000);
}

function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900] & 0xf;
}

function leapDays(y: number): number {
  if (!leapMonth(y)) return 0;
  return LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29;
}

function monthDays(y: number, m: number): number {
  return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29;
}

function lunarYearDays(y: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    if (LUNAR_INFO[y - 1900] & i) sum += 1;
  }
  return sum + leapDays(y);
}

export function toLunar(y: number, m: number, d: number): { month: number; day: number; isLeap: boolean } {
  let offset = daysBetween({ y: 1900, m: 1, d: 31 }, { y, m, d });
  let i: number;
  let temp = 0;
  for (i = 1900; i < 2101 && offset > 0; i++) {
    temp = lunarYearDays(i);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    i--;
  }
  const year = i;
  const leap = leapMonth(year);
  let isLeap = false;
  for (i = 1; i < 13 && offset > 0; i++) {
    if (leap > 0 && i === leap + 1 && !isLeap) {
      i--;
      isLeap = true;
      temp = leapDays(year);
    } else {
      temp = monthDays(year, i);
    }
    if (isLeap && i === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) isLeap = false;
    else {
      isLeap = true;
      i--;
    }
  }
  if (offset < 0) {
    offset += temp;
    i--;
  }
  return { month: i, day: offset + 1, isLeap };
}

/**
 * 返回某日节气序号（0..23），非节气日返回 -1。
 * 以“上海正午（UTC 04:00）太阳黄经”判定：与目标节气黄经差 ≤ 0.55° 即命中。
 */
export function termIndexOf(year: number, month: number, day: number): number {
  const jd = julianDay(year, month, day, 4);
  const lon = solarLongitudeDeg(jd);
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < 24; i++) {
    const diff = angleDiff(lon, TERM_LONGITUDES[i]);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return bestDiff <= 0.55 ? best : -1;
}

/** 返回某年某节气的上海日期（month/day）；termIndex 0=立春 … 23=大寒 */
export function termDate(year: number, termIndex: number): { month: number; day: number } {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    const max =
      m === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : daysInMonth[m - 1];
    for (let d = 1; d <= max; d++) {
      if (termIndexOf(year, m, d) === termIndex) return { month: m, day: d };
    }
  }
  return { month: 0, day: 0 };
}

/** 某日节气名（非节气日返回空串） */
export function termNameOf(year: number, month: number, day: number): string {
  const idx = termIndexOf(year, month, day);
  return idx >= 0 ? TERM_NAMES[idx] : '';
}

/** 农历日名：初一…初十、十一…十九、二十、廿一…廿九、三十 */
export function lunarDayName(day: number): string {
  if (day < 1 || day > 30) return '';
  if (day <= 10) return `初${'一二三四五六七八九十'[day - 1]}`;
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  const tens = day < 20 ? '十' : '廿';
  const units = day % 10;
  return `${tens}${units === 0 ? '' : '一二三四五六七八九'[units - 1]}`;
}

const FESTIVALS: Record<
  string,
  { name: string; lunar?: { m: number; d: number }; term?: number; solar?: { m: number; d: number } }
> = {
  spring: { name: '春节', lunar: { m: 1, d: 1 } },
  lantern: { name: '元宵', lunar: { m: 1, d: 15 } },
  qingming: { name: '清明', term: 4 },
  dragon: { name: '端午', lunar: { m: 5, d: 5 } },
  qixi: { name: '七夕', lunar: { m: 7, d: 7 } },
  midautumn: { name: '中秋', lunar: { m: 8, d: 15 } },
  chongyang: { name: '重阳', lunar: { m: 9, d: 9 } },
  dongzhi: { name: '冬至', term: 21 },
  /** 公历固定节日：每年自动生效（2/14 情人节） */
  valentine: { name: '情人节', solar: { m: 2, d: 14 } },
};

/** 某日传统节日名（农历节日 + 清明/冬至节气日 + 公历节日如情人节），无则返回空串；每年自动计算 */
export function festivalNameOf(year: number, month: number, day: number): string {
  const lunar = toLunar(year, month, day);
  const termIndex = termIndexOf(year, month, day);
  for (const key of Object.keys(FESTIVALS)) {
    const f = FESTIVALS[key];
    if (f.solar && month === f.solar.m && day === f.solar.d) return f.name;
    if (f.lunar && !lunar.isLeap && lunar.month === f.lunar.m && lunar.day === f.lunar.d) return f.name;
    if (f.term !== undefined && termIndex === f.term) return f.name;
  }
  return '';
}

/** 上海时区当日档位：06:00–17:30 白天，17:30–19:30 黄昏，其余夜间 */
export function dayPeriodOf(hour: number, minute: number): DayPeriod {
  const t = hour + minute / 60;
  if (t >= 6 && t < 17.5) return 'day';
  if (t >= 17.5 && t < 19.5) return 'dusk';
  return 'night';
}

export function themeDayContext(now: Date = new Date()): ThemeDayContext {
  const shifted = new Date(now.getTime() + 8 * 3600000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  const termIndex = termIndexOf(year, month, day);
  const lunar = toLunar(year, month, day);

  let festivalKey = '';
  let festivalName = '';
  for (const key of Object.keys(FESTIVALS)) {
    const f = FESTIVALS[key];
    if (f.solar && month === f.solar.m && day === f.solar.d) {
      festivalKey = key;
      festivalName = f.name;
      break;
    }
    if (f.lunar && !lunar.isLeap && lunar.month === f.lunar.m && lunar.day === f.lunar.d) {
      festivalKey = key;
      festivalName = f.name;
      break;
    }
    if (f.term !== undefined && termIndex === f.term) {
      festivalKey = key;
      festivalName = f.name;
      break;
    }
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    termIndex,
    termName: termIndex >= 0 ? TERM_NAMES[termIndex] : '',
    lunar,
    festivalKey,
    festivalName,
    period: dayPeriodOf(hour, minute),
  };
}

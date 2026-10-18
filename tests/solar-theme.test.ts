import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  termDate,
  termIndexOf,
  toLunar,
  dayPeriodOf,
  themeDayContext,
} from '../apps/miniprogram/miniprogram/utils/solar';

test('节气：2026 年二十四节气日期正确（北京时间）', () => {
  assert.deepEqual(termDate(2026, 0), { month: 2, day: 4 }); // 立春
  assert.deepEqual(termDate(2026, 1), { month: 2, day: 18 }); // 雨水
  assert.deepEqual(termDate(2026, 3), { month: 3, day: 20 }); // 春分
  assert.deepEqual(termDate(2026, 4), { month: 4, day: 5 }); // 清明
  assert.deepEqual(termDate(2026, 9), { month: 6, day: 21 }); // 夏至
  assert.deepEqual(termDate(2026, 12), { month: 8, day: 7 }); // 立秋
  assert.deepEqual(termDate(2026, 15), { month: 9, day: 23 }); // 秋分
  assert.deepEqual(termDate(2026, 21), { month: 12, day: 22 }); // 冬至
  assert.deepEqual(termDate(2026, 22), { month: 1, day: 5 }); // 小寒
  assert.deepEqual(termDate(2026, 23), { month: 1, day: 20 }); // 大寒
});

test('节气：某日命中节气序号，非节气日返回 -1', () => {
  assert.equal(termIndexOf(2026, 2, 4), 0); // 立春
  assert.equal(termIndexOf(2026, 6, 21), 9); // 夏至
  assert.equal(termIndexOf(2026, 8, 15), -1); // 普通日
  assert.equal(termIndexOf(2026, 12, 21), -1); // 冬至前一日不是节气
  assert.equal(termIndexOf(2026, 12, 22), 21); // 冬至
});

test('农历：2026 年春节/端午/七夕/中秋日期正确', () => {
  assert.deepEqual(toLunar(2026, 2, 17), { month: 1, day: 1, isLeap: false }); // 春节
  assert.deepEqual(toLunar(2026, 6, 19), { month: 5, day: 5, isLeap: false }); // 端午
  assert.deepEqual(toLunar(2026, 8, 19), { month: 7, day: 7, isLeap: false }); // 七夕
  assert.deepEqual(toLunar(2026, 9, 25), { month: 8, day: 15, isLeap: false }); // 中秋
});

test('昼夜：时段边界正确（Asia/Shanghai）', () => {
  assert.equal(dayPeriodOf(5, 59), 'night');
  assert.equal(dayPeriodOf(6, 0), 'day');
  assert.equal(dayPeriodOf(17, 29), 'day');
  assert.equal(dayPeriodOf(17, 30), 'dusk');
  assert.equal(dayPeriodOf(19, 29), 'dusk');
  assert.equal(dayPeriodOf(19, 30), 'night');
});

test('节日：春节与中秋当天识别为节日点缀', () => {
  const spring = themeDayContext(new Date('2026-02-17T04:00:00Z')); // 上海 2/17 12:00
  assert.equal(spring.festivalKey, 'spring');
  assert.equal(spring.festivalName, '春节');
  assert.equal(spring.termIndex, -1); // 2/17 不是节气日

  const midautumn = themeDayContext(new Date('2026-09-25T04:00:00Z')); // 上海 9/25 12:00
  assert.equal(midautumn.festivalKey, 'midautumn');
  assert.equal(midautumn.festivalName, '中秋');
});

test('主题上下文：夏季普通日上午为白天档、非节气日', () => {
  const ctx = themeDayContext(new Date('2026-08-15T02:00:00Z')); // 上海 8/15 10:00
  assert.equal(ctx.year, 2026);
  assert.equal(ctx.month, 8);
  assert.equal(ctx.day, 15);
  assert.equal(ctx.termIndex, -1);
  assert.equal(ctx.termName, '');
  assert.equal(ctx.period, 'day');
});

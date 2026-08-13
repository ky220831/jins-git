/**
 * 第三阶段模拟器功能验证：
 * 1) 记录生理期 08-01~05 → 8 月格子出现 5 红 + 1 蓝（休息）
 * 2) 关闭“日历显示生理期” → 标记隐藏、数据保留
 * 3) 翻到 10 月 → 显示国庆节/调休上班标签
 * 4) 清理测试记录，恢复开关
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('../node_modules/miniprogram-automator/node_modules/ws');

const ws = new WebSocket(process.env.AUTO_WS || 'ws://127.0.0.1:9420');
let seq = 1;
const pending = new Map();
const events = [];
let failures = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = `r${seq++}`;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`[通过] ${label}${detail ? `（${detail}）` : ''}`);
  } else {
    console.log(`[失败] ${label}${detail ? `（${detail}）` : ''}`);
    failures += 1;
  }
}

ws.on('message', (d) => {
  const msg = JSON.parse(String(d));
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else p.resolve(msg.result || {});
  } else if (msg.method) {
    events.push(`[event ${msg.method}] ${JSON.stringify(msg.params || msg).slice(0, 300)}`);
  }
});

async function evaluate(code) {
  const res = await send('App.callFunction', { functionDeclaration: code, args: [] });
  return res.result;
}

async function probe() {
  return evaluate(`() => {
    const pages = getCurrentPages();
    const cal = pages.find((p) => p.route === 'pages/calendar/index');
    if (!cal) return { error: 'calendar page not found' };
    return {
      year: cal.data.year,
      month: cal.data.month,
      selectedDate: cal.data.selectedDate,
      periodCells: (cal.data.days || []).filter((d) => d.periodKind).length,
      periodKinds: (cal.data.days || []).filter((d) => d.periodKind).slice(0, 8).map((d) => d.key + ':' + d.periodKind),
      holidayCells: (cal.data.days || []).filter((d) => d.holidayLabel).length,
      holidayLabels: (cal.data.days || []).filter((d) => d.holidayLabel).slice(0, 8).map((d) => d.key + ':' + d.holidayLabel),
      periodVisible: cal.data.periodVisible,
      periodRecords: (cal.data.periodRecords || []).map((r) => ({ id: r.id, type: r.type, range: r.rangeLabel })),
      dayPeriod: cal.data.dayPeriod || null,
      error: cal.data.error || '',
    };
  }`);
}

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});

    const stack0 = await send('App.getPageStack');
    const routes0 = (stack0.pageStack || stack0 || []).map((p) => p.path);
    if (!routes0.includes('pages/calendar/index')) {
      await send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/calendar/index' }] });
      await sleep(4000);
    }

    // ---- 1. 记录生理期 08-01~05 ----
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      if (!cal) return { ok: false };
      cal.setData({ selectedDate: '2026-08-01', periodStart: '2026-08-01', periodEnd: '2026-08-05', showPeriodForm: true });
      cal.onAddPeriod();
      return { ok: true };
    }`);
    await sleep(6000);

    let data = await probe();
    check(
      '记录生理期后：8 月出现 5 实际红 + 1 休息蓝 + 5 预测红（共 11 个标记）',
      data.error === '' &&
        data.periodCells === 11 &&
        data.periodKinds.includes('2026-08-01:period') &&
        data.periodKinds.includes('2026-08-06:rest') &&
        data.periodKinds.includes('2026-08-23:period'),
      `periodCells=${data.periodCells} (${(data.periodKinds || []).join(', ')})`,
    );
    check(
      '保存后生成 1 条实际 + 1 条预测记录',
      (data.periodRecords || []).length === 2 &&
        data.periodRecords.some((r) => r.type === 'actual') &&
        data.periodRecords.some((r) => r.type === 'predicted'),
      JSON.stringify(data.periodRecords || []),
    );

    // ---- 2. 关闭显示开关 ----
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      cal.onTogglePeriodVisible({ detail: { value: false } });
      return { ok: true };
    }`);
    await sleep(5000);
    data = await probe();
    check(
      '关闭开关：格子标记隐藏但记录仍保留（PRD §29）',
      data.periodVisible === false && data.periodCells === 0 && (data.periodRecords || []).length === 2,
      `periodVisible=${data.periodVisible}, periodCells=${data.periodCells}, records=${(data.periodRecords || []).length}`,
    );

    // ---- 3. 恢复开关并翻到 10 月看节假日 ----
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      cal.onTogglePeriodVisible({ detail: { value: true } });
      return { ok: true };
    }`);
    await sleep(5000);
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      cal.onNext();
      return { ok: true };
    }`);
    await sleep(4000);
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      cal.onNext();
      return { ok: true };
    }`);
    await sleep(5000);
    data = await probe();
    check(
      '10 月显示国庆节（10-01~07）与调休上班（10-10）',
      data.month === 10 &&
        data.holidayLabels.includes('2026-10-01:国庆') &&
        data.holidayLabels.includes('2026-10-10:调休') &&
        data.holidayCells === 8,
      `holidayCells=${data.holidayCells} (${(data.holidayLabels || []).join(', ')})`,
    );
    check(
      '10 月没有 8 月记录的生理期标记（只显示当月数据）',
      data.periodCells === 0,
      `periodCells=${data.periodCells}`,
    );

    try {
      const shot = await send('App.captureScreenshot', {});
      const buf = Buffer.from(shot.data, 'base64');
      const file = path.join(__dirname, '..', 'work', 'phase3-october.png');
      fs.writeFileSync(file, buf);
      console.log('SCREENSHOT saved:', file, buf.length, 'bytes');
    } catch (err) {
      console.log('SHOT ERROR:', String(err.message));
    }

    // ---- 4. 清理：删除实际记录 + 恢复开关 ----
    const actualId = (data.periodRecords || []).find((r) => r.type === 'actual');
    if (actualId) {
      await evaluate(`() => {
        wx.cloud.callFunction({
          name: 'period-record',
          data: { action: 'delete', recordId: ${JSON.stringify(actualId.id)} },
          fail: (e) => console.error('cleanup delete failed', e),
        });
        return { ok: true };
      }`);
      await sleep(4000);
    }
    await evaluate(`() => {
      const cal = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      wx.cloud.callFunction({
        name: 'period-info',
        data: { action: 'set-visible', visible: true },
        fail: (e) => console.error('cleanup visible failed', e),
      });
      cal.setData({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
      cal.refresh();
      return { ok: true };
    }`);
    await sleep(6000);
    data = await probe();
    check(
      '清理完成：生理期记录已删除、开关已恢复',
      data.periodRecords.length === 0 && data.periodVisible === true,
      `records=${data.periodRecords.length}, periodVisible=${data.periodVisible}`,
    );

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 第三阶段模拟器验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  } catch (err) {
    console.log('ERR:', String((err && err.message) || err));
    failures += 1;
  }
  ws.close();
  process.exit(failures > 0 ? 1 : 0);
});

ws.on('error', (e) => {
  console.log('WS ERROR:', e.message);
  process.exit(1);
});

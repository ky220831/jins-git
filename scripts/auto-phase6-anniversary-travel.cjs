/**
 * 第六阶段端到端验证：纪念日 + 旅游计划 + 日历联动。
 * 流程：添加/编辑纪念日 → 日历出现 ❤️ 事件 → 添加旅行资料/行程 →
 * 日历出现 ✈️ 事件 → 清理测试数据。
 */
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
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`TIMEOUT ${method}`));
      }
    }, 15000);
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
    events.push(`[event ${msg.method}] ${JSON.stringify(msg.params || msg).slice(0, 200)}`);
  }
});

async function evaluate(code) {
  const res = await send('App.callFunction', { functionDeclaration: code, args: [] });
  return res.result;
}

async function openPage(url) {
  await send('App.callWxMethod', { method: 'reLaunch', args: [{ url }] });
  await sleep(6000);
}

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});

    // ---- 1. 添加纪念日 ----
    await openPage('/pages/anniversary/index');
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/anniversary/index');
      page.onShowForm();
      page.setData({ fName: '自动化纪念日', fDate: '2026-08-20', fTime: '18:30', fNote: '自动化测试' });
      page.onSave();
      return { ok: true };
    }`);
    await sleep(5000);
    let avData = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/anniversary/index');
      return {
        items: (page.data.items || []).map((a) => ({ id: a.id, name: a.name, countLabel: a.countLabel, nextOccurrence: a.nextOccurrence })),
        error: page.data.error || '',
      };
    }`);
    const av = (avData.items || []).find((a) => a.name === '自动化纪念日');
    check(
      '添加纪念日 2026-08-20 18:30',
      !!av && !!av.countLabel && av.nextOccurrence === '2026-08-20',
      `countLabel=${av ? av.countLabel : '无'}`,
    );

    // ---- 2. 编辑纪念日 ----
    if (av) {
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/anniversary/index');
        page.onEdit({ currentTarget: { dataset: { id: ${JSON.stringify(av.id)} } } });
        page.setData({ fName: '自动化纪念日2' });
        page.onSave();
        return { ok: true };
      }`);
      await sleep(5000);
      avData = await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/anniversary/index');
        return (page.data.items || []).map((a) => ({ id: a.id, name: a.name }));
      }`);
      check(
        '编辑纪念日名称成功',
        (avData || []).some((a) => a.id === av.id && a.name === '自动化纪念日2'),
        JSON.stringify(avData),
      );
    }

    // ---- 3. 日历出现 ❤️ 纪念日事件 ----
    await openPage('/pages/calendar/index');
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      page.onTapDay({ currentTarget: { dataset: { key: '2026-08-20' } } });
      return { ok: true };
    }`);
    await sleep(3000);
    const cal1 = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      return {
        dayEvents: (page.data.dayEvents || []).map((e) => ({ title: e.title, sourceType: e.sourceType, timeLabel: e.timeLabel })),
        selectedDate: page.data.selectedDate,
      };
    }`);
    check(
      '日历 08-20 显示 ❤️ 自动化纪念日2',
      (cal1.dayEvents || []).some((e) => e.sourceType === 'anniversary' && e.title === '❤️ 自动化纪念日2' && e.timeLabel === '18:30'),
      JSON.stringify(cal1.dayEvents),
    );

    // ---- 4. 添加旅行资料 ----
    await openPage('/pages/travel/index');
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/travel/index');
      page.onShowTripForm();
      page.setData({ tName: '自动化旅行', tCountry: '日本', tCity: '札幌', tTransport: '飞机' });
      page.onSaveTrip();
      return { ok: true };
    }`);
    await sleep(5000);
    let tripData = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/travel/index');
      return {
        trips: (page.data.trips || []).map((t) => ({ id: t.id, name: t.name, country: t.country, city: t.city })),
        error: page.data.error || '',
      };
    }`);
    const trip = (tripData.trips || []).find((t) => t.name === '自动化旅行');
    check(
      '添加旅行资料（日本·札幌）',
      !!trip && trip.country === '日本' && trip.city === '札幌',
      JSON.stringify(trip || {}),
    );

    // ---- 5. 安排临时行程 ----
    if (trip) {
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/travel/index');
        page.onShowPlanForm({ currentTarget: { dataset: { tripId: ${JSON.stringify(trip.id)} } } });
        page.setData({ pStart: '2026-08-21', pEnd: '2026-08-23', pTime: '08:00', pNote: '自动化行程' });
        page.onSavePlan();
        return { ok: true };
      }`);
      await sleep(6000);
      const planData = await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/travel/index');
        return (page.data.plans || []).map((p) => ({ id: p.id, name: p.name, dateLabel: p.dateLabel, timeLabel: p.timeLabel }));
      }`);
      check(
        '安排行程 08-21 ~ 08-23 08:00',
        (planData || []).some((p) => p.name === '自动化旅行' && p.dateLabel === '2026-08-21 ~ 2026-08-23' && p.timeLabel === '08:00'),
        JSON.stringify(planData),
      );
    }

    // ---- 6. 日历出现 ✈️ 行程事件 ----
    await openPage('/pages/calendar/index');
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      page.onTapDay({ currentTarget: { dataset: { key: '2026-08-21' } } });
      return { ok: true };
    }`);
    await sleep(3000);
    const cal2 = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/calendar/index');
      return (page.data.dayEvents || []).map((e) => ({ title: e.title, sourceType: e.sourceType, timeLabel: e.timeLabel }));
    }`);
    check(
      '日历 08-21 显示 ✈️ 自动化旅行',
      (cal2 || []).some((e) => e.sourceType === 'trip' && e.title === '✈️ 自动化旅行' && e.timeLabel === '08:00'),
      JSON.stringify(cal2),
    );

    // ---- 7. 清理测试数据 ----
    await evaluate(`() => {
      const doCall = (name, data) => wx.cloud.callFunction({ name, data, fail: (e) => console.error('cleanup fail', name, e) });
      const tripId = ${JSON.stringify(trip ? trip.id : '')};
      const avId = ${JSON.stringify(av ? av.id : '')};
      if (avId) doCall('anniversary', { action: 'delete', anniversaryId: avId });
      wx.cloud.callFunction({
        name: 'anniversary',
        data: { action: 'list' },
        success: (res) => {
          const items = (res.result && res.result.data) || [];
          for (const item of items) {
            if (String(item.name || '').indexOf('自动化纪念日') === 0) {
              doCall('anniversary', { action: 'delete', anniversaryId: item.id });
            }
          }
        },
        fail: (e) => console.error('cleanup anniversary list fail', e),
      });
      wx.cloud.callFunction({
        name: 'travel',
        data: { action: 'plans-month', year: 2026, month: 8 },
        success: (res) => {
          const plans = (res.result && res.result.data) || [];
          for (const plan of plans) {
            if (plan.name === '自动化旅行' || plan.name === '自动化行程') {
              doCall('travel', { action: 'delete-plan', planId: plan.id });
            }
          }
        },
        fail: (e) => console.error('cleanup plans list fail', e),
      });
      if (tripId) doCall('travel', { action: 'delete-trip', tripId });
      return { ok: true };
    }`);
    await sleep(7000);
    await evaluate(`() => {
      wx.cloud.callFunction({
        name: 'trash',
        data: { action: 'list' },
        success: (res) => {
          const items = (res.result && res.result.data) || [];
          for (const item of items) {
            wx.cloud.callFunction({ name: 'trash', data: { action: 'purge', trashId: item.id }, fail: (e) => console.error('purge fail', e) });
          }
        },
        fail: (e) => console.error('trash list fail', e),
      });
      return { ok: true };
    }`);
    await sleep(9000);

    await openPage('/pages/anniversary/index');
    const finalAv = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/anniversary/index');
      return (page.data.items || []).map((a) => a.name);
    }`);
    await openPage('/pages/travel/index');
    const finalTrip = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/travel/index');
      return {
        trips: (page.data.trips || []).map((t) => t.name),
        plans: (page.data.plans || []).map((p) => p.name),
      };
    }`);
    check(
      '清理完成：测试数据已删除',
      !(finalAv || []).includes('自动化纪念日2') &&
        !(finalTrip.trips || []).includes('自动化旅行') &&
        !(finalTrip.plans || []).includes('自动化旅行'),
      `anniversaries=${JSON.stringify(finalAv)}, trips=${JSON.stringify(finalTrip)}`,
    );

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 纪念日/旅游端到端验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  } catch (err) {
    console.log('ERR:', String((err && err.message) || err));
    failures += 1;
  }
  ws.close();
  process.exit(failures > 0 ? 1 : 0);
});

/**
 * 第三阶段自动化探针：连接微信开发者工具模拟器，
 * 打开日历页并读取生理期/节假日数据与渲染状态，保存截图。
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('../node_modules/miniprogram-automator/node_modules/ws');

const ws = new WebSocket(process.env.AUTO_WS || 'ws://127.0.0.1:9420');
let seq = 1;
const pending = new Map();
const events = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = `r${seq++}`;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
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

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});

    const stack0 = await send('App.getPageStack');
    const routes0 = (stack0.pageStack || stack0 || []).map((p) => p.path);
    console.log('ROUTES BEFORE:', JSON.stringify(routes0));

    if (!routes0.includes('pages/calendar/index')) {
      await send('App.callWxMethod', {
        method: 'navigateTo',
        args: [{ url: '/pages/calendar/index' }],
      });
    }
    await new Promise((r) => setTimeout(r, 5000));

    const probe = await send('App.callFunction', {
      functionDeclaration: `() => {
        const pages = getCurrentPages();
        const cal = pages.find((p) => p.route === 'pages/calendar/index');
        if (!cal) return { error: 'calendar page not found', routes: pages.map((p) => p.route) };
        const periodCells = (cal.data.days || []).filter((d) => d.periodKind).length;
        const holidayCells = (cal.data.days || []).filter((d) => d.holidayLabel).length;
        return {
          route: cal.route,
          year: cal.data.year,
          month: cal.data.month,
          selectedDate: cal.data.selectedDate,
          inMonthCells: (cal.data.days || []).filter((d) => d.inMonth).length,
          periodCells,
          holidayCells,
          periodVisible: cal.data.periodVisible,
          periodRecords: (cal.data.periodRecords || []).length,
          dayPeriod: cal.data.dayPeriod || null,
          dayHoliday: cal.data.dayHoliday ? { name: cal.data.dayHoliday.name, type: cal.data.dayHoliday.type } : null,
          monthTodos: (cal.data.monthTodos || []).length,
          monthEvents: (cal.data.monthEvents || []).length,
          error: cal.data.error || '',
          samplePeriodCells: (cal.data.days || []).filter((d) => d.periodKind).slice(0, 3),
          sampleHolidayCells: (cal.data.days || []).filter((d) => d.holidayLabel).slice(0, 3),
        };
      }`,
      args: [],
    });
    console.log('CALENDAR DATA:', JSON.stringify(probe, null, 2));

    try {
      const shot = await send('App.captureScreenshot', {});
      const buf = Buffer.from(shot.data, 'base64');
      const file = path.join(__dirname, '..', 'work', 'phase3-calendar.png');
      fs.writeFileSync(file, buf);
      console.log('SCREENSHOT saved:', file, buf.length, 'bytes');
    } catch (err) {
      console.log('SHOT ERROR:', String(err.message));
    }

    await new Promise((r) => setTimeout(r, 1500));
    console.log('--- CONSOLE/LOG EVENTS (last 15) ---');
    console.log(events.slice(-15).join('\n') || '(none)');
  } catch (err) {
    console.log('ERR:', String((err && err.message) || err));
  }
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => {
  console.log('WS ERROR:', e.message);
  process.exit(1);
});

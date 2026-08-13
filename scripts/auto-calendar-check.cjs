/**
 * 端到端验证：自动化驱动模拟器打开日历页，读取页面数据与控制台。
 */
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
    events.push(`[event ${msg.method}] ${JSON.stringify(msg.params || msg).slice(0, 400)}`);
  }
});

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});

    // 打开日历页
    await send('App.callWxMethod', {
      method: 'navigateTo',
      args: [{ url: '/pages/calendar/index' }],
    });
    await new Promise((r) => setTimeout(r, 4000));

    const stack = await send('App.getPageStack');
    console.log('PAGE STACK:', JSON.stringify(stack));

    const probe = await send('App.callFunction', {
      functionDeclaration: `() => {
        const pages = getCurrentPages();
        return pages.map((p) => ({
          route: p.route,
          data: {
            year: p.data.year,
            month: p.data.month,
            selectedDate: p.data.selectedDate,
            daysCount: (p.data.days || []).length,
            dayCells: (p.data.days || []).filter((d) => d.inMonth).length,
            monthTodos: (p.data.monthTodos || []).length,
            monthEvents: (p.data.monthEvents || []).length,
            dayTodos: (p.data.dayTodos || []).length,
            dayEvents: (p.data.dayEvents || []).length,
            error: p.data.error || '',
            showForm: p.data.showForm,
          },
        }));
      }`,
      args: [],
    });
    console.log('PAGE DATA:', JSON.stringify(probe, null, 2));

    await new Promise((r) => setTimeout(r, 1500));
    console.log('--- CONSOLE/LOG EVENTS ---');
    console.log(events.slice(0, 20).join('\n') || '(none)');
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

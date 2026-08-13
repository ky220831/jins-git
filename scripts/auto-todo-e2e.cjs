/**
 * 第二阶段端到端测试：模拟器日历页真实创建 To Do，验证 前端 → todo-create → 数据库 → 页面回显。
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
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }
    }, 8000);
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
    events.push(`[${msg.method}] ${JSON.stringify(msg.params || msg).slice(0, 300)}`);
  }
});

ws.on('open', async () => {
  try {
    console.log('enableLog...');
    await send('App.enableLog', {});
    console.log('getPageStack...');
    let stack = await send('App.getPageStack');
    console.log('stack:', JSON.stringify(stack));
    if (!(stack.pageStack || []).some((p) => p.path === 'pages/calendar/index')) {
      console.log('确保进入首页/日历...');
      await send('App.callFunction', {
        functionDeclaration: `() => new Promise((resolve) => {
          setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length && pages[0].route !== 'pages/home/index') {
              wx.reLaunch({ url: '/pages/home/index' });
            }
            resolve('ok');
          }, 2500);
        })`,
        args: [],
      });
      await new Promise((r) => setTimeout(r, 4000));
      await send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/calendar/index' }] });
      await new Promise((r) => setTimeout(r, 3000));
      stack = await send('App.getPageStack');
      console.log('stack after nav:', JSON.stringify(stack));
    }

    console.log('创建 To Do（真实客户端调用 todo-create）...');
    const createRes = await send('App.callFunction', {
      functionDeclaration: `() => wx.cloud.callFunction({
        name: 'todo-create',
        data: { title: 'E2E测试事项', date: '2026-08-13', time: '18:30', note: 'e2e' },
      }).then((r) => r.result)`,
      args: [],
    });
    console.log('CREATE RESULT:', JSON.stringify(createRes));

    console.log('刷新日历页...');
    await send('App.callFunction', {
      functionDeclaration: `() => {
        const p = getCurrentPages().find((x) => x.route === 'pages/calendar/index');
        if (p) p.refresh();
        return 'ok';
      }`,
      args: [],
    });
    await new Promise((r) => setTimeout(r, 4000));

    const probe = await send('App.callFunction', {
      functionDeclaration: `() => {
        const pages = getCurrentPages();
        const cal = pages.find((p) => p.route === 'pages/calendar/index');
        return cal ? {
          selectedDate: cal.data.selectedDate,
          monthTodos: (cal.data.monthTodos || []).map((t) => ({ id: t.id, title: t.title, date: t.date, time: t.time, status: t.status })),
          dayTodos: (cal.data.dayTodos || []).map((t) => ({ id: t.id, title: t.title, status: t.status })),
          dayEvents: (cal.data.dayEvents || []).map((e) => ({ id: e.id, title: e.title, time: e.timeLabel })),
          error: cal.data.error || '',
        } : null;
      }`,
      args: [],
    });
    console.log('AFTER CREATE:', JSON.stringify(probe, null, 2));

    await new Promise((r) => setTimeout(r, 1500));
    console.log('--- EVENTS ---');
    console.log(events.slice(0, 15).join('\n') || '(none)');
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

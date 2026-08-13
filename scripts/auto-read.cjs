/**
 * 直连开发者工具自动化通道：读取当前页面、页面数据、控制台日志，并保存模拟器截图。
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
    const stack = await send('App.getPageStack');
    console.log('PAGE STACK:', JSON.stringify(stack));

    const page = await send('App.getCurrentPage');
    console.log('CURRENT PAGE:', JSON.stringify(page));

    const probe = await send('App.callFunction', {
      functionDeclaration: `() => {
        const pages = getCurrentPages();
        return pages.map((p) => ({
          route: p.route,
          data: p.data,
          hasOnShow: typeof p.onShow,
          hasRefresh: typeof p.refresh,
        }));
      }`,
      args: [],
    });
    console.log('PROBE RESULT:', JSON.stringify(probe).slice(0, 1500));

    let data = null;
    try {
      data = await send('Page.getData', { path: (page && page.path) || (stack && stack.pageStack && stack.pageStack[0] && stack.pageStack[0].path) });
    } catch (err) {
      data = { error: String(err.message) };
    }
    console.log('PAGE DATA:', JSON.stringify(data).slice(0, 1200));

    try {
      const shot = await send('App.captureScreenshot', {});
      const buf = Buffer.from(shot.data, 'base64');
      const file = path.join(__dirname, '..', 'work', 'sim.png');
      fs.writeFileSync(file, buf);
      console.log('SCREENSHOT saved:', file, buf.length, 'bytes');
    } catch (err) {
      console.log('SHOT ERROR:', String(err.message));
    }

    await new Promise((r) => setTimeout(r, 3000));
    console.log('--- EVENTS ---');
    console.log(events.slice(0, 30).join('\n') || '(none)');
  } catch (err) {
    console.log('ERR:', String(err.message || err));
  }
  ws.close();
  process.exit(0);
});

ws.on('error', (e) => {
  console.log('WS ERROR:', e.message);
  process.exit(1);
});

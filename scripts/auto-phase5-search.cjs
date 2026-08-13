/**
 * 第五阶段搜索端到端验证：打开“漂亮饭”页 → 搜索“日料 上海” →
 * 确认返回结果 → 导入第一条到表单 → 清理（不保存数据）。
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

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});
    await send('App.callWxMethod', { method: 'reLaunch', args: [{ url: '/pages/restaurant/index' }] });
    await sleep(6000);

    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
      page.onShowSearch();
      page.setData({ searchKeyword: '日料', searchRegion: '上海' });
      page.onSearch();
      return { ok: true };
    }`);
    await sleep(8000);

    const data = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
      return {
        count: (page.data.searchResults || []).length,
        first: (page.data.searchResults || [])[0] || null,
        error: page.data.error || '',
      };
    }`);
    check(
      '搜索“日料 上海”返回真实结果',
      data.count > 0 && !!data.first && !!data.first.name && typeof data.first.lat === 'number',
      `count=${data.count}, first=${data.first ? data.first.name : '无'}`,
    );

    if (data.count > 0) {
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
        page.onImportSearch({ currentTarget: { dataset: { index: 0 } } });
        return { ok: true };
      }`);
      await sleep(2000);
      const form = await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
        return { fName: page.data.fName, fAddress: page.data.fAddress, fCity: page.data.fCity, fLat: page.data.fLat, fLng: page.data.fLng, showForm: page.data.showForm };
      }`);
      check(
        '导入结果到表单（名称/地址/坐标）',
        form.showForm && !!form.fName && !!form.fAddress && !!form.fLat && !!form.fLng,
        `name=${form.fName}, lat=${form.fLat}, lng=${form.fLng}`,
      );
      // 关闭表单，不保存任何数据
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
        page.onHideForm();
        page.onHideSearch();
        return { ok: true };
      }`);
    }

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 搜索端到端验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
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

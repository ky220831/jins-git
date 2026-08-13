/**
 * 第五阶段模拟器功能验证：
 * 1) 打开“漂亮饭”页 → 添加餐厅 → 安排行程（带时间）
 * 2) 收藏切换 → 餐厅与行程显示正确
 * 3) 清理：删除行程/餐厅（进回收站）→ 清空回收站
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
    }, 12000);
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

async function probe() {
  return evaluate(`() => {
    const pages = getCurrentPages();
    const page = pages.find((p) => p.route === 'pages/restaurant/index');
    if (!page) return { error: 'restaurant page not found', routes: pages.map((p) => p.route) };
    return {
      restaurants: (page.data.restaurants || []).map((r) => ({ id: r.id, name: r.name, favorite: r.favorite, visited: r.visited, enabled: r.enabled })),
      visits: (page.data.visits || []).map((v) => ({ id: v.id, name: v.name, timeLabel: v.timeLabel, date: v.date })),
      isOwner: page.data.isOwner,
      error: page.data.error || '',
    };
  }`);
}

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});
    await send('App.callWxMethod', { method: 'reLaunch', args: [{ url: '/pages/restaurant/index' }] });
    await sleep(6000);
    console.log('[step] restaurant page opened');

    // ---- 1. 添加餐厅 ----
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
      page.onShowForm();
      page.setData({ fName: '自动化测试餐厅', fAddress: '测试路 1 号', fCity: '上海', fCategory: '测试菜系', fPrice: '88', fRating: '4.5', fTags: '测试, 安静', fNote: '自动化' });
      page.onSaveRestaurant();
      return { ok: true };
    }`);
    await sleep(5000);

    // ---- 2. 安排行程（带时间）----
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
      const r = (page.data.restaurants || []).find((x) => x.name === '自动化测试餐厅');
      if (!r) return { ok: false };
      page.onShowVisitForm({ currentTarget: { dataset: { id: r.id } } });
      page.setData({ vDate: '2026-08-20', vTime: '18:30', vNote: '窗边' });
      page.onSaveVisit();
      return { ok: true };
    }`);
    await sleep(6000);

    let data = await probe();
    check(
      '添加餐厅并安排 08-20 18:30 行程',
      data.error === '' &&
        data.restaurants.some((r) => r.name === '自动化测试餐厅') &&
        data.visits.some((v) => v.name === '自动化测试餐厅' && v.timeLabel === '18:30' && v.date === '2026-08-20'),
      `restaurants=${data.restaurants.length}, visits=${JSON.stringify(data.visits)}`,
    );

    // ---- 3. 收藏切换 ----
    const restId = (data.restaurants.find((r) => r.name === '自动化测试餐厅') || {}).id;
    if (restId) {
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
        page.onToggleRestaurant({ currentTarget: { dataset: { id: ${JSON.stringify(restId)}, field: 'favorite' } } });
        return { ok: true };
      }`);
      await sleep(5000);
      data = await probe();
      check('收藏切换成功', (data.restaurants.find((r) => r.id === restId) || {}).favorite === true);
    }

    // ---- 4. 清理 ----
    const visitId = (data.visits.find((v) => v.name === '自动化测试餐厅') || {}).id;
    if (visitId && restId) {
      await evaluate(`() => {
        wx.cloud.callFunction({
          name: 'restaurant',
          data: { action: 'delete-visit', visitId: ${JSON.stringify(visitId)} },
          fail: (e) => console.error('cleanup visit failed', e),
        });
        wx.cloud.callFunction({
          name: 'restaurant',
          data: { action: 'delete', restaurantId: ${JSON.stringify(restId)} },
          fail: (e) => console.error('cleanup restaurant failed', e),
        });
        return { ok: true };
      }`);
      await sleep(6000);
      await evaluate(`() => {
        wx.cloud.callFunction({
          name: 'trash',
          data: { action: 'list' },
          success: (res) => {
            const items = (res.result && res.result.data) || [];
            for (const item of items) {
              wx.cloud.callFunction({
                name: 'trash',
                data: { action: 'purge', trashId: item.id },
                fail: (e) => console.error('cleanup purge failed', e),
              });
            }
          },
          fail: (e) => console.error('cleanup trash list failed', e),
        });
        return { ok: true };
      }`);
      await sleep(7000);
      await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/restaurant/index');
        if (page) page.refresh();
        return { ok: true };
      }`);
      await sleep(4000);
      data = await probe();
      check(
        '清理完成：餐厅/行程均为空',
        data.restaurants.length === 0 && data.visits.length === 0,
        `restaurants=${data.restaurants.length}, visits=${data.visits.length}`,
      );
    }

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 第五阶段模拟器验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
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

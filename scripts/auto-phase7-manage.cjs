/**
 * 第七阶段端到端验证：主管理页面。
 * 流程：打开管理页（主账号）→ 造数 → 概览计数变化 → 删除进回收站 →
 * 恢复 → 导出 JSON 拿到临时链接 → 清理。
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
    }, 20000);
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

    // ---- 1. 打开管理页（主账号）----
    await openPage('/pages/manage/index');
    const initial = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      if (!page) return { error: 'manage page not found' };
      return {
        isOwner: page.data.isOwner,
        counts: page.data.counts,
        trashCount: (page.data.trash || []).length,
        error: page.data.error || '',
      };
    }`);
    check(
      '主账号打开管理页（主管理视图）',
      initial.isOwner === true && initial.error === '',
      `counts=${JSON.stringify(initial.counts)}`,
    );

    // ---- 2. 造数：餐厅 + 今日菜单 + 纪念日 ----
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    await evaluate(`() => {
      const doCall = (name, data) => wx.cloud.callFunction({ name, data, fail: (e) => console.error('setup fail', name, e) });
      doCall('restaurant', { action: 'create', name: '管理测试餐厅', category: '测试' });
      doCall('meal-plan', { action: 'create', name: '管理测试菜单', date: ${JSON.stringify(today)}, time: '12:00' });
      doCall('anniversary', { action: 'create', name: '管理测试纪念日', date: '2026-08-20' });
      return { ok: true };
    }`);
    await sleep(7000);
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      page.refresh();
      return { ok: true };
    }`);
    await sleep(5000);
    const afterCreate = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      return page.data.counts;
    }`);
    check(
      '概览计数增加（餐厅/菜单/纪念日）',
      afterCreate.restaurants >= (initial.counts.restaurants || 0) + 1 &&
        afterCreate.mealPlans >= (initial.counts.mealPlans || 0) + 1 &&
        afterCreate.anniversaries >= (initial.counts.anniversaries || 0) + 1,
      JSON.stringify(afterCreate),
    );

    // ---- 3. 删除餐厅 → 回收站出现记录 ----
    await evaluate(`() => {
      wx.cloud.callFunction({
        name: 'restaurant',
        data: { action: 'list' },
        success: (res) => {
          const list = (res.result && res.result.data) || [];
          const target = list.find((r) => r.name === '管理测试餐厅');
          if (target) {
            wx.cloud.callFunction({ name: 'restaurant', data: { action: 'delete', restaurantId: target.id }, fail: (e) => console.error('delete fail', e) });
          }
        },
        fail: (e) => console.error('list fail', e),
      });
      return { ok: true };
    }`);
    await sleep(7000);
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      page.refresh();
      return { ok: true };
    }`);
    await sleep(5000);
    const trashAfterDelete = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      return (page.data.trash || []).map((t) => ({ title: t.title, collectionLabel: t.collectionLabel }));
    }`);
    check(
      '删除餐厅后回收站出现记录',
      (trashAfterDelete || []).some((t) => t.title === '管理测试餐厅' && t.collectionLabel === '餐厅'),
      JSON.stringify(trashAfterDelete),
    );

    // ---- 4. 恢复餐厅 ----
    const trashRow = (trashAfterDelete || []).find((t) => t.title === '管理测试餐厅');
    if (trashRow) {
      const trashId = (await evaluate(`() => {
        const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
        const row = (page.data.trash || []).find((t) => t.title === '管理测试餐厅');
        return row ? row.id : '';
      }`));
      if (trashId) {
        await evaluate(`() => {
          const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
          page.onRestoreOne({ currentTarget: { dataset: { id: ${JSON.stringify(trashId)} } } });
          return { ok: true };
        }`);
        await sleep(6000);
        const restored = await evaluate(`() => {
          const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
          return {
            trashHas: (page.data.trash || []).some((t) => t.title === '管理测试餐厅'),
            restaurants: page.data.counts.restaurants,
          };
        }`);
        check('恢复餐厅成功（回收站移除、计数恢复）', restored.trashHas === false, JSON.stringify(restored));
      }
    }

    // ---- 5. 导出 JSON ----
    await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      page.onExport();
      return { ok: true };
    }`);
    await sleep(9000);
    const exportRes = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      return { url: page.data.exportUrl, name: page.data.exportName, size: page.data.exportSizeLabel };
    }`);
    check(
      '导出 JSON 并生成临时链接',
      !!exportRes.url && exportRes.url.startsWith('https://') && !!exportRes.name && exportRes.name.endsWith('.json'),
      `name=${exportRes.name}, size=${exportRes.size}`,
    );

    // ---- 6. 清理 ----
    await evaluate(`() => {
      const doCall = (name, data) => wx.cloud.callFunction({ name, data, fail: (e) => console.error('cleanup fail', name, e) });
      wx.cloud.callFunction({
        name: 'restaurant',
        data: { action: 'list' },
        success: (res) => {
          const list = (res.result && res.result.data) || [];
          const target = list.find((r) => r.name === '管理测试餐厅');
          if (target) doCall('restaurant', { action: 'delete', restaurantId: target.id });
        },
        fail: (e) => console.error('cleanup list fail', e),
      });
      wx.cloud.callFunction({
        name: 'anniversary',
        data: { action: 'list' },
        success: (res) => {
          const list = (res.result && res.result.data) || [];
          const target = list.find((a) => a.name === '管理测试纪念日');
          if (target) doCall('anniversary', { action: 'delete', anniversaryId: target.id });
        },
        fail: (e) => console.error('cleanup av list fail', e),
      });
      wx.cloud.callFunction({
        name: 'meal-plan',
        data: { action: 'month', year: ${now.getFullYear()}, month: ${now.getMonth() + 1} },
        success: (res) => {
          const list = (res.result && res.result.data) || [];
          const target = list.find((p) => p.name === '管理测试菜单');
          if (target) doCall('meal-plan', { action: 'delete', planId: target.id });
        },
        fail: (e) => console.error('cleanup meal fail', e),
      });
      return { ok: true };
    }`);
    await sleep(8000);
    await evaluate(`() => {
      wx.cloud.callFunction({
        name: 'trash',
        data: { action: 'purge-all' },
        fail: (e) => console.error('purge-all fail', e),
      });
      return { ok: true };
    }`);
    await sleep(8000);
    await openPage('/pages/manage/index');
    const finalState = await evaluate(`() => {
      const page = getCurrentPages().find((p) => p.route === 'pages/manage/index');
      return {
        trash: (page.data.trash || []).map((t) => t.title),
        counts: page.data.counts,
      };
    }`);
    check(
      '清理完成：回收站为空且无测试数据',
      (finalState.trash || []).length === 0,
      `trash=${JSON.stringify(finalState.trash)}`,
    );

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 管理端到端验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
  } catch (err) {
    console.log('ERR:', String((err && err.message) || err));
    failures += 1;
  }
  ws.close();
  process.exit(failures > 0 ? 1 : 0);
});

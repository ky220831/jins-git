/**
 * 第四阶段模拟器功能验证：
 * 1) 打开“今日菜单”页 → 添加素材 → 上架带时间菜单 → 今日列表显示
 * 2) 下架 → 今日列表清空
 * 3) 清理：删除菜单与素材（进回收站）→ 清空回收站
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
    const meal = pages.find((p) => p.route === 'pages/meal/index');
    if (!meal) return { error: 'meal page not found', routes: pages.map((p) => p.route) };
    return {
      todayPlans: (meal.data.todayPlans || []).map((p) => ({ id: p.id, name: p.name, timeLabel: p.timeLabel })),
      templates: (meal.data.templates || []).map((t) => ({ id: t.id, name: t.name, enabled: t.enabled })),
      trashItems: (meal.data.trashItems || []).map((t) => ({ id: t.id, collection: t.collection, title: t.title })),
      isOwner: meal.data.isOwner,
      error: meal.data.error || '',
    };
  }`);
}

ws.on('open', async () => {
  try {
    await send('App.enableLog', {});
    console.log('[step] enableLog ok');

    await send('App.callWxMethod', { method: 'reLaunch', args: [{ url: '/pages/meal/index' }] });
    await sleep(6000);
    console.log('[step] meal page opened');

    // ---- 1. 添加素材 ----
    await evaluate(`() => {
      const meal = getCurrentPages().find((p) => p.route === 'pages/meal/index');
      if (!meal) return { ok: false };
      meal.setData({ showTemplateForm: true, editingTemplateId: '', templateName: '自动化测试菜谱', templateCategory: '测试' });
      meal.onSaveTemplate();
      return { ok: true };
    }`);
    await sleep(5000);

    // ---- 2. 上架带时间菜单 ----
    await evaluate(`() => {
      const meal = getCurrentPages().find((p) => p.route === 'pages/meal/index');
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      meal.setData({ showPlanForm: true, planName: '', planDate: today, planTime: '18:30', planNote: '自动化测试', templatePickerIndex: 0 });
      meal.onAddPlan();
      return { ok: true };
    }`);
    await sleep(6000);

    let data = await probe();
    check(
      '添加素材并上架后：今日列表出现该菜单（带时间 18:30）',
      data.error === '' &&
        data.templates.some((t) => t.name === '自动化测试菜谱') &&
        data.todayPlans.some((p) => p.name === '自动化测试菜谱' && p.timeLabel === '18:30'),
      `templates=${data.templates.length}, todayPlans=${JSON.stringify(data.todayPlans)}`,
    );

    // ---- 3. 下架 ----
    const planId = (data.todayPlans.find((p) => p.name === '自动化测试菜谱') || {}).id;
    if (planId) {
      await evaluate(`() => {
        const meal = getCurrentPages().find((p) => p.route === 'pages/meal/index');
        meal.onOfflinePlan({ currentTarget: { dataset: { id: ${JSON.stringify(planId)} } } });
        return { ok: true };
      }`);
      await sleep(5000);
      data = await probe();
      check('下架后今日列表清空', data.todayPlans.length === 0, `todayPlans=${data.todayPlans.length}`);
    } else {
      check('找到上架的菜单记录', false);
    }

    // ---- 4. 清理：删除菜单/素材 → 清空回收站 ----
    const templateId = (data.templates.find((t) => t.name === '自动化测试菜谱') || {}).id;
    if (planId && templateId) {
      await evaluate(`() => {
        wx.cloud.callFunction({
          name: 'meal-plan',
          data: { action: 'delete', planId: ${JSON.stringify(planId)} },
          fail: (e) => console.error('cleanup plan delete failed', e),
        });
        wx.cloud.callFunction({
          name: 'meal-template',
          data: { action: 'delete', templateId: ${JSON.stringify(templateId)} },
          fail: (e) => console.error('cleanup template delete failed', e),
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
        const meal = getCurrentPages().find((p) => p.route === 'pages/meal/index');
        if (meal) meal.refresh();
        return { ok: true };
      }`);
      await sleep(4000);
      data = await probe();
      check(
        '清理完成：素材/菜单/回收站均为空',
        data.templates.length === 0 && data.todayPlans.length === 0 && data.trashItems.length === 0,
        `templates=${data.templates.length}, plans=${data.todayPlans.length}, trash=${data.trashItems.length}`,
      );
    }

    const errors = events.filter((e) => e.includes('type":"error'));
    if (errors.length > 0) {
      console.log('--- CONSOLE ERRORS ---');
      console.log(errors.slice(0, 5).join('\n'));
    }
    console.log(failures === 0 ? '\n===== 第四阶段模拟器验证全部通过 =====' : `\n===== 存在 ${failures} 项失败 =====`);
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

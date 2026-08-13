/** 清理端到端测试产生的 To Do 与日历事件（按标题前缀精确匹配） */
const cloud = require('wx-server-sdk');

cloud.init({ env: process.env.CLOUDBASE_ENV_ID });
const db = cloud.database();
const _ = db.command;

async function main() {
  const res = await db.collection('todos').where({ title: 'E2E测试事项' }).get();
  const ids = res.data.map((d) => d.id);
  if (ids.length === 0) {
    console.log('没有需要清理的 E2E 数据');
    return;
  }
  await db.collection('todos').where({ title: 'E2E测试事项' }).remove();
  await db.collection('calendar_events')
    .where({ sourceType: 'todo', sourceId: _.in(ids) })
    .remove();
  console.log(`已清理 ${ids.length} 条 E2E To Do 及其日历事件`);
}

main().catch((err) => {
  console.error('清理失败:', String((err && err.message) || err));
  process.exit(1);
});

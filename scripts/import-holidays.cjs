/**
 * 通用节假日导入工具：把某一年官方放假/调休安排写入 holiday_calendar。
 *
 * 为什么需要手动导入：
 * 国务院每年（一般 11 月）以“国办发明电”发布下一年放假安排，只有文字公告、
 * 没有公开的机器可读 API，因此“自动抓取”不可靠也不合规。本项目做成：
 * 每年官方发布后，把安排整理成 JSON，跑一条命令导入；双人日历立即生效，
 * 数据带 source + version 可追溯，政策中途调整可重新导入覆盖。
 *
 * 用法（先设置临时密钥）：
 *   $env:TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN
 *   $env:CLOUDBASE_ENV_ID = 环境 ID
 *   node scripts/import-holidays.cjs path\to\holidays-2027.json
 *
 * JSON 格式：
 * {
 *   "year": 2027,
 *   "source": "国务院办公厅 国办发明电〔2026〕x号",
 *   "rows": [
 *     { "date": "2027-10-01", "name": "国庆节", "type": "holiday" },
 *     { "date": "2027-10-09", "name": "调休上班", "type": "makeup_workday" }
 *   ]
 * }
 * type: holiday | makeup_workday（其余字段自动推导）
 */
const fs = require('fs');
const path = require('path');
const cloud = require('wx-server-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('用法: node scripts/import-holidays.cjs <json-file> [--delete-others]');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();

function norm(row) {
  const type = row.type === 'makeup_workday' ? 'makeup_workday' : 'holiday';
  return {
    date: String(row.date),
    name: String(row.name || (type === 'makeup_workday' ? '调休上班' : '')),
    type,
    isHoliday: row.isHoliday ?? type === 'holiday',
    isWorkday: row.isWorkday ?? type === 'makeup_workday',
    isMakeupWorkday: row.isMakeupWorkday ?? type === 'makeup_workday',
  };
}

function same(a, b) {
  return (
    a.date === b.date &&
    a.name === b.name &&
    a.type === b.type &&
    a.isHoliday === b.isHoliday &&
    a.isWorkday === b.isWorkday &&
    a.isMakeupWorkday === b.isMakeupWorkday
  );
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
  const year = Number(raw.year);
  const source = String(raw.source || '国务院办公厅');
  const rows = (raw.rows || []).map(norm);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    console.error('year 无效');
    process.exit(1);
  }
  if (rows.length === 0) {
    console.error('rows 为空');
    process.exit(1);
  }

  console.log(`环境: ${envId}，年份 ${year}，共 ${rows.length} 条`);
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const id = `hol_${row.date}`;
    try {
      const existingRes = await db.collection('holiday_calendar').doc(id).get();
      const existing = existingRes.data;
      if (existing && same(existing, row)) {
        unchanged += 1;
        continue;
      }
      const record = {
        id,
        year,
        ...row,
        source,
        version: existing ? Number(existing.version || 0) + 1 : 1,
        updatedAt: new Date(),
      };
      await db.collection('holiday_calendar').doc(id).set({ data: record });
      if (existing) updated += 1;
      else created += 1;
    } catch (err) {
      console.log(`[失败] ${row.date}: ${String((err && err.message) || err)}`);
    }
  }
  console.log(`完成：新建 ${created}，更新 ${updated}，未变化 ${unchanged}`);

  if (process.argv.includes('--delete-others')) {
    try {
      const kept = rows.map((r) => r.date);
      const res = await db
        .collection('holiday_calendar')
        .where({ year })
        .get();
      const stale = res.data.filter((d) => !kept.includes(d.date));
      for (const doc of stale) {
        await db.collection('holiday_calendar').doc(doc.id).remove();
      }
      console.log(`[--delete-others] 移除该年份不再使用的 ${stale.length} 条旧记录`);
    } catch (err) {
      console.log('[--delete-others] 失败:', String((err && err.message) || err));
    }
  }

  try {
    const count = await db.collection('holiday_calendar').where({ year }).count();
    console.log(`[验证] holiday_calendar 中 ${year} 年记录数: ${count.total}`);
  } catch (err) {
    console.log('[验证] 失败:', String((err && err.message) || err));
  }
}

main()
  .catch((err) => {
    console.error('执行异常:', String((err && err.message) || err));
    process.exit(1);
  })
  .finally(() => process.exit(0));

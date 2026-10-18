/**
 * 通用节假日导入工具：把某一年官方放假/调休安排写入 holiday_calendar。
 *
 * 为什么需要手动导入：
 * 国务院每年（一般 11 月）以“国办发明电”发布下一年放假安排，只有文字公告、
 * 没有公开的机器可读 API，因此“自动抓取”不可靠也不合规。本项目做成：
 * 每年官方发布后，把安排整理成 JSON，跑一条命令导入；双人日历立即生效，
 * 数据带 source + version 可追溯，政策中途调整可重新导入覆盖。
 *
 * 用法：
 *   1) 生成某年模板（无需密钥）：node scripts/import-holidays.cjs --template 2027
 *   2) 只校验不改库：      node scripts/import-holidays.cjs holidays-2027.json --dry-run
 *   3) 正式导入（先设置临时密钥）：
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

const fileArg = process.argv[2];
const flags = process.argv.slice(2);
const templateYear = flags.includes('--template') ? Number(flags[flags.indexOf('--template') + 1]) : null;
const dryRun = flags.includes('--dry-run');

if (templateYear) {
  if (!Number.isInteger(templateYear) || templateYear < 2000 || templateYear > 2100) {
    console.error('--template 年份无效（需 2000~2100 的整数）');
    process.exit(1);
  }
  console.log(`已生成 ${templateYear} 年节假日模板（复制到 holidays-${templateYear}.json 后填写）：\n`);
  console.log(JSON.stringify(
    {
      year: templateYear,
      source: '国务院办公厅 国办发明电〔YYYY〕X号',
      rows: [
        { date: `${templateYear}-10-01`, name: '国庆节', type: 'holiday' },
        { date: `${templateYear}-10-08`, name: '调休上班', type: 'makeup_workday' },
      ],
    },
    null,
    2,
  ));
  process.exit(0);
}

if (!fileArg) {
  console.error(
    '用法:\n' +
      '  生成模板:  node scripts/import-holidays.cjs --template 2027\n' +
      '  只校验:    node scripts/import-holidays.cjs holidays-2027.json --dry-run\n' +
      '  正式导入:  node scripts/import-holidays.cjs holidays-2027.json [--delete-others]',
  );
  process.exit(1);
}

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId && !dryRun) {
  console.error('缺少 CLOUDBASE_ENV_ID（--dry-run 无需设置）');
  process.exit(1);
}

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

function isValidDate(dateStr, year) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    y === year &&
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
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

  // 校验：日期合法且属于该年、类型合法、无重复日期
  const seen = new Set();
  const errors = [];
  for (const row of rows) {
    if (!['holiday', 'makeup_workday'].includes(row.type)) {
      errors.push(`${row.date}: type 必须是 holiday 或 makeup_workday`);
    }
    if (!isValidDate(row.date, year)) {
      errors.push(`${row.date}: 不是合法日期或不属于 ${year} 年`);
    }
    if (seen.has(row.date)) {
      errors.push(`${row.date}: 日期重复`);
    }
    seen.add(row.date);
    if (row.type === 'holiday' && !row.name) {
      errors.push(`${row.date}: holiday 必须填写 name`);
    }
  }
  if (errors.length > 0) {
    console.error('校验未通过：');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  const holidayCount = rows.filter((r) => r.type === 'holiday').length;
  const makeupCount = rows.length - holidayCount;
  if (dryRun) {
    console.log(`[dry-run] ${year} 年，${rows.length} 条（放假 ${holidayCount} / 调休 ${makeupCount}）`);
    for (const row of rows) {
      console.log(`  - ${row.date}  ${row.name}（${row.type === 'holiday' ? '放假' : '调休上班'}）`);
    }
    console.log('[dry-run] 校验通过，未写入任何数据');
    return;
  }

  cloud.init({ env: envId });
  const db = cloud.database();
  console.log(`环境: ${envId}，年份 ${year}，共 ${rows.length} 条（放假 ${holidayCount} / 调休 ${makeupCount}）`);
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

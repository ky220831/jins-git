/**
 * 一次性工具：把 2026 年官方放假/调休安排写入 holiday_calendar。
 * 数据源：国务院办公厅关于2026年部分节假日安排的通知（国办发明电〔2025〕7号）
 * https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
 *
 * 用法（先设置临时密钥，见 04-开发者操作手册）：
 *   $env:TENCENTCLOUD_SECRETID / SECRETKEY / SESSIONTOKEN
 *   $env:CLOUDBASE_ENV_ID = 环境 ID
 *   node scripts/seed-holidays-2026.cjs
 */
const cloud = require('wx-server-sdk');

const envId = process.env.CLOUDBASE_ENV_ID;
if (!envId) {
  console.error('缺少 CLOUDBASE_ENV_ID');
  process.exit(1);
}

cloud.init({ env: envId });
const db = cloud.database();

const SOURCE = '国务院办公厅 国办发明电〔2025〕7号';

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateOf(month, day) {
  return `2026-${pad(month)}-${pad(day)}`;
}

/** [month, dayStart, dayEnd] 区间内的放假日期 */
function holidayRange(name, month, startDay, endDay) {
  const rows = [];
  for (let day = startDay; day <= endDay; day += 1) {
    rows.push({
      date: dateOf(month, day),
      name,
      type: 'holiday',
      isHoliday: true,
      isWorkday: false,
      isMakeupWorkday: false,
    });
  }
  return rows;
}

/** 调休上班日 */
function makeup(month, day) {
  return {
    date: dateOf(month, day),
    name: '调休上班',
    type: 'makeup_workday',
    isHoliday: false,
    isWorkday: true,
    isMakeupWorkday: true,
  };
}

const rows = [
  ...holidayRange('元旦', 1, 1, 3),
  makeup(1, 4),
  ...holidayRange('春节', 2, 15, 23),
  makeup(2, 14),
  makeup(2, 28),
  ...holidayRange('清明节', 4, 4, 6),
  ...holidayRange('劳动节', 5, 1, 5),
  makeup(5, 9),
  ...holidayRange('端午节', 6, 19, 21),
  ...holidayRange('中秋节', 9, 25, 27),
  ...holidayRange('国庆节', 10, 1, 7),
  makeup(9, 20),
  makeup(10, 10),
];

async function main() {
  console.log(`环境: ${envId}，共 ${rows.length} 条 2026 年放假/调休数据`);
  let ok = 0;
  for (const row of rows) {
    const record = {
      id: `hol_${row.date}`,
      year: 2026,
      ...row,
      source: SOURCE,
      version: 1,
      updatedAt: new Date(),
    };
    try {
      await db.collection('holiday_calendar').doc(record.id).set({ data: record });
      ok += 1;
    } catch (err) {
      console.log(`[失败] ${row.date}: ${String((err && err.message) || err)}`);
    }
  }
  console.log(`完成：成功 ${ok}/${rows.length}`);

  try {
    const res = await db
      .collection('holiday_calendar')
      .where({ year: 2026 })
      .count();
    console.log(`[验证] holiday_calendar 中 2026 年记录数: ${res.total}`);
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

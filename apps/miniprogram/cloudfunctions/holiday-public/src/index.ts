import type { HolidayDayView } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import { HolidayService } from '../../_shared/holidayService';

/**
 * 公共节假日查询（v1.1.6 游客模式用，方案 B）。
 *
 * 设计边界：
 * - holiday_calendar 是年度官方公开安排（无 spaceId、无私人字段），属公共数据；
 * - 本函数不校验空间身份，任何进入小程序的人都能查（含游客）；
 * - 仅返回 date/name/type/isHoliday/isWorkday/isMakeupWorkday 公共字段，
 *   绝不返回任何私人业务数据（目标 2）。
 */
export const main = createHandler<{ year?: number; month?: number }, { days: HolidayDayView[] }>(
  async (event) => {
    const year = Number(event.year);
    const month = Number(event.month);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new AppError(ErrorCodes.VALIDATION, '参数无效');
    }
    const service = new HolidayService(new CloudRepo());
    const days = await service.month(year, month);
    return { days };
  },
);

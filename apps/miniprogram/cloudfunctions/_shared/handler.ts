import type { ApiResponse } from '../../../../packages/types/src';
import { AppError } from './errors';

/**
 * 云函数统一包装：捕获 AppError 转为 { ok:false, code, message }，
 * 未预期错误统一返回 INTERNAL，避免把内部细节暴露给客户端。
 */
export function createHandler<TEvent, TResult>(
  run: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<ApiResponse<TResult>> {
  return async (event: TEvent) => {
    try {
      const data = await run(event);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof AppError) {
        return { ok: false, code: err.code, message: err.message };
      }
      console.error('[our-life] 未预期错误:', err);
      return { ok: false, code: 'INTERNAL', message: '服务器开小差了，请稍后重试' };
    }
  };
}

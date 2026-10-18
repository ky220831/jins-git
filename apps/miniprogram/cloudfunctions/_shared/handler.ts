import type { ApiResponse } from '../../../../packages/types/src';
import { AppError } from './errors';
import { logEvent, newRequestId } from './logger';

/**
 * 云函数统一包装：捕获 AppError 转为 { ok:false, code, message }，
 * 未预期错误统一返回 INTERNAL，避免把内部细节暴露给客户端。
 */
export function createHandler<TEvent, TResult>(
  run: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<ApiResponse<TResult>> {
  return async (event: TEvent) => {
    const requestId = newRequestId();
    const action = (event as { action?: string } | undefined)?.action ?? 'run';
    const startedAt = Date.now();
    try {
      const data = await run(event);
      logEvent(requestId, action, { result: 'success', ms: Date.now() - startedAt });
      return { ok: true, data };
    } catch (err) {
      if (err instanceof AppError) {
        logEvent(requestId, action, {
          result: 'error',
          code: err.code,
          ms: Date.now() - startedAt,
        });
        return { ok: false, code: err.code, message: err.message, requestId };
      }
      console.error(`[our-life] 未预期错误 requestId=${requestId}`, err);
      return {
        ok: false,
        code: 'INTERNAL',
        message: '服务器开小差了，请稍后重试',
        requestId,
      };
    }
  };
}

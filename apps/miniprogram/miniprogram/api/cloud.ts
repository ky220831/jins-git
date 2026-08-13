import type { ApiResponse } from '../lib/shared/types/index';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 云函数调用统一封装：成功只返回 data，失败抛 ApiError。
 * 所有页面通过 Service → 本封装调用云函数，禁止页面直接操作数据库。
 */
export async function callFunction<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  let res: ICloud.CallFunctionResult;
  try {
    res = await wx.cloud.callFunction({ name, data });
  } catch (err) {
    console.error(`[callFunction] 调用 ${name} 网络失败:`, err);
    throw new ApiError('NETWORK', '网络异常，请检查网络后重试');
  }

  const payload = res.result as ApiResponse<T> | undefined;
  if (!payload) {
    throw new ApiError('EMPTY_RESPONSE', '服务返回异常，请稍后重试');
  }
  if (!payload.ok) {
    console.error(`[callFunction] ${name} 返回错误:`, payload);
    throw new ApiError(payload.code, payload.message);
  }
  return payload.data;
}

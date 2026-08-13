import cloud from 'wx-server-sdk';
import type { RestaurantImagesInput, RestaurantImagesResult } from '../../../../../packages/types/src';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';

/**
 * 通过云函数返回图片临时访问地址：
 * 存储权限设为“仅创建者可读写”后，另一方也能经服务器换取临时 URL 查看（隐私保护）。
 */
export const main = createHandler<RestaurantImagesInput, RestaurantImagesResult>(async (event) => {
  const fileIDs = Array.isArray(event?.fileIDs)
    ? event.fileIDs.filter((f: string) => typeof f === 'string' && f.startsWith('cloud://'))
    : [];
  if (fileIDs.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION, '缺少图片 fileID');
  }
  const res = await cloud.getTempFileURL({ fileList: fileIDs });
  const urls = (res.fileList || [])
    .filter((f) => f.status === 0 && f.tempFileURL)
    .map((f) => ({ fileID: f.fileID, tempFileURL: f.tempFileURL as string }));
  return { urls };
});

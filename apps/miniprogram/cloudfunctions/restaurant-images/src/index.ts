import cloud from 'wx-server-sdk';
import type { RestaurantImagesInput, RestaurantImagesResult } from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import { filterOwnedFileIDs, ownedImageFileIDs } from '../../_shared/imageAccess';

const repo = new CloudRepo();

/**
 * 通过云函数返回图片临时访问地址：
 * 存储权限设为“仅创建者可读写”后，另一方也能经服务器换取临时 URL 查看（隐私保护）。
 * 安全：仅返回当前空间餐厅/旅行资料中登记的 fileID，拒绝越权换取其他文件（PRD §62 跨空间测试）。
 */
export const main = createHandler<RestaurantImagesInput, RestaurantImagesResult>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { spaceId } = await requireSpaceMember(repo, OPENID);
  const fileIDs = Array.isArray(event?.fileIDs)
    ? event.fileIDs.filter((f: string) => typeof f === 'string' && f.startsWith('cloud://'))
    : [];
  if (fileIDs.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION, '缺少图片 fileID');
  }
  const authorized = filterOwnedFileIDs(fileIDs, await ownedImageFileIDs(repo, spaceId));
  if (authorized.length === 0) {
    throw new AppError(ErrorCodes.FORBIDDEN, '无权访问这些图片');
  }
  const res = await cloud.getTempFileURL({ fileList: authorized });
  const urls = (res.fileList || [])
    .filter((f) => f.status === 0 && f.tempFileURL)
    .map((f) => ({ fileID: f.fileID, tempFileURL: f.tempFileURL as string }));
  return { urls };
});

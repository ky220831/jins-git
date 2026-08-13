import cloud from 'wx-server-sdk';
import type { RestaurantOcrDraft, RestaurantOcrInput } from '../../../../../packages/types/src';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import { WechatOcrProvider } from '../../_shared/ocrProvider';

function contentTypeOf(fileID: string): string {
  const lower = fileID.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export const main = createHandler<RestaurantOcrInput, RestaurantOcrDraft>(async (event) => {
  const fileID = (event?.fileID ?? '').trim();
  if (!fileID) {
    throw new AppError(ErrorCodes.VALIDATION, '缺少图片 fileID');
  }
  const fileRes = await cloud.downloadFile({ fileID });
  const buffer = fileRes.fileContent as Buffer;
  const provider = new WechatOcrProvider((payload) =>
    cloud.openapi.ocr.printedText(payload),
  );
  return provider.recognize(buffer, contentTypeOf(fileID));
});

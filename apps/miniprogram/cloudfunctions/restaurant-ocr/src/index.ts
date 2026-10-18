import cloud from 'wx-server-sdk';
import type { RestaurantOcrDraft, RestaurantOcrInput } from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import { WechatOcrProvider } from '../../_shared/ocrProvider';
import { enforceRateLimit } from '../../_shared/rateLimit';

const repo = new CloudRepo();

function contentTypeOf(fileID: string): string {
  const lower = fileID.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export const main = createHandler<RestaurantOcrInput, RestaurantOcrDraft>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { userId } = await requireSpaceMember(repo, OPENID);
  await enforceRateLimit(repo, userId, 'restaurantOcr');
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

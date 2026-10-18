import cloud from 'wx-server-sdk';
import type { RestaurantOcrDraft, RestaurantOcrInput } from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { createHandler } from '../../_shared/handler';
import {
  DashscopeVisionOcrProvider,
  WechatOcrProvider,
} from '../../_shared/ocrProvider';
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
  const contentType = contentTypeOf(fileID);
  const wechat = new WechatOcrProvider((payload) =>
    cloud.openapi.ocr.printedText(payload),
  );

  // 1) 优先微信印刷体 OCR（免费）；解析出有效字段则直接返回
  try {
    const draft = await wechat.recognize(buffer, contentType);
    const useful = draft.name || draft.address || draft.category || draft.businessHours;
    if (useful) {
      return draft;
    }
  } catch {
    // 微信 OCR 失败（未认证/无结果等），继续走智能识别
  }

  // 2) 降级智能识别（百炼视觉模型）：对截图/团购页/复杂菜单效果更好
  const apiKey = (process.env.OCR_DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.THIRD_PARTY_ERROR,
      '未能识别出内容，且未配置智能识别服务。请改用手动录入',
    );
  }
  const baseUrl = (process.env.OCR_DASHSCOPE_BASE_URL || '').trim() ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const vision = new DashscopeVisionOcrProvider(apiKey, baseUrl);
  return vision.recognize(buffer, contentType);
});

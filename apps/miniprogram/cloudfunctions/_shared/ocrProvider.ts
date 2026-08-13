import type { RestaurantOcrDraft } from '../../../../packages/types/src';
import { AppError, ErrorCodes } from './errors';

interface OcrItem {
  text?: string;
  confidence?: number;
}

export type OcrOpenApiCaller = (payload: {
  img: { contentType: string; value: Buffer };
}) => Promise<{ items?: OcrItem[]; errMsg?: string }>;

function cleanLine(line: string): string {
  return line.replace(/^[\s#*·•\-—|:：。，,.]+|[\s#*·•\-—|:：。，,.]+$/g, '').trim();
}

/** OCR 文本 → 餐厅草稿（只做建议，正式数据由用户确认后保存，PRD §47） */
export function parseOcrText(rawText: string): RestaurantOcrDraft {
  const draft: RestaurantOcrDraft = { rawText };
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  if (lines.length === 0) return draft;

  const first = lines[0];
  draft.name = first.length > 60 ? first.slice(0, 60) : first;

  for (const line of lines.slice(1)) {
    const low = line.toLowerCase();
    if (!draft.address && /(地址|address|addr)/.test(low)) {
      draft.address = line.replace(/^(地址|address|addr)\s*[:：]?\s*/i, '').trim();
    }
    if (!draft.businessHours && /(营业时间|营业)/.test(low)) {
      draft.businessHours = line.replace(/^(营业时间?)\s*[:：]?\s*/, '').trim();
    }
    if (
      !draft.category &&
      /(火锅|日料|日本料理|烧烤|烤肉|川菜|湘菜|粤菜|西餐|咖啡|面馆|面食|快餐|自助|甜品|奶茶|烘焙|海鲜|小吃)/.test(line)
    ) {
      draft.category = line
        .replace(/^(推荐|主营|特色|招牌)\s*[:：]?\s*/, '')
        .trim();
    }
    const priceMatch = line.match(/(人均|价位)\s*[:：]?\s*[¥￥]?\s*(\d{1,4})/);
    if (!draft.pricePerPerson && priceMatch) {
      draft.pricePerPerson = Number(priceMatch[2]);
    }
  }
  return draft;
}

/**
 * OCR Provider：优先使用微信云调用 ocr.printedText（免费，500 次/天，需已认证小程序）。
 * 若小程序未认证导致调用失败，返回明确错误，引导用户改用手动录入（PRD §47/§85）。
 */
export class WechatOcrProvider {
  constructor(private readonly call: OcrOpenApiCaller) {}

  async recognize(buffer: Buffer, contentType: string): Promise<RestaurantOcrDraft> {
    let res: { items?: OcrItem[]; errMsg?: string };
    try {
      res = await this.call({ img: { contentType, value: buffer } });
    } catch (err) {
      throw new AppError(
        ErrorCodes.THIRD_PARTY_ERROR,
        `OCR 调用失败：${String((err as Error).message || err)}（小程序需已认证，或改用手动录入）`,
      );
    }
    if (!res || !Array.isArray(res.items) || res.items.length === 0) {
      throw new AppError(ErrorCodes.THIRD_PARTY_ERROR, `OCR 无识别结果${res?.errMsg ? `：${res.errMsg}` : ''}`);
    }
    const rawText = res.items
      .map((item) => item.text || '')
      .join('\n')
      .trim();
    return parseOcrText(rawText);
  }
}

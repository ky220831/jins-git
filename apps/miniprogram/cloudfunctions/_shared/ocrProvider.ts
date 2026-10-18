import type { RestaurantOcrDraft } from '../../../../packages/types/src';
import { AppError, ErrorCodes } from './errors';
import { httpPostJson } from './http';

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

/** 从智能识别文本中提取 JSON（容忍 markdown 代码块与前后缀文字） */
export function parseVisionJson(text: string): RestaurantOcrDraft | null {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const draft: RestaurantOcrDraft = { rawText: text };
    if (typeof obj.name === 'string' && obj.name.trim()) {
      draft.name = obj.name.trim().slice(0, 60);
    }
    if (typeof obj.address === 'string' && obj.address.trim()) {
      draft.address = obj.address.trim();
    }
    if (typeof obj.city === 'string' && obj.city.trim()) {
      draft.city = obj.city.trim();
    }
    if (typeof obj.category === 'string' && obj.category.trim()) {
      draft.category = obj.category.trim();
    }
    if (typeof obj.pricePerPerson === 'number' && obj.pricePerPerson > 0) {
      draft.pricePerPerson = obj.pricePerPerson;
    }
    if (typeof obj.businessHours === 'string' && obj.businessHours.trim()) {
      draft.businessHours = obj.businessHours.trim();
    }
    if (Array.isArray(obj.dishes)) {
      const dishes = obj.dishes.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim());
      if (dishes.length > 0) draft.dishes = dishes.slice(0, 20);
    }
    return draft;
  } catch {
    return null;
  }
}

const VISION_PROMPT = `你是餐厅资料提取助手。请识别图片中的餐厅信息（支持纸质菜单、手机截图、团购页面等），只输出一个 JSON 对象，不要任何多余文字：
{"name":"餐厅名称","address":"地址","city":"城市","category":"菜系/分类","pricePerPerson":人均价格数字,"businessHours":"营业时间","dishes":["推荐菜或套餐名"]}
无法确定的信息省略该字段，pricePerPerson 无法确定时省略。`;

/**
 * 智能 OCR 通道（备用/增强）：调用百炼视觉模型（qwen-vl-max）识别，
 * 对手机截图、团购页、复杂排版菜单的识别效果远好于印刷体 OCR。
 * 图片仅在用户主动触发 OCR 时发送（PRD §六：第三方服务例外）。
 */
export class DashscopeVisionOcrProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    private readonly model = 'qwen-vl-max',
  ) {}

  async recognize(buffer: Buffer, contentType: string): Promise<RestaurantOcrDraft> {
    const b64 = buffer.toString('base64');
    let res: { choices?: { message?: { content?: unknown } }[] };
    try {
      res = (await httpPostJson(
        `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${contentType};base64,${b64}` } },
                { type: 'text', text: VISION_PROMPT },
              ],
            },
          ],
        },
        { Authorization: `Bearer ${this.apiKey}` },
        30000,
      )) as { choices?: { message?: { content?: unknown } }[] };
    } catch (err) {
      throw new AppError(
        ErrorCodes.THIRD_PARTY_ERROR,
        `智能识别调用失败：${String((err as Error).message || err)}，请改用手动录入`,
      );
    }
    const content = res?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : String(c))).join('')
      : String(content ?? '');
    const draft = parseVisionJson(text);
    if (!draft) {
      throw new AppError(ErrorCodes.THIRD_PARTY_ERROR, '智能识别未能解析出餐厅资料，请改用手动录入');
    }
    return draft;
  }
}

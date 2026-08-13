import type {
  RestaurantSearchInput,
  RestaurantSearchItem,
  RestaurantSearchResult,
} from '../../../../packages/types/src';
import { AppError, ErrorCodes } from './errors';
import { httpGetJson } from './http';

export const LBS_KEY_ENV = 'LBS_KEY';

/**
 * 腾讯位置服务 WebService 地点搜索（/ws/place/v1/search）。
 * 官方配额（2025-11-13 更新）：个人开发者每日 200 次 / QPS 5，个人学习非商用免费。
 * 服务商与业务解耦：后续可替换为其他 Provider（PRD §66）。
 */
export class LbsRestaurantSearchProvider {
  constructor(
    private readonly key: string = process.env[LBS_KEY_ENV] || '',
    private readonly getJson: (url: string) => Promise<unknown> = httpGetJson,
  ) {}

  async search(input: RestaurantSearchInput): Promise<RestaurantSearchResult> {
    if (!this.key) {
      throw new AppError(
        ErrorCodes.LBS_NOT_CONFIGURED,
        '腾讯位置服务尚未配置：请在云函数环境变量 LBS_KEY 填入 Key（lbs.qq.com 个人开发者可免费申请）',
      );
    }
    const keyword = (input?.keyword ?? '').trim();
    if (!keyword) {
      throw new AppError(ErrorCodes.VALIDATION, '请输入搜索关键词');
    }
    const region = (input?.region ?? '').trim() || '全国';
    const url =
      `https://apis.map.qq.com/ws/place/v1/search` +
      `?keyword=${encodeURIComponent(keyword)}` +
      `&boundary=${encodeURIComponent(`region(${region},0)`)}` +
      `&page_size=20&page_index=1&key=${encodeURIComponent(this.key)}`;

    const res = (await this.getJson(url)) as {
      status?: number;
      message?: string;
      data?: Array<Record<string, unknown>>;
    };
    if (res.status !== 0) {
      throw new AppError(
        ErrorCodes.THIRD_PARTY_ERROR,
        `地点搜索失败：${res.message || res.status || '未知错误'}`,
      );
    }

    const items: RestaurantSearchItem[] = (res.data || []).map((d) => {
      const location = (d.location as { lat?: number; lng?: number } | undefined) || {};
      return {
        id: String(d.id || ''),
        name: String(d.title || ''),
        ...(d.address ? { address: String(d.address) } : {}),
        ...(d.city ? { city: String(d.city) } : {}),
        ...((d as { district?: unknown }).district
          ? { district: String((d as { district?: unknown }).district) }
          : {}),
        ...(typeof location.lat === 'number' ? { lat: location.lat } : {}),
        ...(typeof location.lng === 'number' ? { lng: location.lng } : {}),
        ...(d.category ? { category: String(d.category) } : {}),
        ...(d.tel ? { tel: String(d.tel) } : {}),
      };
    });
    return { items, provider: 'tencent_lbs' };
  }
}

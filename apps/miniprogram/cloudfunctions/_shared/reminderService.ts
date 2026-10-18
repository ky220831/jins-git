import cloud from 'wx-server-sdk';
import { REMINDER_TEMPLATES, type ReminderTopic } from './constants';
import { newId } from './ids';
import type { Repo } from './repo';

export interface ReminderItem {
  spaceId: string;
  topic: ReminderTopic;
  title: string;
  date: string;
  time?: string;
  /** 纪念日原始日期（用于“纪念日期”字段） */
  originalDate?: string;
}

type Sender = (params: {
  openid: string;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
}) => Promise<void>;

const defaultSender: Sender = async ({ openid, templateId, page, data }) => {
  await cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId,
    page,
    data,
    miniprogramState: 'trial',
  });
};

function shanghaiToday(now: Date): string {
  const shifted = new Date(now.getTime() + 8 * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 纪念日下一次发生日：每年重复按今年/明年该月日；不重复则为原日期 */
function nextAnniversaryOccurrence(date: string, yearly: boolean, today: string): string {
  if (!yearly) return date;
  const [, m, d] = date.split('-').map(Number);
  const [ty] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const occ = `${ty}-${pad(m)}-${pad(d)}`;
  return occ < today ? `${ty + 1}-${pad(m)}-${pad(d)}` : occ;
}

export class ReminderService {
  constructor(
    private readonly repo: Repo,
    private readonly send: Sender = defaultSender,
    private readonly clock: () => Date = () => new Date(),
    private readonly templates: Record<ReminderTopic, { templateId: string; page: string }> =
      REMINDER_TEMPLATES,
  ) {}

  /** 收集“今天”到期的提醒事项（Asia/Shanghai） */
  async collectDue(now: Date = this.clock()): Promise<ReminderItem[]> {
    const today = shanghaiToday(now);
    const items: ReminderItem[] = [];
    for (const a of await this.repo.listAllAnniversaries()) {
      if (nextAnniversaryOccurrence(a.date, a.yearly, today) === today) {
        items.push({
          spaceId: a.spaceId,
          topic: 'anniversary',
          title: `纪念日：${a.name}`,
          date: today,
          originalDate: a.date,
        });
      }
    }
    for (const m of await this.repo.listAllMealPlans()) {
      if (m.status === 'published' && m.date === today && m.time) {
        items.push({ spaceId: m.spaceId, topic: 'meal', title: `今日菜单：${m.name}`, date: today, time: m.time });
      }
    }
    for (const v of await this.repo.listAllRestaurantVisits()) {
      if (v.status === 'planned' && v.date === today) {
        items.push({ spaceId: v.spaceId, topic: 'visit', title: `餐厅行程：${v.name}`, date: today, time: v.time || undefined });
      }
    }
    return items;
  }

  /** 记录一次性订阅授权（openid + topic + space） */
  async grant(openid: string, spaceId: string, topic: ReminderTopic): Promise<void> {
    const cfg = this.templates[topic];
    if (!cfg || !cfg.templateId) {
      throw new Error('提醒模板未配置');
    }
    const existing = await this.repo.listGrantsBySpaceTopic(spaceId, topic);
    if (existing.some((g) => g.openid === openid)) return;
    await this.repo.createGrant({
      id: newId('sg'),
      openid,
      spaceId,
      topic,
      templateId: cfg.templateId,
      createdAt: this.clock(),
    });
  }

  /** 发送今日到期提醒（每条一次性授权发一次后删除） */
  async sendDue(now: Date = this.clock()): Promise<number> {
    const items = await this.collectDue(now);
    let sent = 0;
    for (const item of items) {
      const cfg = this.templates[item.topic];
      if (!cfg || !cfg.templateId) continue;
      const grants = await this.repo.listGrantsBySpaceTopic(item.spaceId, item.topic);
      for (const grant of grants) {
        try {
          const data: Record<string, { value: string }> =
            item.topic === 'anniversary'
              ? {
                  thing1: { value: item.title.slice(0, 20) },
                  date2: { value: item.date },
                  date3: { value: item.originalDate || item.date },
                }
              : {
                  thing1: { value: item.title.slice(0, 20) },
                  date2: { value: item.date },
                  time3: { value: item.time ? item.time : '全天' },
                };
          await this.send({
            openid: grant.openid,
            templateId: grant.templateId || cfg.templateId,
            page: cfg.page,
            data,
          });
          sent += 1;
        } catch {
          // 发送失败保留授权，下次定时任务重试
          continue;
        }
        await this.repo.deleteGrant(item.spaceId, grant.id);
      }
    }
    return sent;
  }
}

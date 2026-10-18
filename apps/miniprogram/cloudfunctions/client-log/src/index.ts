import cloud from 'wx-server-sdk';
import { COLLECTIONS } from '../../_shared/constants';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';

const db = cloud.database();
const repo = new CloudRepo();

/**
 * 前端错误日志上报（v1.1.18）：App.onError / onUnhandledRejection 调用。
 * 只存错误信息与页面路径，不包含用户输入等敏感内容；每用户每分钟最多 20 条。
 */
export const main = createHandler<
  { message?: string; stack?: string; page?: string },
  { ok: boolean; skipped?: string }
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  const message = String(event?.message || '').slice(0, 500);
  const stack = String(event?.stack || '').slice(0, 2000);
  const page = String(event?.page || '').slice(0, 200);
  if (!message && !stack) {
    return { ok: false, skipped: 'empty' };
  }

  // 频控：每用户每分钟最多 20 条，防止死循环刷爆
  const since = new Date(Date.now() - 60_000);
  const recent = await db
    .collection(COLLECTIONS.clientLogs)
    .where({ providerUserId: OPENID, createdAt: db.command.gt(since) })
    .count();
  if ((recent.total ?? 0) >= 20) {
    return { ok: false, skipped: 'rate_limited' };
  }

  let userId = '';
  let spaceId = '';
  try {
    const member = await requireSpaceMember(repo, OPENID);
    userId = member.userId;
    spaceId = member.spaceId;
  } catch {
    // 未绑定空间也允许上报（不记空间信息）
  }

  await db.collection(COLLECTIONS.clientLogs).add({
    data: {
      providerUserId: OPENID,
      userId,
      spaceId,
      message,
      stack,
      page,
      createdAt: new Date(),
    },
  });
  return { ok: true };
});

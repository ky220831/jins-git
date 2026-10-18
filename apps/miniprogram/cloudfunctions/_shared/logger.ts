let seq = 0;

/** 生成请求追踪 ID（排障时用户可把 requestId 发给我们） */
export function newRequestId(): string {
  seq = (seq + 1) % 100000;
  return `r_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 结构化日志：统一 [our-life] 前缀 + JSON，便于云日志检索 */
export function logEvent(
  requestId: string,
  action: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    requestId,
    action,
    ...fields,
    t: new Date().toISOString(),
  });
  console.log(`[our-life] ${line}`);
}

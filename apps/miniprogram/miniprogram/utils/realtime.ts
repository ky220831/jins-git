/**
 * 低频率静默刷新（PRD §22 的降级方案，避免高频轮询）：
 * 页面可见时每 30 秒调用一次刷新函数；返回停止函数，页面离开时调用。
 */
export function startSilentRefresh(refresh: () => void, intervalMs = 30000): () => void {
  const timer = setInterval(() => {
    try {
      refresh();
    } catch {
      // 静默失败，等待下一个周期重试
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

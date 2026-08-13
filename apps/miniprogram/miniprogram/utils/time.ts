/**
 * 时间展示工具。
 * 业务判定（有效期、清理、回收站等）一律以后端服务器时间为准，
 * 这里只负责把 ISO 时间字符串格式化为本地可读文案。
 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

import type { Repo } from './repo';

/** 收集当前空间允许换取临时 URL 的图片 fileID（餐厅封面/照片/菜单图 + 旅行照片） */
export async function ownedImageFileIDs(repo: Repo, spaceId: string): Promise<Set<string>> {
  const [restaurants, trips] = await Promise.all([
    repo.listRestaurants(spaceId),
    repo.listTrips(spaceId),
  ]);
  const allowed = new Set<string>();
  for (const r of restaurants) {
    if (r.coverImage) allowed.add(r.coverImage);
    for (const f of r.images) allowed.add(f);
    for (const f of r.menuImages) allowed.add(f);
  }
  for (const t of trips) {
    for (const f of t.images) allowed.add(f);
  }
  return allowed;
}

/** 只保留属于本空间的 fileID，拒绝越权换取其他文件 */
export function filterOwnedFileIDs(requested: string[], owned: Set<string>): string[] {
  return requested.filter((f) => owned.has(f));
}

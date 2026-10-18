import { AppError, ErrorCodes } from './errors';

/** 乐观锁校验：旧版本不能覆盖新版本（PRD §23） */
export function assertVersion(
  existingVersion: number,
  inputVersion: number | undefined | null,
): void {
  if (inputVersion == null) {
    throw new AppError(ErrorCodes.VALIDATION, '缺少版本号，请刷新后重试');
  }
  if (inputVersion !== existingVersion) {
    throw new AppError(ErrorCodes.CONFLICT, '这条记录刚刚被另一人修改，请刷新后继续');
  }
}

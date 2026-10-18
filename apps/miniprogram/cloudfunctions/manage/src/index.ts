import cloud from 'wx-server-sdk';
import type {
  ExportDataResult,
  ManageAuditResult,
  ManageOverview,
} from '../../../../../packages/types/src';
import { requireSpaceMember } from '../../_shared/access';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { ManageService } from '../../_shared/manageService';
import { enforceRateLimit } from '../../_shared/rateLimit';

const repo = new CloudRepo();
const service = new ManageService(repo);

export const main = createHandler<
  { action: 'overview' } | { action: 'export' } | { action: 'audit-logs' },
  ManageOverview | ExportDataResult | ManageAuditResult
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'export') {
    const { userId } = await requireSpaceMember(repo, OPENID);
    await enforceRateLimit(repo, userId, 'exportData');
    const { payload, fileName, csvFiles } = await service.buildExport(OPENID);
    const json = JSON.stringify(payload, null, 2);
    const spaceDir = `exports/${(payload.space as { id?: string } | null)?.id ?? 'space'}`;
    const cloudPath = `${spaceDir}/${fileName}`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(json, 'utf8'),
    });
    const urlRes = await cloud.getTempFileURL({ fileList: [{ fileID: upload.fileID, maxAge: 3600 }] });
    const tempFileURL = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || '';
    if (!tempFileURL) {
      throw new AppError(ErrorCodes.INTERNAL, '导出文件生成失败，请重试');
    }
    // CSV 分表（v1.1.18 增强导出）
    const csvFilesOut: { name: string; tempFileURL: string; sizeBytes: number }[] = [];
    for (const csv of csvFiles) {
      const csvPath = `${spaceDir}/csv/${csv.name}`;
      const csvUpload = await cloud.uploadFile({
        cloudPath: csvPath,
        fileContent: Buffer.from(csv.content, 'utf8'),
      });
      const csvUrl = await cloud.getTempFileURL({
        fileList: [{ fileID: csvUpload.fileID, maxAge: 3600 }],
      });
      const csvTemp = csvUrl.fileList?.[0]?.tempFileURL || '';
      if (csvTemp) {
        csvFilesOut.push({ name: csv.name, tempFileURL: csvTemp, sizeBytes: Buffer.byteLength(csv.content, 'utf8') });
      }
    }
    return {
      fileName,
      tempFileURL,
      sizeBytes: Buffer.byteLength(json, 'utf8'),
      csvFiles: csvFilesOut,
      images: (payload.images as string[]) || [],
    };
  }
  if (event?.action === 'audit-logs') {
    return service.listAuditLogs(OPENID);
  }
  return service.overview(OPENID);
});

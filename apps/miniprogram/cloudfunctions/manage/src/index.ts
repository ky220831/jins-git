import cloud from 'wx-server-sdk';
import type { ExportDataResult, ManageOverview } from '../../../../../packages/types/src';
import { CloudRepo } from '../../_shared/cloudRepo';
import { createHandler } from '../../_shared/handler';
import { AppError, ErrorCodes } from '../../_shared/errors';
import { ManageService } from '../../_shared/manageService';

const service = new ManageService(new CloudRepo());

export const main = createHandler<
  { action: 'overview' } | { action: 'export' },
  ManageOverview | ExportDataResult
>(async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (event?.action === 'export') {
    const { payload, fileName } = await service.buildExport(OPENID);
    const json = JSON.stringify(payload, null, 2);
    const cloudPath = `exports/${payload.space && (payload.space as { id?: string }).id ? (payload.space as { id: string }).id : 'space'}/${fileName}`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(json, 'utf8'),
    });
    const urlRes = await cloud.getTempFileURL({ fileList: [{ fileID: upload.fileID, maxAge: 3600 }] });
    const tempFileURL = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || '';
    if (!tempFileURL) {
      throw new AppError(ErrorCodes.INTERNAL, '导出文件生成失败，请重试');
    }
    return { fileName, tempFileURL, sizeBytes: Buffer.byteLength(json, 'utf8') };
  }
  return service.overview(OPENID);
});

/**
 * wx-server-sdk 本地类型声明（仅影响 TypeScript 检查，不影响打包与运行时）。
 *
 * 为什么存在：云函数在云端按各自 package.json 安装 wx-server-sdk ~2.6.3，
 * 而根目录开发依赖装的是 4.x，其自带类型把 get()/count() 等返回值声明成
 * `Promise<T> | void | string` 的宽松联合，导致业务代码访问 .data/.total 大量误报。
 * 这里按本项目实际用到的 API 面给出收敛类型；若未来新增 SDK 用法，先在此补充类型。
 */
declare module 'wx-server-sdk' {
  export interface IWXContext {
    OPENID: string;
    APPID?: string;
    UNIONID?: string;
    ENV?: string;
    SOURCE?: string;
  }

  export interface IQueryResult<T = Record<string, unknown>> {
    data: T[];
    errMsg: string;
  }

  export interface IQuerySingleResult<T = Record<string, unknown>> {
    data: T;
    errMsg: string;
  }

  export interface ICountResult {
    total: number;
    errMsg: string;
  }

  export interface IUploadFileResult {
    fileID: string;
  }

  export interface ITempFileURLResultItem {
    fileID: string;
    tempFileURL?: string;
    status: number;
    maxAge?: number;
  }

  export interface ITempFileURLResult {
    fileList: ITempFileURLResultItem[];
    errMsg: string;
  }

  export interface IDocumentReference<T = Record<string, unknown>> {
    get(): Promise<IQuerySingleResult<T>>;
    set(options: { data: object }): Promise<{ _id: string }>;
    update(options: { data: object }): Promise<{ stats: { updated: number } }>;
    remove(): Promise<{ stats: { removed: number } }>;
  }

  export interface ICommandValue {
    and(v: unknown): ICommandValue;
    or(v: unknown): ICommandValue;
  }

  export interface ICommand {
    in(values: unknown[]): ICommandValue;
    or(...queries: unknown[]): ICommandValue;
    and(...queries: unknown[]): ICommandValue;
    neq(value: unknown): ICommandValue;
    gt(value: unknown): ICommandValue;
    gte(value: unknown): ICommandValue;
    lt(value: unknown): ICommandValue;
    lte(value: unknown): ICommandValue;
    exists(exists: boolean): ICommandValue;
  }

  export interface IQuery<T = Record<string, unknown>> {
    get(): Promise<IQueryResult<T>>;
    count(): Promise<ICountResult>;
    update(options: { data: object }): Promise<{ stats: { updated: number } }>;
    remove(): Promise<{ stats: { removed: number } }>;
    limit(n: number): IQuery<T>;
    skip(n: number): IQuery<T>;
    orderBy(field: string, order: 'asc' | 'desc'): IQuery<T>;
    field(projection: Record<string, 0 | 1>): IQuery<T>;
    where(cond: Record<string, unknown>): IQuery<T>;
  }

  export interface ICollection<T = Record<string, unknown>> {
    doc(id: string): IDocumentReference<T>;
    where(cond: Record<string, unknown>): IQuery<T>;
    add(options: { data: object }): Promise<{ _id: string }>;
    limit(n: number): IQuery<T>;
    skip(n: number): IQuery<T>;
    orderBy(field: string, order: 'asc' | 'desc'): IQuery<T>;
    count(): Promise<ICountResult>;
    get(): Promise<IQueryResult<T>>;
  }

  export interface IDatabase {
    collection<T = Record<string, unknown>>(name: string): ICollection<T>;
    command: ICommand;
    createCollection(name: string): Promise<void>;
    runTransaction<T>(fn: (transaction: unknown) => Promise<T>): Promise<T>;
  }

  export interface ICloud {
    init(options?: {
      env?: string | symbol | { database?: string; functions?: string; storage?: string };
    }): void;
    database(): IDatabase;
    getWXContext(): IWXContext;
    DYNAMIC_CURRENT_ENV: symbol;
    openapi: {
      subscribeMessage: {
        send(options: Record<string, unknown>): Promise<unknown>;
      };
      ocr: {
        printedText(options: Record<string, unknown>): Promise<{
          items?: Array<{ text?: string; confidence?: number }>;
          errMsg?: string;
        }>;
      };
    };
    uploadFile(options: { cloudPath: string; fileContent: Buffer }): Promise<IUploadFileResult>;
    getTempFileURL(options: {
      fileList: Array<string | { fileID: string; maxAge?: number }>;
    }): Promise<ITempFileURLResult>;
    deleteFile(options: { fileList: string[] }): Promise<unknown>;
    downloadFile(options: { fileID: string }): Promise<{ fileContent: Buffer }>;
  }

  const cloud: ICloud;
  export = cloud;
}

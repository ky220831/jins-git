import https from 'node:https';

/** 云函数端发起 HTTPS GET 并解析 JSON（Node16 运行时无全局 fetch） */
export function httpGetJson(url: string, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('第三方响应不是有效 JSON'));
          }
        } else {
          reject(new Error(`第三方请求失败 HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('第三方请求超时'));
    });
    req.on('error', reject);
  });
}

/** 云函数端发起 HTTPS POST 并解析 JSON（Node16 运行时无全局 fetch） */
export function httpPostJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 20000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let chunk = '';
        res.setEncoding('utf8');
        res.on('data', (d) => {
          chunk += d;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(chunk));
            } catch {
              reject(new Error('第三方响应不是有效 JSON'));
            }
          } else {
            reject(new Error(`第三方请求失败 HTTP ${res.statusCode}: ${chunk.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('第三方请求超时'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

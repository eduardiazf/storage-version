const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');
const Storage = require('..');

test('S3 download contract, missing objects, invalid input and closed upload routes', async (t) => {
  const seen = [];
  const bytes = Buffer.from([0, 1, 2, 255, 65]);
  const s3 = { async getObject(params) {
    seen.push(params);
    if (params.Key.endsWith('/missing.apk')) throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
    if (params.Key.endsWith('/denied.apk')) throw Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } });
    return { Body: (() => {
      if (params.Key.endsWith('/interrupted.apk')) {
        let started = false;
        return new Readable({ read() {
          if (started) return;
          started = true;
          this.push(bytes);
          setTimeout(() => this.destroy(new Error('interrupted')), 30);
        } });
      }
      return Readable.from([bytes]);
    })() };
  } };
  const storage = Storage({ s3, bucket: 'test-bucket' });
  const server = http.createServer(storage.handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.equal(seen.length, 0);
  const result = await fetch(base + '/1111/xplatform-apk?name=xplatform-1111.apk&version=ignored');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'application/octet-stream');
  assert.equal(result.headers.get('content-disposition'), 'attachment; filename=xplatform-1111.apk');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  assert.deepEqual(seen.pop(), { Bucket: 'test-bucket', Key: '1111/xplatform-apk/xplatform-1111.apk' });
  const fallback = await fetch(base + '/1111/xplatform-apk');
  assert.equal(fallback.status, 200);
  await fallback.arrayBuffer();
  assert.equal(seen.pop().Key, '1111/xplatform-apk/app');
  const missing = await fetch(base + '/1111/xplatform-apk?name=missing.apk');
  assert.equal(missing.status, 404);
  await missing.text();
  const denied = await fetch(base + '/1111/xplatform-apk?name=denied.apk');
  assert.equal(denied.status, 403);
  await denied.text();
  const interrupted = await fetch(base + '/1111/xplatform-apk?name=interrupted.apk');
  await assert.rejects(interrupted.arrayBuffer());
  const count = seen.length;
  for (const query of ['name=a&name=b', 'name=bad%0D%0Aheader', 'name=%F0%9F%98%80']) {
    const bad = await fetch(base + '/1111/xplatform-apk?' + query);
    assert.equal(bad.status, 400);
    await bad.text();
  }
  for (const [path, method] of [['/1111/xplatform-apk', 'PUT'], ['/1111/xplatform-apk/latest', 'GET']]) {
    const absent = await fetch(base + path, { method });
    assert.ok([404, 405].includes(absent.status));
    await absent.text();
  }
  assert.equal(seen.length, count);
});

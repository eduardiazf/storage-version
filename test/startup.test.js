const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');

test('CLI starts without static AWS keys and serves health without credential lookup', { timeout: 5000 }, async (t) => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, '../bin/storage.js')], {
    env: { PORT: String(port), NODE_ENV: 'production', AWS_REGION: 'us-east-1', AWS_EC2_METADATA_DISABLED: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  });
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`CLI exited ${code}: ${output}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('storage-api listening on port')) resolve();
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'OK');
});

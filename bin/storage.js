#!/usr/bin/env node
const http = require('node:http');
const Storage = require('..');

for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
  if (!process.env[name] || !process.env[name].trim()) {
    console.error(`${name} is required`);
    process.exit(1);
  }
}
const port = Number(process.env.PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535');
  process.exit(1);
}
const storage = Storage();
http.createServer(storage.handle).listen(port, '0.0.0.0', () => {
  console.log(`storage-api listening on port ${port}; S3 configured, access checked on download`);
});

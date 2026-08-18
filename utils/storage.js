async function uploadFile(bucket, key, body, contentType) {
  if (bucket && bucket.put) {
    await bucket.put(key, body, {
      httpMetadata: { contentType }
    });
    return { ok: true, key };
  }
  const fs = require('fs');
  const path = require('path');
  const dir = path.join('data', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, key);
  if (body instanceof Buffer) {
    fs.writeFileSync(filePath, body);
  } else if (typeof body === 'string') {
    fs.writeFileSync(filePath, body, 'utf8');
  }
  return { ok: true, key, local: filePath };
}

async function getFile(bucket, key) {
  if (bucket && bucket.get) {
    const obj = await bucket.get(key);
    if (!obj) return null;
    return { body: obj.body, contentType: obj.httpMetadata?.contentType || 'application/octet-stream' };
  }
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join('data', 'uploads', key);
  if (!fs.existsSync(filePath)) return null;
  return {
    body: fs.createReadStream(filePath),
    contentType: 'application/octet-stream'
  };
}

module.exports = { uploadFile, getFile };

// One-way, repeatable import. Existing MongoDB documents are never overwritten.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { client, db, cloudinary } = require('./config.cjs');
const sourceRoot = path.resolve(__dirname, '../../server');
const cachePath = path.join(__dirname, '.migration-images.json');
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath)) : {};
async function run() {
  await client.connect();
  const data = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'data.json'), 'utf8'));
  const assets = new Set();
  for (const rows of Object.values(data)) for (const row of rows) for (const image of (Array.isArray(row.pic) ? row.pic : [row.pic])) if (image && !image.startsWith('http')) assets.add(image);
  let done = 0;
  const queue = [...assets];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const image = queue.shift();
      if (!cache[image]) {
        const local = path.resolve(sourceRoot, 'public', image);
        if (!local.startsWith(path.join(sourceRoot, 'public') + path.sep) || !fs.existsSync(local)) throw new Error(`Missing source image: ${image}`);
        const uploaded = await cloudinary.uploader.upload(local, { public_id: 'apna-bazar/legacy/' + image.replace(/\.[^.]+$/, ''), overwrite: false, resource_type: 'image' });
        cache[image] = uploaded.secure_url;
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      }
      done++; if (done % 20 === 0) console.log(`Images migrated: ${done}/${assets.size}`);
    }
  }));
  for (const [legacy, rows] of Object.entries(data)) {
    const collection = { product: 'products', user: 'users', checkout: 'orders' }[legacy] || legacy;
    for (const original of rows) {
      const row = { ...original };
      if (Array.isArray(row.pic)) row.pic = row.pic.map(x => cache[x] || x); else if (row.pic) row.pic = cache[row.pic] || row.pic;
      if (legacy === 'user') { row.email = row.email.trim().toLowerCase(); row.passwordHash = await bcrypt.hash(String(row.password), 12); delete row.password; row.role = row.role === 'Super Admin' ? 'Super Admin' : row.role === 'Admin' ? 'Admin' : 'Buyer'; }
      if (legacy === 'product') { row.stockQuantity = Number(row.stockQuantity) || 0; row.finalPrice = Number(row.finalPrice); row.basePrice = Number(row.basePrice); row.discount = Number(row.discount); row.size = String(row.size); }
      if (legacy === 'cart') { row.size = String(row.size); row.qty = Number(row.qty); }
      if (legacy === 'newsletter') row.email = row.email.trim().toLowerCase();
      if (legacy === 'checkout') { row.key = `legacy-${row.id}`; row.items = (row.products || []).map(x => ({ ...x, pic: Array.isArray(x.pic) ? x.pic.map(p => cache[p] || p) : [cache[x.pic] || x.pic].filter(Boolean) })); row.status = row.orderStatus || 'Placed'; row.createdAt = row.date ? new Date(row.date) : new Date(); row.address = Object.fromEntries(['name','phone','address','city','state','pin'].map(k => [k, data.user.find(u => u.id === row.user)?.[k] || ''])); delete row.products; }
      const key = legacy === 'newsletter' ? { email: row.email } : { id: row.id };
      await db.collection(collection).updateOne(key, { $setOnInsert: row }, { upsert: true });
    }
    console.log(`${collection}: ${rows.length} records processed`);
  }
  console.log(`Migration complete. ${assets.size} source images now served by Cloudinary.`);
}
run().catch(e => { console.error('Migration failed:', e.name, e.message?.replace(/mongodb[^\s]+/g, '[redacted]')); process.exitCode = 1; }).finally(() => client.close());

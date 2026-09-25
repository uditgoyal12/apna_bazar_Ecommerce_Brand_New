const fs = require('fs');
const path = require('path');
const { client, db, cloudinary } = require('./config.cjs');
async function verify() {
  await client.connect(); await db.command({ ping: 1 });
  const products = await db.collection('products').find({}).toArray();
  const users = await db.collection('users').find({}).toArray();
  const cloudPing = await cloudinary.api.ping();
  const buildDir = path.resolve(__dirname, '../build');
  const files = fs.readdirSync(path.join(buildDir, 'assets')).filter(f => /\.(js|css)$/.test(f));
  const bundle = files.map(f => fs.readFileSync(path.join(buildDir, 'assets', f), 'utf8')).join('\n');
  const secrets = ['MONGODB_URI','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','CLOUDINARY_URL'].map(k => process.env[k]).filter(Boolean);
  const report = {
    checkedAt: new Date().toISOString(),
    mongodb: 'connected', cloudinary: cloudPing.status,
    products: products.length, activeProducts: products.filter(p => p.active !== false).length,
    productImagesOnCloudinary: products.every(p => p.pic.length > 0 && p.pic.every(url => url.startsWith('https://res.cloudinary.com/'))),
    passwordsHashed: users.every(u => !!u.passwordHash && !u.password),
    testProductsRemaining: products.filter(p => p.name.startsWith('qa-')).length,
    testUsersRemaining: users.filter(u => u.email.startsWith('qa-') && u.email.endsWith('@example.test')).length,
    secretsInFrontendBundle: secrets.some(value => bundle.includes(value)),
    endpoints: {},
  };
  for (const url of ['http://localhost:3000','http://localhost:3000/api/health','http://localhost:5000/api/health','http://localhost:5000/shop']) report.endpoints[url] = (await fetch(url)).status;
  const failed = report.cloudinary !== 'ok' || !report.productImagesOnCloudinary || !report.passwordsHashed || report.testProductsRemaining || report.testUsersRemaining || report.secretsInFrontendBundle || Object.values(report.endpoints).some(s => s !== 200);
  fs.writeFileSync(path.resolve(__dirname, '../artifacts/verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); if (failed) process.exitCode = 1;
}
verify().catch(e => { console.error('Verification failed:', e.name, e.code || ''); process.exitCode = 1; }).finally(() => client.close());

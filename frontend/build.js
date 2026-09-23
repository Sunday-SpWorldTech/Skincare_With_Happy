const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
function readEnvFile(name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).filter(line => !line.trim().startsWith('#')).map(line => { const i=line.indexOf('='); return i<0 ? [line.trim(),''] : [line.slice(0,i).trim(), line.slice(i+1).trim()]; }));
}
const localEnv = readEnvFile('.env');
const apiBase = (process.env.VITE_API_BASE_URL || localEnv.VITE_API_BASE_URL || 'https://skincarewithhappy-backend.vercel.app/api').replace(/\/$/, '');
const paystackPublicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY || localEnv.VITE_PAYSTACK_PUBLIC_KEY || '';

fs.rmSync(out, { recursive: true, force: true });
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'build.js' || entry.name === '.env' || entry.name === '.env.sample') continue;
    const from = path.join(src, entry.name), to = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(from, to) : fs.copyFileSync(from, to);
  }
}
copyDir(root, out);
for (const fileName of ['app.js','auth.js']) {
  const filePath = path.join(out, fileName);
  if (fs.existsSync(filePath)) fs.writeFileSync(filePath, fs.readFileSync(filePath, 'utf8').replaceAll('__API_BASE_URL__', apiBase).replaceAll('__PAYSTACK_PUBLIC_KEY__', paystackPublicKey));
}
console.log(`Frontend built with API: ${apiBase}`);

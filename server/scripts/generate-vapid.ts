import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
const keys = webpush.generateVAPIDKeys();

if (!fs.existsSync(envPath)) {
  console.log('server/.env ne postoji - kopirajte .env.example u .env i dodajte sledeće vrednosti:\n');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  process.exit(0);
}

let env = fs.readFileSync(envPath, 'utf8');
const hasKeys = /^VAPID_PUBLIC_KEY=.+$/m.test(env) && /^VAPID_PRIVATE_KEY=.+$/m.test(env);
if (hasKeys && !process.argv.includes('--force')) {
  console.log('VAPID ključevi već postoje u server/.env (koristite --force za nove; postojeće pretplate će prestati da rade).');
  process.exit(0);
}

const set = (key: string, value: string) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
};
set('VAPID_PUBLIC_KEY', keys.publicKey);
set('VAPID_PRIVATE_KEY', keys.privateKey);
fs.writeFileSync(envPath, env);
console.log('VAPID ključevi su generisani i upisani u server/.env');

// Encrypts work-src/ into pages/work/ as AES-256-GCM ciphertext.
//
// Usage:  WORK_PASSPHRASE='your passphrase' node tools/encrypt.mjs
//     or: node tools/encrypt.mjs        (prompts, input hidden)
//
// work-src/ holds the plaintext and is gitignored. Only the .enc output and
// meta.json are committed. meta.json carries the KDF salt, which is not secret.

import { webcrypto as crypto } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { createInterface } from 'node:readline';

const SRC = 'work-src';
const OUT = join('pages', 'work');
const ITERATIONS = 250_000;

// Pages offered in the gate's index, in order.
const ENTRIES = [
  { file: 'nala.html', title: 'NALA' },
  { file: 'airoleplay.html', title: 'AI Role-Play' },
];

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (!name.startsWith('.')) out.push(p);
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (ch) => {
      // Redraw the prompt without echoing typed characters.
      const s = ch.toString();
      if (s === '\n' || s === '\r' || s === '') return;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(prompt);
    };
    process.stdin.on('data', onData);
    rl.question(prompt, (answer) => {
      process.stdin.off('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Output layout per file: [12-byte IV][ciphertext+16-byte GCM tag]
async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

const b64 = (u8) => Buffer.from(u8).toString('base64');

const passphrase = process.env.WORK_PASSPHRASE ?? (await askHidden('Passphrase: '));
if (!passphrase) {
  console.error('No passphrase given — aborting.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await deriveKey(passphrase, salt);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const files = await walk(SRC);
let total = 0;
for (const abs of files) {
  const rel = relative(SRC, abs);
  const sealed = await seal(key, await readFile(abs));
  const dest = join(OUT, rel + '.enc');
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, sealed);
  total += sealed.length;
}

// A known plaintext so the gate can tell a wrong passphrase from a corrupt file.
const check = await seal(key, new TextEncoder().encode('unlocked'));

await writeFile(
  join(OUT, 'meta.json'),
  JSON.stringify(
    {
      v: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
      check: b64(check),
      entries: ENTRIES,
    },
    null,
    2,
  ) + '\n',
);

console.log(`Encrypted ${files.length} files (${(total / 1048576).toFixed(1)} MB) into ${OUT}/`);
console.log('Commit pages/work/ — work-src/ stays local and gitignored.');

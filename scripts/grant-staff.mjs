/**
 * Provisions a staff account. This is the deliberate out-of-band path the
 * schema comments refer to: public.staff has no INSERT policy, so nobody can
 * grant themselves admin access through the application.
 *
 *   node scripts/grant-staff.mjs <email> <password> "<label>"
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from .env.local. Refuses to run unless you
 * confirm the target project, because hard rule 5 says never run scripts
 * against production.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { createClient } from '@supabase/supabase-js';

function loadEnv(path = '.env.local') {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`Could not read ${path}.`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const [email, password, label] = process.argv.slice(2);
if (!email || !password || !label) {
  console.error(
    'usage: node scripts/grant-staff.mjs <email> <password> "<label>"',
  );
  process.exit(1);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.',
  );
  process.exit(1);
}

console.log('');
console.log('  This uses the SERVICE ROLE key and bypasses RLS entirely.');
console.log(`  Target project: ${url}`);
console.log(`  Creating staff account: ${email} (${label})`);
console.log('');
console.log('  Hard rule 5: never run scripts against production.');
console.log('');

const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question(
  '  Type the project ref from the URL above to continue: ',
);
rl.close();

const ref = new URL(url).hostname.split('.')[0];
if (answer.trim() !== ref) {
  console.error(`\nAborted — expected "${ref}".`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error: createError } =
  await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

let userId = created?.user?.id;

if (createError) {
  if (!/already/i.test(createError.message)) {
    console.error('Could not create the auth user:', createError.message);
    process.exit(1);
  }
  console.log('  Auth user already exists — looking it up.');
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Could not list users:', listError.message);
    process.exit(1);
  }
  userId = list.users.find((u) => u.email === email)?.id;
}

if (!userId) {
  console.error('Could not determine the user id.');
  process.exit(1);
}

const { error: staffError } = await supabase
  .from('staff')
  .upsert({ user_id: userId, label }, { onConflict: 'user_id' });

if (staffError) {
  console.error('Could not write the staff row:', staffError.message);
  process.exit(1);
}

console.log(`\n  Done. ${email} can now sign in at /admin/login.\n`);

type ServiceSeed = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  durationMin: number;
  price: number;
  skillIds: string[];
};

// Cloudflare Workers Web Crypto rejects iteration counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

const skills = [
  ['skill-classic-manicure', 'Classic manicure'],
  ['skill-gel-technique', 'Gel technique'],
  ['skill-pedicure', 'Pedicure'],
  ['skill-nail-art', 'Nail art'],
  ['skill-acrylic-extensions', 'Acrylic & extensions'],
  ['skill-waxing', 'Waxing'],
  ['skill-nail-care', 'Nail care'],
  ['skill-spa-treatment', 'Spa treatment'],
  ['skill-kids-services', 'Kids services'],
] as const;

const categories = [
  ['category-manicure', 'Manicure', 'manicure', 0],
  ['category-pedicure', 'Pedicure', 'pedicure', 1],
  ['category-nail-enhancements', 'Nail Enhancements', 'nail-enhancements', 2],
  ['category-nail-art-add-ons', 'Nail Art & Add-ons', 'nail-art-add-ons', 3],
  ['category-waxing', 'Waxing', 'waxing', 4],
  ['category-kids-services', 'Kids Services', 'kids-services', 5],
] as const;

const service = (id: string, name: string, iconKey: string, categoryId: string, durationMin: number, price: number, skillIds: string[]): ServiceSeed => ({ id, name, iconKey, categoryId, durationMin, price, skillIds });

// This is a clean production bootstrap catalog, not the demo appointment seed.
// Owners can edit, deactivate, or extend it from Admin after first sign-in.
const services: ServiceSeed[] = [
  service('service-basic-manicure', 'Basic Manicure', 'hand', 'category-manicure', 30, 25, ['skill-classic-manicure']),
  service('service-classic-manicure', 'Classic Manicure', 'hand', 'category-manicure', 35, 30, ['skill-classic-manicure']),
  service('service-gel-manicure', 'Gel Manicure', 'sparkles', 'category-manicure', 60, 45, ['skill-classic-manicure', 'skill-gel-technique']),
  service('service-basic-pedicure', 'Basic Pedicure', 'footprints', 'category-pedicure', 45, 40, ['skill-pedicure']),
  service('service-gel-pedicure', 'Gel Pedicure', 'sparkles', 'category-pedicure', 75, 60, ['skill-pedicure', 'skill-gel-technique']),
  service('service-deluxe-pedicure', 'Deluxe Pedicure', 'flower-2', 'category-pedicure', 75, 65, ['skill-pedicure', 'skill-spa-treatment']),
  service('service-acrylic-full-set', 'Acrylic Full Set', 'hand', 'category-nail-enhancements', 90, 65, ['skill-acrylic-extensions']),
  service('service-gel-full-set', 'Gel Full Set', 'sparkles', 'category-nail-enhancements', 90, 70, ['skill-gel-technique', 'skill-acrylic-extensions']),
  service('service-nail-art', 'Nail Art', 'palette', 'category-nail-art-add-ons', 45, 30, ['skill-nail-art']),
  service('service-brazilian-waxing', 'Brazilian Waxing', 'heart', 'category-waxing', 55, 45, ['skill-waxing']),
  service('service-kids-manicure', 'Kids Manicure', 'baby', 'category-kids-services', 30, 20, ['skill-kids-services', 'skill-classic-manicure']),
  service('service-manicure-pedicure-combo', 'Manicure & Pedicure Combo', 'heart', 'category-pedicure', 105, 70, ['skill-classic-manicure', 'skill-pedicure']),
];

const staff = [
  ['staff-anna', 'Anna', 'AN', ['skill-classic-manicure', 'skill-gel-technique', 'skill-nail-care']],
  ['staff-linda', 'Linda', 'LI', ['skill-pedicure', 'skill-classic-manicure', 'skill-spa-treatment']],
  ['staff-jenny', 'Jenny', 'JE', ['skill-nail-art', 'skill-gel-technique', 'skill-acrylic-extensions']],
  ['staff-tom', 'Tom', 'TO', ['skill-pedicure', 'skill-waxing', 'skill-acrylic-extensions']],
  ['staff-mia', 'Mia', 'MI', ['skill-waxing', 'skill-nail-care', 'skill-classic-manicure']],
  ['staff-sofia', 'Sofia', 'SO', ['skill-kids-services', 'skill-spa-treatment', 'skill-nail-art']],
] as const;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sql(value: string | number | boolean | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${value.replaceAll("'", "''")}'`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error('SHOP_TIMEZONE must be a valid IANA timezone');
  }
}

async function hashSecret(secret: string) {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

async function main() {
  if (process.env.D1_BOOTSTRAP_CONFIRM !== 'YES') throw new Error('Set D1_BOOTSTRAP_CONFIRM=YES to generate a production bootstrap SQL file');
  const adminEmail = requiredEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requiredEnv('ADMIN_PASSWORD');
  const stationEmail = requiredEnv('STATION_EMAIL').toLowerCase();
  const stationPassword = requiredEnv('STATION_PASSWORD');
  const staffPin = requiredEnv('STAFF_DEFAULT_PIN');
  const timezone = requiredEnv('SHOP_TIMEZONE');
  if (!/^\d{4}$/.test(staffPin)) throw new Error('STAFF_DEFAULT_PIN must be exactly four digits');
  validateTimezone(timezone);

  const now = new Date().toISOString().replace('Z', '+00:00');
  const adminHash = await hashSecret(adminPassword);
  const stationHash = await hashSecret(stationPassword);
  const pinHash = await hashSecret(staffPin);
  const statements: string[] = [];
  const add = (statement: string) => statements.push(`${statement};`);

  for (const [id, name] of skills) {
    add(`INSERT INTO skills (id, name, created_at) VALUES (${sql(id)}, ${sql(name)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name`);
  }
  for (const [id, name, categorySlug, sortOrder] of categories) {
    add(`INSERT INTO service_categories (id, name, slug, sort_order, is_active, created_at, updated_at) VALUES (${sql(id)}, ${sql(name)}, ${sql(categorySlug)}, ${sortOrder}, 1, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, sort_order = excluded.sort_order, is_active = 1, updated_at = excluded.updated_at`);
  }
  for (const item of services) {
    add(`INSERT INTO services (id, name, description, icon_key, category_id, duration_min, price, is_active, created_at, updated_at) VALUES (${sql(item.id)}, ${sql(item.name)}, '', ${sql(item.iconKey)}, ${sql(item.categoryId)}, ${item.durationMin}, ${item.price.toFixed(2)}, 1, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon_key = excluded.icon_key, category_id = excluded.category_id, duration_min = excluded.duration_min, price = excluded.price, is_active = 1, updated_at = excluded.updated_at`);
    add(`DELETE FROM service_skills WHERE service_id = ${sql(item.id)}`);
    for (const skillId of item.skillIds) add(`INSERT OR IGNORE INTO service_skills (service_id, skill_id) VALUES (${sql(item.id)}, ${sql(skillId)})`);
  }
  for (const [index, name] of ['Customer not ready', 'Customer requested a break', 'Service requires another specialist', 'Other'].entries()) {
    const id = `skip-reason-${slug(name)}`;
    add(`INSERT INTO skip_reasons (id, name, sort_order, is_active, created_at, updated_at) VALUES (${sql(id)}, ${sql(name)}, ${index}, 1, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, is_active = 1, updated_at = excluded.updated_at`);
  }
  for (const [id, name, initials, skillIds] of staff) {
    add(`INSERT INTO staff (id, name, initials, pin_hash, is_active, created_at, updated_at) VALUES (${sql(id)}, ${sql(name)}, ${sql(initials)}, ${sql(pinHash)}, 1, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, initials = excluded.initials, pin_hash = excluded.pin_hash, is_active = 1, updated_at = excluded.updated_at`);
    add(`INSERT OR IGNORE INTO staff_service_state (staff_id, availability) VALUES (${sql(id)}, 'AVAILABLE')`);
    add(`DELETE FROM staff_skills WHERE staff_id = ${sql(id)}`);
    for (const skillId of skillIds) add(`INSERT OR IGNORE INTO staff_skills (staff_id, skill_id) VALUES (${sql(id)}, ${sql(skillId)})`);
  }
  add(`INSERT INTO auth_users (id, email, display_name, password_hash, role, is_active, session_version, created_at, updated_at) VALUES ('bootstrap-admin', ${sql(adminEmail)}, 'Salon Admin', ${sql(adminHash)}, 'ADMIN', 1, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, password_hash = excluded.password_hash, role = 'ADMIN', is_active = 1, updated_at = excluded.updated_at`);
  add(`INSERT INTO auth_users (id, email, display_name, password_hash, role, is_active, session_version, created_at, updated_at) VALUES ('bootstrap-station', ${sql(stationEmail)}, 'Front Desk', ${sql(stationHash)}, 'STATION', 1, 0, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, password_hash = excluded.password_hash, role = 'STATION', is_active = 1, updated_at = excluded.updated_at`);
  add(`DELETE FROM auth_login_lockouts WHERE email IN (${sql(adminEmail)}, ${sql(stationEmail)})`);
  add(`INSERT INTO shop_config (id, timezone, opening_time, closing_time, verified_session_ttl_min, currency, round_robin_enabled, state_version, created_at, updated_at) VALUES (1, ${sql(timezone)}, '09:00', '21:00', 3, 'USD', 1, 1, ${sql(now)}, ${sql(now)}) ON CONFLICT(id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`);

  // Avoid accidental secret-bearing output in logs while still making the
  // generated artifact auditable by count and content review.
  console.error(`Generated ${statements.length} idempotent D1 bootstrap statements for ${services.length} services and ${staff.length} staff records.`);
  process.stdout.write(`${statements.join('\n')}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'D1 bootstrap generation failed');
  process.exitCode = 1;
});

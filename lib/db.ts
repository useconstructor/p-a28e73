import 'server-only';
import { createClient, type Client } from '@libsql/client';
let client: Client | undefined;
export function getDb() {
  if (!process.env.TURSO_DATABASE_URL) throw new Error('Turso no está configurado.');
  client ??= createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

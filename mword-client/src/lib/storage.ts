import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import Dexie, { type Table } from 'dexie';

class BrowserDatabase extends Dexie {
  kv!: Table<{ key: string; value: string }, string>;
  constructor() { super('mword-v1'); this.version(1).stores({ kv: 'key' }); }
}
const browser = Capacitor.isNativePlatform() ? null : new BrowserDatabase();
let native: Promise<SQLiteDBConnection> | null = null;
function nativeDb() {
  native ||= (async () => {
    const connection = new SQLiteConnection(CapacitorSQLite);
    const database = await connection.createConnection('mword', false, 'no-encryption', 1, false);
    await database.open();
    await database.execute('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    return database;
  })().catch(error => { native = null; throw error; });
  return native;
}
let writeChain: Promise<unknown> = Promise.resolve();
export async function readLocal<T>(key: string): Promise<T | null> {
  await writeChain.catch(() => undefined);
  let value: string | undefined;
  if (browser) value = (await browser.kv.get(key))?.value;
  else value = (await (await nativeDb()).query('SELECT value FROM kv WHERE key=?;', [key])).values?.[0]?.value;
  return value === undefined ? null : JSON.parse(value) as T;
}
export function writeLocal(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  const operation = writeChain.catch(() => undefined).then(async () => {
    if (browser) await browser.kv.put({ key, value: serialized });
    else await (await nativeDb()).run('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;', [key, serialized]);
  });
  writeChain = operation;
  return operation;
}
let devicePromise: Promise<string> | null = null;
export function deviceId(): Promise<string> {
  devicePromise ||= createDeviceId().catch(error => { devicePromise = null; throw error; });
  return devicePromise;
}
async function createDeviceId(): Promise<string> {
  const existing = await readLocal<string>('device');
  if (existing) return existing;
  const id = crypto.randomUUID(); await writeLocal('device', id); return id;
}

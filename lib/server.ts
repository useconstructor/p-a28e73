import 'server-only';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transaction } from '@libsql/client';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from './db';
import type { Product, Draft, Line, Order } from './types';

class ApiError extends Error { constructor(public status: number, message: string, public draft?: Draft) { super(message); } }
let initialization: Promise<void> | undefined;
async function initialize() {
  initialization ??= (async () => {
    const db = getDb();
    const sql = await readFile(join(process.cwd(), 'migrations/001_initial.sql'), 'utf8');
    const tx = await db.transaction('write');
    try {
      for (const statement of sql.split(';').filter(s => s.trim())) await tx.execute(statement);
      // Upgrade existing platform records without replacing catalog or private orders.
      for (const [table, oldColumn, newColumn] of [['drafts','version','revision'],['drafts','needs_review','review_required'],['draft_lines','options','option_ids'],['orders','fingerprint','request_hash'],['order_lines','options','personalization']]) {
        const columns = (await tx.execute('PRAGMA table_info(' + table + ')')).rows.map(r => String(r.name));
        if (columns.includes(oldColumn) && !columns.includes(newColumn)) await tx.execute('ALTER TABLE ' + table + ' RENAME COLUMN ' + oldColumn + ' TO ' + newColumn);
      }
      const optionColumns = (await tx.execute('PRAGMA table_info(product_options)')).rows.map(r => String(r.name));
      if (!optionColumns.includes('required')) await tx.execute('ALTER TABLE product_options ADD COLUMN required INTEGER NOT NULL DEFAULT 0');
      if (!optionColumns.includes('name')) await tx.execute("ALTER TABLE product_options ADD COLUMN name TEXT NOT NULL DEFAULT ''");
      const marker = await tx.execute("SELECT id FROM migrations WHERE id='001_demo_catalog'");
      if (!marker.rows.length && !(await tx.execute('SELECT id FROM products LIMIT 1')).rows.length) {
        await tx.execute("INSERT INTO categories VALUES ('tacos','Tacos',1),('sides','Acompañamientos',2),('drinks','Bebidas',3)");
        await tx.execute("INSERT INTO products (id,category_id,name,description,price,available,image,position) VALUES ('pastor','tacos','Taco al pastor','Tortilla de maíz, cerdo al pastor, piña, cebolla y cilantro. Un taco por unidad.',3200,1,'/images/tacos.jpg',1),('mushroom','tacos','Taco de champiñones','Tortilla de maíz con champiñones salteados, cebolla y cilantro. Un taco por unidad.',3000,1,NULL,2),('guacamole','sides','Guacamole','Aguacate, tomate, cebolla y limón, acompañado de totopos. Una porción.',6500,1,NULL,3),('jamaica','drinks','Agua de jamaica','Infusión de flor de jamaica, servida fría. Vaso de 400 ml.',2800,0,NULL,4)");
        await tx.execute("INSERT INTO product_options (id,product_id,group_name,label,price) VALUES ('pastor-green','pastor','Salsa','Salsa verde',0),('pastor-red','pastor','Salsa','Salsa roja',0),('pastor-none','pastor','Salsa','Sin salsa',0),('mushroom-green','mushroom','Salsa','Salsa verde',0),('mushroom-red','mushroom','Salsa','Salsa roja',0),('mushroom-none','mushroom','Salsa','Sin salsa',0)");
        await tx.execute("INSERT INTO migrations(id) VALUES ('001_demo_catalog')");
      }
      await tx.commit();
    } finally { tx.close(); }
  })().catch(e => { initialization = undefined; throw e; });
  return initialization;
}
async function menu(tx: Transaction) {
  const cats = await tx.execute('SELECT id,name FROM categories ORDER BY position');
  const ps = await tx.execute('SELECT * FROM products ORDER BY position');
  const os = await tx.execute('SELECT * FROM product_options ORDER BY id');
  const products: Product[] = ps.rows.map(p => ({ id: String(p.id), categoryId: String(p.category_id), name: String(p.name), description: String(p.description), price: Number(p.price), available: Boolean(p.available), image: p.image === '/images/tacos.jpg' ? String(p.image) : null, options: os.rows.filter(o => o.product_id === p.id).map(o => ({ id: String(o.id), group: String(o.group_name), label: String(o.label), price: Number(o.price), available: Boolean(o.available), required: Boolean(o.required) })) }));
  return { categories: cats.rows.map(c => ({ id: String(c.id), name: String(c.name) })), products };
}
function textField(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ApiError(400, `${label}: revisa el texto (máximo ${max} caracteres).`);
  return value.trim();
}
function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new ApiError(400, 'Identificador inválido.');
  return value;
}
function makeLine(raw: Record<string, unknown>, products: Product[], allowUnavailable = false): Line {
  const id = identifier(raw.id); const productId = identifier(raw.productId);
  const p = products.find(p => p.id === productId);
  if (!p) throw new ApiError(400, 'Este producto no pertenece al menú.');
  if (!Number.isInteger(raw.quantity) || Number(raw.quantity) < 1 || Number(raw.quantity) > 20) throw new ApiError(400, 'La cantidad debe ser un entero entre 1 y 20.');
  if (!Array.isArray(raw.optionIds) || raw.optionIds.length > 10 || new Set(raw.optionIds).size !== raw.optionIds.length) throw new ApiError(400, 'Revisa las opciones seleccionadas.');
  const options = raw.optionIds.map(id => { const o = p.options.find(o => o.id === id); if (!o) throw new ApiError(400, 'Una opción no pertenece al producto.'); return o; });
  if (new Set(options.map(o => o.group)).size !== options.length) throw new ApiError(400, 'Elige una sola opción por grupo.');
  for (const group of new Set(p.options.filter(o => o.required).map(o => o.group))) if (!options.some(o => o.group === group)) throw new ApiError(400, `Elige una opción de ${group}.`);
  const available = p.available && options.every(o => o.available);
  if (!available && !allowUnavailable) throw new ApiError(409, 'El producto o una de sus opciones ya no está disponible. Revisa tu pedido.');
  return { id, productId, quantity: Number(raw.quantity), note: textField(raw.note, 300, 'Nota del producto'), optionIds: [...raw.optionIds].sort(), name: p.name, unitPrice: p.price + options.reduce((sum, o) => sum + o.price, 0), personalization: options.map(o => `${o.group}: ${o.label}`), available };
}
async function readDraft(tx: Transaction, session: string): Promise<Draft> {
  await tx.execute({ sql: 'INSERT OR IGNORE INTO drafts(session_id) VALUES (?)', args: [session] });
  const d = (await tx.execute({ sql: 'SELECT * FROM drafts WHERE session_id=?', args: [session] })).rows[0];
  const rows = (await tx.execute({ sql: 'SELECT * FROM draft_lines WHERE session_id=? ORDER BY rowid', args: [session] })).rows;
  const lines = rows.map(r => ({ ...JSON.parse(String(r.snapshot)), id: String(r.id), productId: String(r.product_id), quantity: Number(r.quantity), note: String(r.note), optionIds: JSON.parse(String(r.option_ids)) })) as Line[];
  return { lines, revision: Number(d.revision), name: String(d.name), note: String(d.note), reviewRequired: Boolean(d.review_required), total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) };
}
async function writeDraft(tx: Transaction, session: string, draft: Draft) {
  await tx.execute({ sql: 'UPDATE drafts SET revision=?,name=?,note=?,review_required=? WHERE session_id=?', args: [draft.revision, draft.name, draft.note, Number(draft.reviewRequired), session] });
  await tx.execute({ sql: 'DELETE FROM draft_lines WHERE session_id=?', args: [session] });
  for (const l of draft.lines) await tx.execute({ sql: 'INSERT INTO draft_lines (id,session_id,product_id,quantity,note,option_ids,snapshot) VALUES (?,?,?,?,?,?,?)', args: [l.id, session, l.productId, l.quantity, l.note, JSON.stringify(l.optionIds), JSON.stringify({ name: l.name, unitPrice: l.unitPrice, personalization: l.personalization, available: l.available })] });
}
async function refreshDraft(tx: Transaction, session: string, products: Product[]) {
  const d = await readDraft(tx, session); let changed = false;
  d.lines = d.lines.map(l => {
    let updated: Line;
    try { updated = makeLine(l as unknown as Record<string, unknown>, products, true); }
    catch { updated = { ...l, available: false }; }
    if (updated.unitPrice !== l.unitPrice || updated.name !== l.name || updated.available !== l.available || JSON.stringify(updated.personalization) !== JSON.stringify(l.personalization)) changed = true;
    return updated;
  });
  if (changed) { d.revision++; d.reviewRequired = true; await writeDraft(tx, session, d); }
  d.total = d.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return { draft: d, changed };
}
async function readOrder(tx: Transaction, session: string, id?: string): Promise<Order | null> {
  const r = await tx.execute({ sql: id ? 'SELECT * FROM orders WHERE session_id=? AND id=?' : 'SELECT * FROM orders WHERE session_id=? ORDER BY rowid DESC LIMIT 1', args: id ? [session,id] : [session] });
  if (!r.rows.length) return null;
  const o = r.rows[0];
  const ls = await tx.execute({ sql: 'SELECT * FROM order_lines WHERE order_id=? ORDER BY rowid', args: [o.id] });
  return { id: String(o.id), name: String(o.name), note: String(o.note), total: Number(o.total), status: String(o.status), createdAt: String(o.created_at), lines: ls.rows.map(l => ({ id: String(l.id), name: String(l.name), quantity: Number(l.quantity), unitPrice: Number(l.unit_price), personalization: JSON.parse(String(l.personalization)), note: String(l.note) })) };
}
function checkOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const allowed = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  for (const url of [process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined, process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined]) if (url) allowed.add(new URL(url).origin);
  // Same-origin requests in the embedded document have the app origin, not the parent origin.
  const host = req.headers.get('host');
  if (host) { allowed.add(`https://${host}`); if (process.env.NODE_ENV !== 'production' || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) allowed.add(`http://${host}`); }
  if (!origin || !allowed.has(origin)) throw new ApiError(403, 'Origen no autorizado. Abre el menú desde su dirección oficial.');
}
export async function handle(req: NextRequest, action: 'menu' | 'draft' | 'patch' | 'order' | 'confirmation') {
  let tx: Transaction | undefined; let newSession: string | undefined;
  try {
    if (action === 'patch' || action === 'order') checkOrigin(req);
    await initialize();
    tx = await getDb().transaction('write');
    let session = req.cookies.get('taqueria_session')?.value;
    if (!session || !/^[a-f0-9]{64}$/.test(session) || !(await tx.execute({ sql: 'SELECT id FROM sessions WHERE id=?', args: [session] })).rows.length) {
      if (action === 'patch' || action === 'order') throw new ApiError(401, 'No se pudo mantener tu sesión privada. Activa las cookies para este sitio y recarga el menú.');
      session = randomBytes(32).toString('hex'); newSession = session;
      await tx.execute({ sql: 'INSERT INTO sessions(id) VALUES (?)', args: [session] });
    }
    let result: unknown;
    if (action === 'menu') result = await menu(tx);
    else if (action === 'confirmation') result = { order: await readOrder(tx, session) };
    else {
      const { products } = await menu(tx);
      const refreshed = await refreshDraft(tx, session, products);
      const current = refreshed.draft;
      if (action === 'draft') result = current;
      else {
        if (Number(req.headers.get('content-length')) > 65536) throw new ApiError(413, 'El pedido es demasiado grande.');
        let body: Record<string, unknown>;
        try { const raw = await req.text(); if (raw.length > 65536) throw new Error(); body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); }
        catch { throw new ApiError(400, 'El pedido no tiene un formato válido.'); }
        if (action === 'order') {
          const key = identifier(body.idempotencyKey);
          if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new ApiError(400, 'Revisión inválida.');
          const hash = createHash('sha256').update(JSON.stringify({ revision: body.revision })).digest('hex');
          const existing = (await tx.execute({ sql: 'SELECT id,request_hash FROM orders WHERE session_id=? AND idempotency_key=?', args: [session, key] })).rows[0];
          if (existing) {
            if (existing.request_hash !== hash) throw new ApiError(409, 'Esta clave ya se usó para otro envío.');
            result = { order: await readOrder(tx, session, String(existing.id)) };
          } else {
            if (body.revision !== current.revision || current.reviewRequired) { await tx.commit(); tx.close(); tx = undefined; throw new ApiError(409, 'El menú o el borrador cambió. Revisa las cantidades, precios y disponibilidad antes de guardar.', current); }
            if (!current.lines.length) throw new ApiError(400, 'Añade al menos un producto.');
            if (!current.name.trim()) throw new ApiError(400, 'Escribe el nombre para recoger.');
            if (current.lines.some(l => !l.available)) throw new ApiError(409, 'Quita o cambia los productos no disponibles antes de guardar.', current);
            const id = `EJ-${randomBytes(4).toString('hex').toUpperCase()}`;
            await tx.execute({ sql: 'INSERT INTO orders(id,session_id,idempotency_key,request_hash,name,note,total) VALUES (?,?,?,?,?,?,?)', args: [id, session, key, hash, current.name, current.note, current.total] });
            for (const l of current.lines) await tx.execute({ sql: 'INSERT INTO order_lines (id,order_id,product_id,name,unit_price,quantity,personalization,note) VALUES (?,?,?,?,?,?,?,?)', args: [randomUUID(), id, l.productId, l.name, l.unitPrice, l.quantity, JSON.stringify(l.personalization), l.note] });
            await writeDraft(tx, session, { lines: [], revision: current.revision + 1, name: '', note: '', reviewRequired: false, total: 0 });
            result = { order: await readOrder(tx, session, id) };
          }
        } else {
          if (body.revision !== current.revision || refreshed.changed) { await tx.commit(); tx.close(); tx = undefined; throw new ApiError(409, 'El borrador se actualizó. Revisa los cambios y vuelve a intentarlo.', current); }
          if (!Array.isArray(body.lines) || body.lines.length > 50) throw new ApiError(400, 'El pedido admite hasta 50 líneas.');
          const lines = body.lines.map(raw => { if (!raw || typeof raw !== 'object') throw new ApiError(400, 'Línea inválida.'); return makeLine(raw, products, true); });
          if (new Set(lines.map(l => l.id)).size !== lines.length) throw new ApiError(400, 'Hay líneas duplicadas.');
          for (const l of lines) if (!l.available && !current.lines.some(c => c.id === l.id && c.productId === l.productId && JSON.stringify(c.optionIds) === JSON.stringify(l.optionIds) && c.quantity === l.quantity && c.note === l.note)) throw new ApiError(409, 'Este producto no está disponible para añadir o editar.');
          if (body.acceptReview !== undefined && typeof body.acceptReview !== 'boolean') throw new ApiError(400, 'Revisión inválida.');
          const next: Draft = { lines, revision: current.revision + 1, name: textField(body.name, 80, 'Nombre para recoger'), note: textField(body.note, 500, 'Nota general'), reviewRequired: body.acceptReview === true ? false : current.reviewRequired, total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) };
          await writeDraft(tx, session, next); result = next;
        }
      }
    }
    await tx.commit(); tx.close(); tx = undefined;
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    // HTTP loopback supports local QA; deployed embedded sessions remain secure.
    const localHttp = req.nextUrl.protocol === 'http:' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get('host') ?? '');
    if (newSession) response.cookies.set('taqueria_session', newSession, { httpOnly: true, secure: !localHttp, sameSite: localHttp ? 'lax' : 'none', partitioned: !localHttp && process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message, draft: e.draft }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
    console.error('Taquería API:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ error: 'No pudimos conectar con el servidor. Tus cambios siguen visibles; vuelve a intentarlo.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally { tx?.close(); }
}

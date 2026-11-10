import { cleanSecret, parseTokenList } from "./security.js";

// طبقة الحفظ الدائم في D1 للمحادثات والرسائل. كل الاستعلامات مجهّزة (Prepared Statements)،
// وكل دالة تتحقق من ملكية المحادثة عبر owner_id فلا تُرجع بيانات مستخدم آخر.

export const DEFAULT_TITLE = "محادثة جديدة";

const REDACTED = "[REDACTED]";

const TOKEN_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g
];

const BEARER_PATTERN = /(\bBearer\s+)[A-Za-z0-9._~+\/=-]{16,}/gi;

// يخفي الأسرار قبل أي حفظ: قيم ADMIN_TOKEN وGITHUB_TOKEN الفعلية وأنماط رموز GitHub ورؤوس Bearer.
export function redactSecrets(text, env = {}) {
  let out = String(text ?? "");

  const secrets = [...parseTokenList(env.ADMIN_TOKEN), cleanSecret(env.GITHUB_TOKEN)];
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join(REDACTED);
  }

  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  return out.replace(BEARER_PATTERN, "$1" + REDACTED);
}

function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function mapConversation(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    repository: row.repository ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    taskStatus: row.task_status ?? null,
    metadata: parseJson(row.metadata, {})
  };
}

function mapMessage(row) {
  if (!row) return null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    sequence: row.sequence_number,
    clientId: row.client_id ?? null,
    metadata: parseJson(row.metadata, {})
  };
}

function deriveTitle(content) {
  const line = String(content || "").split("\n").map(part => part.trim()).find(Boolean) || "";
  return line.slice(0, 60) || DEFAULT_TITLE;
}

function isUniqueViolation(error) {
  return /UNIQUE constraint failed/i.test(String((error && error.message) || error || ""));
}

const CURSOR = /^(\d+)\.([0-9a-fA-F-]{36})$/;

export async function createConversation(env, ownerId, { title, repository } = {}) {
  const now = Date.now();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO conversations (id, owner_id, title, repository, status, created_at, updated_at, last_message_at, metadata) " +
    "VALUES (?, ?, ?, ?, 'active', ?, ?, ?, '{}')"
  ).bind(id, ownerId, title || DEFAULT_TITLE, repository || null, now, now, now).run();

  return getConversation(env, ownerId, id);
}

export async function getConversation(env, ownerId, id) {
  const row = await env.DB.prepare(
    "SELECT c.*, (SELECT t.status FROM tasks t WHERE t.conversation_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS task_status " +
    "FROM conversations c WHERE c.id = ? AND c.owner_id = ?"
  ).bind(id, ownerId).first();

  return mapConversation(row);
}

// ترقيم بمؤشر (Keyset) حسب آخر نشاط؛ q يبحث في العنوان ونص الرسائل.
export async function listConversations(env, ownerId, { limit = 30, cursor, q } = {}) {
  const conditions = ["c.owner_id = ?"];
  const params = [ownerId];

  const needle = typeof q === "string" ? q.trim() : "";
  if (needle) {
    const like = "%" + needle.replace(/[\\%_]/g, "\\$&") + "%";
    conditions.push(
      "(c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\'))"
    );
    params.push(like, like);
  }

  const parsed = typeof cursor === "string" ? CURSOR.exec(cursor) : null;
  if (parsed) {
    const ts = Number(parsed[1]);
    conditions.push("(c.last_message_at < ? OR (c.last_message_at = ? AND c.id < ?))");
    params.push(ts, ts, parsed[2]);
  }

  params.push(limit + 1);

  const { results } = await env.DB.prepare(
    "SELECT c.*, (SELECT t.status FROM tasks t WHERE t.conversation_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS task_status " +
    "FROM conversations c WHERE " + conditions.join(" AND ") +
    " ORDER BY c.last_message_at DESC, c.id DESC LIMIT ?"
  ).bind(...params).all();

  const rows = results || [];
  const page = rows.slice(0, limit).map(mapConversation);
  const last = page[page.length - 1];

  return {
    conversations: page,
    nextCursor: rows.length > limit && last ? last.lastMessageAt + "." + last.id : null
  };
}

export async function renameConversation(env, ownerId, id, title) {
  const meta = await env.DB.prepare(
    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
  ).bind(title, Date.now(), id, ownerId).run();

  if (!meta.meta || !meta.meta.changes) return null;
  return getConversation(env, ownerId, id);
}

// الحذف يشمل الرسائل والمهام ونقاط الاستعادة والأحداث عبر ON DELETE CASCADE.
export async function deleteConversation(env, ownerId, id) {
  const result = await env.DB.prepare(
    "DELETE FROM conversations WHERE id = ? AND owner_id = ?"
  ).bind(id, ownerId).run();

  return Boolean(result.meta && result.meta.changes);
}

// يُرجع أحدث الرسائل (أو الأقدم من before) بترتيب تصاعدي؛ أو الأحدث من after لإعادة المزامنة.
export async function listMessages(env, ownerId, conversationId, { limit = 50, before, after } = {}) {
  const conversation = await getConversation(env, ownerId, conversationId);
  if (!conversation) return null;

  if (Number.isInteger(after)) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? AND sequence_number > ? ORDER BY sequence_number ASC LIMIT ?"
    ).bind(conversationId, after, limit + 1).all();

    const rows = results || [];
    return { messages: rows.slice(0, limit).map(mapMessage), hasMore: rows.length > limit };
  }

  const bound = Number.isInteger(before) ? before : null;
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? AND (? IS NULL OR sequence_number < ?) ORDER BY sequence_number DESC LIMIT ?"
  ).bind(conversationId, bound, bound, limit + 1).all();

  const rows = results || [];
  return {
    messages: rows.slice(0, limit).map(mapMessage).reverse(),
    hasMore: rows.length > limit
  };
}

// يحفظ رسالة بترتيب متسلسل. clientId يجعل الحفظ idempotent: إعادة الإرسال تُرجع الرسالة نفسها.
// الأسرار تُخفى قبل الحفظ. يُرجع null إن لم تكن المحادثة للمالك.
export async function appendMessage(env, ownerId, conversationId, { role, content, clientId, metadata } = {}) {
  const conversation = await getConversation(env, ownerId, conversationId);
  if (!conversation) return null;

  const findByClient = async () => clientId
    ? mapMessage(await env.DB.prepare(
        "SELECT * FROM messages WHERE conversation_id = ? AND client_id = ?"
      ).bind(conversationId, clientId).first())
    : null;

  const existing = await findByClient();
  if (existing) return { message: existing, duplicate: true };

  const safeContent = redactSecrets(content, env);
  const metadataJson = JSON.stringify(metadata && typeof metadata === "object" ? metadata : {});
  const id = crypto.randomUUID();

  for (let attempt = 0; attempt < 5; attempt++) {
    const now = Date.now();

    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO messages (id, conversation_id, role, content, created_at, sequence_number, client_id, metadata) " +
          "SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sequence_number), 0) + 1, ?, ? FROM messages WHERE conversation_id = ?"
        ).bind(id, conversationId, role, safeContent, now, clientId || null, metadataJson, conversationId),
        env.DB.prepare(
          "UPDATE conversations SET last_message_at = ?, updated_at = ?, " +
          "title = CASE WHEN title = ? AND ? = 'user' THEN ? ELSE title END WHERE id = ? AND owner_id = ?"
        ).bind(now, now, DEFAULT_TITLE, role, deriveTitle(safeContent), conversationId, ownerId)
      ]);

      const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first();
      return { message: mapMessage(row), duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // تعارض في الترتيب بين طلبين متزامنين أو في clientId: نعيد القراءة ثم نحاول من جديد.
      const raced = await findByClient();
      if (raced) return { message: raced, duplicate: true };
    }
  }

  throw new Error("تعذر حفظ الرسالة بسبب تعارض متكرر في الترتيب.");
}

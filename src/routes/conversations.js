import { json } from "../lib/http.js";
import { LIMITS } from "../config.js";
import { safeRepoName } from "../lib/security.js";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation
} from "../lib/db.js";

// واجهات المحادثات: إنشاء، قائمة وبحث، قراءة، إعادة تسمية، حذف، سجل الرسائل، حفظ رسالة مستخدم.
// كل المسارات مقيّدة بمالك المحادثة (params.ownerId)؛ المحادثة غير المملوكة تُعامل كغير موجودة.

const ID = "([0-9a-fA-F-]{36})";
const ITEM = new RegExp("^/api/conversations/" + ID + "$");
const MESSAGES = new RegExp("^/api/conversations/" + ID + "/messages$");
const CLIENT_ID = /^[A-Za-z0-9._:-]{1,100}$/;

const NOT_FOUND = () => json({ error: "المحادثة غير موجودة." }, 404);

function noDatabase(env) {
  return env.DB
    ? null
    : json({ error: "قاعدة البيانات D1 غير مربوطة. أنشئ القاعدة واربطها باسم DB ثم طبّق migrations (انظر README)." }, 503);
}

async function readBody(request, { allowEmpty = false } = {}) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > LIMITS.maxBodyBytes) {
    return { error: json({ error: "حجم الطلب أكبر من الحد المسموح." }, 413) };
  }

  const text = await request.text();
  if (!text.trim() && allowEmpty) return { data: {} };

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("shape");
    return { data };
  } catch {
    return { error: json({ error: "جسم الطلب ليس JSON صالحًا." }, 400) };
  }
}

function cleanTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= 200 ? title : null;
}

function parseLimit(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? Math.min(number, 200) : fallback;
}

function parseSequence(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : NaN;
}

async function list(request, env, ctx, { ownerId }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const url = new URL(request.url);
  const result = await listConversations(env, ownerId, {
    limit: parseLimit(url.searchParams.get("limit"), 30),
    cursor: url.searchParams.get("cursor") || undefined,
    q: (url.searchParams.get("q") || "").slice(0, 100)
  });

  return json(result);
}

async function create(request, env, ctx, { ownerId }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const { data, error } = await readBody(request, { allowEmpty: true });
  if (error) return error;

  let title;
  if (data.title !== undefined) {
    title = cleanTitle(data.title);
    if (!title) return json({ error: "العنوان غير صالح (حتى 200 حرف)." }, 400);
  }

  let repository;
  if (data.repository !== undefined && data.repository !== null) {
    if (!safeRepoName(data.repository)) return json({ error: "اسم المستودع غير صالح." }, 400);
    repository = data.repository;
  }

  const conversation = await createConversation(env, ownerId, { title, repository });
  return json({ conversation }, 201);
}

async function read(request, env, ctx, { ownerId, id }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const conversation = await getConversation(env, ownerId, id);
  return conversation ? json({ conversation }) : NOT_FOUND();
}

async function rename(request, env, ctx, { ownerId, id }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const { data, error } = await readBody(request);
  if (error) return error;

  const title = cleanTitle(data.title);
  if (!title) return json({ error: "العنوان غير صالح (حتى 200 حرف)." }, 400);

  const conversation = await renameConversation(env, ownerId, id, title);
  return conversation ? json({ conversation }) : NOT_FOUND();
}

async function remove(request, env, ctx, { ownerId, id }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  return (await deleteConversation(env, ownerId, id)) ? json({ ok: true }) : NOT_FOUND();
}

async function messages(request, env, ctx, { ownerId, id }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const url = new URL(request.url);
  const before = parseSequence(url.searchParams.get("before"));
  const after = parseSequence(url.searchParams.get("after"));

  if (Number.isNaN(before) || Number.isNaN(after)) {
    return json({ error: "قيمة before أو after غير صالحة." }, 400);
  }

  const page = await listMessages(env, ownerId, id, {
    limit: parseLimit(url.searchParams.get("limit"), 50),
    before,
    after
  });

  return page ? json(page) : NOT_FOUND();
}

// رسائل المستخدم فقط من العميل؛ رسائل المساعد والنظام يكتبها الخادم.
async function postMessage(request, env, ctx, { ownerId, id }) {
  const denied = noDatabase(env);
  if (denied) return denied;

  const { data, error } = await readBody(request);
  if (error) return error;

  const content = typeof data.content === "string" ? data.content.trim() : "";
  if (!content) return json({ error: "اكتب الرسالة أولًا." }, 400);
  if (content.length > LIMITS.maxTaskChars) {
    return json({ error: "الرسالة أطول من الحد المسموح (" + LIMITS.maxTaskChars + " حرف)." }, 400);
  }

  let clientId;
  if (data.clientId !== undefined && data.clientId !== null) {
    if (typeof data.clientId !== "string" || !CLIENT_ID.test(data.clientId)) {
      return json({ error: "clientId غير صالح." }, 400);
    }
    clientId = data.clientId;
  }

  const saved = await appendMessage(env, ownerId, id, { role: "user", content, clientId });
  if (!saved) return NOT_FOUND();

  return json({ message: saved.message, duplicate: saved.duplicate }, saved.duplicate ? 200 : 201);
}

// يُرجع null إن لم يطابق المسار؛ وإلا { id, allow, handlers } حيث handlers حسب طريقة HTTP.
export function matchConversationRoute(pathname) {
  if (pathname === "/api/conversations") {
    return { id: null, allow: ["GET", "POST"], handlers: { GET: list, POST: create } };
  }

  let match = ITEM.exec(pathname);
  if (match) {
    return {
      id: match[1],
      allow: ["GET", "PATCH", "DELETE"],
      handlers: { GET: read, PATCH: rename, DELETE: remove }
    };
  }

  match = MESSAGES.exec(pathname);
  if (match) {
    return { id: match[1], allow: ["GET", "POST"], handlers: { GET: messages, POST: postMessage } };
  }

  return null;
}

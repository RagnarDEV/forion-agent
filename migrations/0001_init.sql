-- Forion Agent: المحادثات والمهام الدائمة (Cloudflare D1 / SQLite).
-- الأزمنة أعداد صحيحة بالميلي ثانية (Date.now()). الحقول ذات الصيغة JSON تُخزَّن نصًا.

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  repository TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_recent
  ON conversations (owner_id, last_message_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL,
  -- معرّف يولّده العميل لمنع تكرار حفظ الرسالة عند إعادة إرسال الطلب.
  client_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sequence
  ON messages (conversation_id, sequence_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client
  ON messages (conversation_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'waiting', 'suspended', 'recovering', 'failed', 'cancelled', 'completed'
  )),
  current_stage TEXT,
  workflow_instance_id TEXT,
  input TEXT NOT NULL DEFAULT '{}',
  context TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  -- طلبات صريحة تُقرأ من الـ Workflow عند حدود المراحل: الإيقاف المؤقت والإلغاء الفعلي.
  pause_requested INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  -- يمنع تكرار إنشاء المهمة عند إعادة إرسال الطلب نفسه.
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation
  ON tasks (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_status
  ON tasks (owner_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency
  ON tasks (owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  checkpoint_data TEXT NOT NULL DEFAULT '{}',
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_stage_attempt
  ON task_checkpoints (task_id, stage, attempt);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_events_task
  ON task_events (task_id, id);

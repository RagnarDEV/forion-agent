import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// محاكي D1 فوق node:sqlite لاختبار الاستعلامات الحقيقية ضد مخطط migrations الفعلي.
// يُرجع null إن لم يكن node:sqlite متاحًا في إصدار Node الحالي، فتُتخطى الاختبارات المعتمدة عليه.
export async function createFakeD1() {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return null;
  }

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const file of readdirSync(dir).filter(name => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(dir + file, "utf8"));
  }

  const statement = (sql, params = []) => ({
    bind: (...args) => statement(sql, args),
    run: async () => {
      const result = sqlite.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params) })
  });

  return {
    prepare: sql => statement(sql),
    // D1 يُنفّذ الدفعة كمعاملة واحدة: إما تُطبَّق كلها أو لا شيء.
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

import { TIMEOUTS } from "../config.js";
import { runPipeline } from "../pipeline/index.js";
import { errorMessage } from "./errors.js";
import { ndjson } from "./http.js";

// يبث أحداث التقدم كأسطر JSON مع نبضات دورية، فلا يبقى الاتصال صامتًا
// أثناء الانتظار الطويل (وهو سبب Failed to fetch على الشبكات الضعيفة).
export function streamTask(env, ctx, input) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let open = true;

  const emit = event => {
    if (!open) return;
    writer.write(encoder.encode(JSON.stringify(event) + "\n")).catch(() => {
      open = false;
    });
  };
  const io = { emit, alive: () => open };

  const heartbeat = setInterval(() => emit({ type: "ping" }), TIMEOUTS.heartbeatMs);

  const job = (async () => {
    try {
      const result = await runPipeline(env, input, io);
      emit({ type: "result", ...result });
    } catch (error) {
      emit({ type: "error", error: errorMessage(error) });
    } finally {
      clearInterval(heartbeat);
      try { await writer.close(); } catch {}
    }
  })();

  ctx.waitUntil(job);
  return ndjson(readable);
}

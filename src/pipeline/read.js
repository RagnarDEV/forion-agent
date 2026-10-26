import { UserError } from "../lib/errors.js";
import { github } from "../lib/github.js";

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// يقرأ محتوى الملفات المختارة بالتوازي.
export function readFiles(env, encodedRepo, chosen) {
  return Promise.all(chosen.map(async item => {
    const blob = await github(env, "/repos/" + encodedRepo + "/git/blobs/" + item.sha);

    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new UserError("تعذرت قراءة الملف: " + item.path);
    }

    try {
      return { path: item.path, content: decodeBase64(blob.content) };
    } catch {
      throw new UserError("الملف ليس نصًا بترميز UTF-8: " + item.path);
    }
  }));
}

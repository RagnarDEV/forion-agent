import { UserError } from "../lib/errors.js";
import { github } from "../lib/github.js";

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// يقرأ نص ملف واحد من GitHub عبر معرّف الـ blob.
export async function fetchBlobText(env, encodedRepo, sha, path) {
  const blob = await github(env, "/repos/" + encodedRepo + "/git/blobs/" + sha);

  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new UserError("تعذرت قراءة الملف: " + path);
  }

  try {
    return decodeBase64(blob.content);
  } catch {
    throw new UserError("الملف ليس نصًا بترميز UTF-8: " + path);
  }
}

// يقرأ محتوى الملفات المختارة بالتوازي.
export function readFiles(env, encodedRepo, chosen) {
  return Promise.all(chosen.map(async item => ({
    path: item.path,
    content: await fetchBlobText(env, encodedRepo, item.sha, item.path)
  })));
}

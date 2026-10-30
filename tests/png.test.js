import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { renderIcon } from "../src/lib/png.js";
import { baseEnv, fakeAI } from "./helpers.js";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), depth: bytes[24], colorType: bytes[25] };
}

function chunkTypes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types = [];
  let offset = 8;

  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    types.push(String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
  }

  return types;
}

test("renderIcon: PNG صالح بالأبعاد المطلوبة وبنية القطع الصحيحة", async () => {
  const png = await renderIcon(64);

  assert.deepEqual([...png.subarray(0, 8)], SIGNATURE);
  assert.deepEqual(readHeader(png), { width: 64, height: 64, depth: 8, colorType: 3 });
  assert.deepEqual(chunkTypes(png), ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
});

test("renderIcon: النسخة maskable تختلف (بلا زوايا شفافة)", async () => {
  const normal = await renderIcon(64);
  const maskable = await renderIcon(64, { maskable: true });

  assert.notDeepEqual([...normal], [...maskable]);
});

test("مسار الأيقونة يُرجع PNG بترويسات تخزين طويلة", async () => {
  const response = await worker.fetch(
    new Request("https://forion.test/icons/icon-192.png"),
    baseEnv(fakeAI({})),
    { waitUntil() {} }
  );
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.match(response.headers.get("Cache-Control"), /immutable/);
  assert.deepEqual([...bytes.subarray(0, 8)], SIGNATURE);
  assert.equal(readHeader(bytes).width, 192);
});

test("أيقونة غير معروفة تُمرَّر إلى الملفات الثابتة (503 عند غياب ASSETS)", async () => {
  const response = await worker.fetch(
    new Request("https://forion.test/icons/other.png"),
    baseEnv(fakeAI({})),
    { waitUntil() {} }
  );

  assert.equal(response.status, 503);
});

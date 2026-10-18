import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  assertMenuBatchSize,
  detectMenuMimeType,
  MAX_MENU_BATCH_SIZE,
  MenuUploadError,
  normalizeMenuUpload,
  readMenuUploadStream
} from "./menuUploadService";

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("detects supported formats from signatures instead of metadata", () => {
  assert.equal(detectMenuMimeType(Buffer.from("%PDF-1.7\n")), "application/pdf");
  assert.equal(detectMenuMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectMenuMimeType(Buffer.concat([pngHeader, Buffer.alloc(8)])), "image/png");
  assert.equal(detectMenuMimeType(Buffer.from("RIFF0000WEBP", "ascii")), "image/webp");
  assert.equal(detectMenuMimeType(Buffer.from("0000ftypheic0000", "ascii")), "image/heic");
});

test("uses the actual signature when filename and MIME are wrong", async () => {
  const normalized = await normalizeMenuUpload({
    buffer: Buffer.from("%PDF-1.7\nmenu"),
    filename: "menu.jpg",
    declaredMimeType: "image/jpeg"
  });
  assert.equal(normalized.mimeType, "application/pdf");
  assert.equal(normalized.filename, "menu.pdf");
});

test("rejects corrupt or renamed files", async () => {
  await assert.rejects(
    normalizeMenuUpload({
      buffer: Buffer.from("not an image"),
      filename: "menu.pdf",
      declaredMimeType: "application/pdf"
    }),
    (error: unknown) => error instanceof MenuUploadError && error.code === "UNSUPPORTED_FILE_TYPE"
  );
});

test("maps prematurely closed streams to UPLOAD_INTERRUPTED", async () => {
  const interrupted = Readable.from(
    (async function* () {
      yield Buffer.from("partial");
      const error = new Error("closed") as Error & { code?: string };
      error.code = "ERR_STREAM_PREMATURE_CLOSE";
      throw error;
    })()
  );
  await assert.rejects(
    readMenuUploadStream(interrupted, "menu.pdf"),
    (error: unknown) => error instanceof MenuUploadError && error.code === "UPLOAD_INTERRUPTED"
  );
});

test("enforces the total batch size", () => {
  assert.doesNotThrow(() => assertMenuBatchSize(MAX_MENU_BATCH_SIZE));
  assert.throws(
    () => assertMenuBatchSize(MAX_MENU_BATCH_SIZE + 1),
    (error: unknown) => error instanceof MenuUploadError && error.code === "BATCH_TOO_LARGE"
  );
});

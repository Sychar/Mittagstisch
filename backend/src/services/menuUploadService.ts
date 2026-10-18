import path from "node:path";

const heicConvert = require("heic-convert") as (options: {
  buffer: Buffer;
  format: "JPEG";
  quality: number;
}) => Promise<Buffer | ArrayBuffer>;

export const MAX_MENU_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_MENU_BATCH_SIZE = 50 * 1024 * 1024;
export const MAX_MENU_FILES = 10;

export type NormalizedMenuUpload = {
  buffer: Buffer;
  filename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  originalMimeType: string;
  originalBytes: number;
  convertedFromHeic: boolean;
};

export class MenuUploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

const normalizeDeclaredMime = (value: unknown): string => {
  const mime = String(value || "").trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "image/heif-sequence") return "image/heif";
  if (mime === "image/heic-sequence") return "image/heic";
  return mime;
};

const detectIsoBaseMediaBrand = (buffer: Buffer): string => {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return "";
  const brands = [buffer.toString("ascii", 8, 12)];
  for (let offset = 16; offset + 4 <= Math.min(buffer.length, 64); offset += 4) {
    brands.push(buffer.toString("ascii", offset, offset + 4));
  }
  return brands.find((brand) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) || "";
};

export const detectMenuMimeType = (buffer: Buffer): string => {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (detectIsoBaseMediaBrand(buffer)) return "image/heic";
  return "";
};

const extensionForMime = (mimeType: string): string => {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
};

const normalizeOutputFilename = (filename: unknown, mimeType: string): string => {
  const rawBase = path.basename(String(filename || "menu").replace(/\\/g, "/"));
  const baseWithoutExtension = rawBase.replace(/\.[^.]+$/, "").trim() || "menu";
  return `${baseWithoutExtension.slice(0, 120)}${extensionForMime(mimeType)}`;
};

export const readMenuUploadStream = async (
  stream: NodeJS.ReadableStream,
  filename?: string
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      bytes += next.length;
      if (bytes > MAX_MENU_FILE_SIZE) {
        throw new MenuUploadError(413, "FILE_TOO_LARGE", "Datei ist größer als 10 MB.", {
          fileName: filename,
          maxBytes: MAX_MENU_FILE_SIZE
        });
      }
      chunks.push(next);
    }
  } catch (error) {
    if (error instanceof MenuUploadError) throw error;
    const code = (error as { code?: string })?.code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      throw new MenuUploadError(413, "FILE_TOO_LARGE", "Datei ist größer als 10 MB.", {
        fileName: filename,
        maxBytes: MAX_MENU_FILE_SIZE
      });
    }
    if (code === "ERR_STREAM_PREMATURE_CLOSE") {
      throw new MenuUploadError(
        400,
        "UPLOAD_INTERRUPTED",
        "Der Datei-Upload wurde unterbrochen. Bitte Verbindung prüfen und erneut versuchen.",
        { fileName: filename }
      );
    }
    throw error;
  }
  if (!bytes) {
    throw new MenuUploadError(400, "EMPTY_FILE", "Die ausgewählte Datei ist leer.", {
      fileName: filename
    });
  }
  return Buffer.concat(chunks, bytes);
};

export const normalizeMenuUpload = async (input: {
  buffer: Buffer;
  filename?: string;
  declaredMimeType?: string;
}): Promise<NormalizedMenuUpload> => {
  const declaredMimeType = normalizeDeclaredMime(input.declaredMimeType);
  const detectedMimeType = detectMenuMimeType(input.buffer);
  if (!detectedMimeType) {
    throw new MenuUploadError(
      400,
      "UNSUPPORTED_FILE_TYPE",
      "Datei ist kein gültiges PDF-, JPG-, PNG-, WEBP-, HEIC- oder HEIF-Dokument.",
      { fileName: input.filename, declaredMimeType }
    );
  }

  if (detectedMimeType === "image/heic") {
    try {
      const converted = await heicConvert({
        buffer: input.buffer,
        format: "JPEG",
        quality: 0.86
      });
      const output = Buffer.isBuffer(converted) ? converted : Buffer.from(converted);
      if (detectMenuMimeType(output) !== "image/jpeg") {
        throw new Error("HEIC conversion did not produce JPEG data");
      }
      if (output.length > MAX_MENU_FILE_SIZE) {
        throw new MenuUploadError(
          413,
          "CONVERTED_FILE_TOO_LARGE",
          "Das umgewandelte Foto ist größer als 10 MB.",
          { fileName: input.filename, maxBytes: MAX_MENU_FILE_SIZE }
        );
      }
      return {
        buffer: output,
        filename: normalizeOutputFilename(input.filename, "image/jpeg"),
        mimeType: "image/jpeg",
        originalMimeType: detectedMimeType,
        originalBytes: input.buffer.length,
        convertedFromHeic: true
      };
    } catch (error) {
      if (error instanceof MenuUploadError) throw error;
      throw new MenuUploadError(
        422,
        "HEIC_CONVERSION_FAILED",
        "Das HEIC-/HEIF-Foto konnte nicht umgewandelt werden. Bitte erneut aus der Galerie wählen.",
        { fileName: input.filename }
      );
    }
  }

  return {
    buffer: input.buffer,
    filename: normalizeOutputFilename(input.filename, detectedMimeType),
    mimeType: detectedMimeType as NormalizedMenuUpload["mimeType"],
    originalMimeType: detectedMimeType,
    originalBytes: input.buffer.length,
    convertedFromHeic: false
  };
};

export const assertMenuBatchSize = (totalBytes: number): void => {
  if (totalBytes > MAX_MENU_BATCH_SIZE) {
    throw new MenuUploadError(
      413,
      "BATCH_TOO_LARGE",
      "Alle ausgewählten Dateien zusammen dürfen maximal 50 MB groß sein.",
      { maxBytes: MAX_MENU_BATCH_SIZE, bytes: totalBytes }
    );
  }
};


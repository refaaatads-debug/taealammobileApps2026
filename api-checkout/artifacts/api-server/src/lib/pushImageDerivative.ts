import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminNotificationAttachmentImage } from "./notificationImage";

export const MAX_PUSH_IMAGE_BYTES = 300_000;
export const MAX_SOURCE_IMAGE_BYTES = 5_000_000;
export const PUSH_IMAGE_EDGE = 960;
const MAX_CACHE_FILES = 256;
const TTL_MS = 7 * 24 * 3600_000;
const DEFAULT_CACHE = "/var/cache/ajyal-api/push-images";
const PUBLIC_ORIGIN = "https://api.ajyalalmaerifa.com";
const KEY = /^[a-f0-9]{64}\.jpg$/;
let active = 0;
const pending = new Map<string, Promise<string | null>>();

function isImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/webp") return bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
  return false;
}

export async function encodePushImage(source: Buffer, mime: string): Promise<Buffer> {
  if (!source.length || source.length > MAX_SOURCE_IMAGE_BYTES || !isImageSignature(source, mime)) throw new Error("invalid_image");
  const options = { limitInputPixels: 40_000_000, animated: false, failOn: "warning" as const };
  const metadata = await sharp(source, options).metadata();
  const expected = mime === "image/jpeg" ? "jpeg" : mime === "image/png" ? "png" : "webp";
  if (metadata.format !== expected || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error("unsupported_image");
  for (const [edge, quality] of [[960,78],[800,62],[640,48],[480,38]]) {
    const output = await sharp(source, options).timeout({ seconds: 3 }).rotate().resize(edge,edge,{fit:"inside",withoutEnlargement:true}).flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: false }).toBuffer();
    if (output.length <= MAX_PUSH_IMAGE_BYTES) return output;
  }
  throw new Error("image_still_too_large");
}

async function prune(cacheDir: string): Promise<void> {
  const files = (await readdir(cacheDir)).filter(name => KEY.test(name));
  const entries = await Promise.all(files.map(async name => ({name, info:await stat(path.join(cacheDir,name))})));
  entries.sort((a,b) => b.info.mtimeMs-a.info.mtimeMs);
  await Promise.all(entries.filter((entry,index) => index >= MAX_CACHE_FILES || Date.now()-entry.info.mtimeMs > TTL_MS).map(entry => unlink(path.join(cacheDir,entry.name)).catch(()=>undefined)));
}

type Options = { fetcher?: typeof fetch; cacheDir?: string };
/** Only called by the durable worker; never edits the original in-app attachment. */
export async function prepareAdminPushImage(sourceUrl: unknown, options: Options = {}): Promise<string | null> {
  const trusted = adminNotificationAttachmentImage(sourceUrl);
  if (!trusted) return null;
  const cacheDir = options.cacheDir ?? process.env.PUSH_IMAGE_CACHE_DIR ?? DEFAULT_CACHE;
  const id = createHash("sha256").update(`push-jpeg-v1:${trusted}`).digest("hex") + ".jpg";
  const file = path.join(cacheDir,id);
  const resultUrl = `${PUBLIC_ORIGIN}/api/push-images/${id}`;
  try {
    const info = await stat(file);
    if (info.size > 0 && info.size <= MAX_PUSH_IMAGE_BYTES && Date.now()-info.mtimeMs < TTL_MS) return resultUrl;
  } catch { /* cache miss */ }
  if (pending.has(file)) return pending.get(file)!;
  if (active >= 2) return null;
  const job = (async () => {
    active++;
    try {
      const response = await (options.fetcher ?? fetch)(trusted,{redirect:"error",signal:AbortSignal.timeout(5_000)});
      if (!response.ok || !response.body) return null;
      const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!["image/jpeg","image/png","image/webp"].includes(mime)) { await response.body.cancel(); return null; }
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > MAX_SOURCE_IMAGE_BYTES) { await response.body.cancel(); return null; }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const {done,value} = await reader.read(); if (done) break;
          size += value.length;
          if (size > MAX_SOURCE_IMAGE_BYTES) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const output = await encodePushImage(Buffer.concat(chunks),mime);
      await mkdir(cacheDir,{recursive:true,mode:0o700});
      const temp = `${file}.${process.pid}.tmp`;
      try { await writeFile(temp,output,{mode:0o600}); await rename(temp,file); }
      finally { await unlink(temp).catch(()=>undefined); }
      await prune(cacheDir);
      return resultUrl;
    } catch { return null; }
    finally { active--; }
  })();
  pending.set(file,job);
  try { return await job; } finally { pending.delete(file); }
}

export async function readPreparedPushImage(filename: string, cacheDir = process.env.PUSH_IMAGE_CACHE_DIR ?? DEFAULT_CACHE): Promise<Buffer | null> {
  if (!KEY.test(filename)) return null;
  try {
    const file = path.join(cacheDir,filename); const info = await stat(file);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_PUSH_IMAGE_BYTES || Date.now()-info.mtimeMs > TTL_MS) return null;
    const bytes = await readFile(file);
    return isImageSignature(bytes,"image/jpeg") ? bytes : null;
  } catch { return null; }
}

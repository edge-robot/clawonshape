import {createHash, randomBytes} from 'node:crypto';
import {mkdir, lstat, realpath, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
export const IMAGE_SIZE = 800;
export const VIEW_MATRIX =
  '0.7071067812,0.7071067812,0,0,-0.4082482905,0.4082482905,0.8164965809,0,0.5773502692,-0.5773502692,0.5773502692,0';
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function validatePng(data: Buffer, size = IMAGE_SIZE): Buffer {
  try {
    if (data.length > 6_000_000 || !data.subarray(0, 8).equals(SIGNATURE)) {
      // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
      throw new Error();
    }
    let offset = 8,
      header = false,
      endedData = false,
      seenData = false;
    const compressed: Buffer[] = [];
    let channels = 0;
    while (offset < data.length) {
      if (offset + 12 > data.length) {
        // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
        throw new Error();
      }
      const len = data.readUInt32BE(offset),
        end = offset + 12 + len;
      if (end > data.length) {
        // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
        throw new Error();
      }
      const kind = data.toString('ascii', offset + 4, offset + 8),
        body = data.subarray(offset + 8, end - 4);
      if (crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) {
        // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
        throw new Error();
      }
      if (!header) {
        if (
          kind !== 'IHDR' ||
          len !== 13 ||
          body.readUInt32BE(0) !== size ||
          body.readUInt32BE(4) !== size ||
          body[8] !== 8 ||
          ![0, 2, 4, 6].includes(body[9]) ||
          body[10] ||
          body[11] ||
          body[12]
        ) {
          // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
          throw new Error();
        }
        channels = ({0: 1, 2: 3, 4: 2, 6: 4} as Record<number, number>)[body[9]];
        header = true;
      } else if (kind === 'IHDR') {
        // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
        throw new Error();
      }
      if (kind === 'IDAT') {
        if (endedData) {
          // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
          throw new Error();
        }
        compressed.push(body);
        seenData = true;
      } else if (seenData) {
        endedData = true;
      }
      if (kind === 'IEND') {
        if (len || end !== data.length || !seenData) {
          // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
          throw new Error();
        }
        const row = 1 + size * channels;
        const pixels = inflateSync(Buffer.concat(compressed), {maxOutputLength: row * size});
        if (pixels.length !== row * size) {
          // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
          throw new Error();
        }
        for (let y = 0; y < size; y++) {
          if (pixels[y * row] > 4) {
            // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
            throw new Error();
          }
        }
        return data;
      }
      if (!['IHDR', 'IDAT', 'IEND', 'PLTE'].includes(kind) && kind[0] === kind[0].toUpperCase()) {
        // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
        throw new Error();
      }
      offset = end;
    }
    // biome-ignore lint/suspicious/useErrorMessage: local sentinel; the enclosing catch discards the message and maps it to a coded error
    throw new Error();
  } catch {
    throw new Error('provider_image_invalid');
  }
}
export function decodePng(response: unknown): Buffer {
  const images = (response as {images?: unknown})?.images;
  let encoded: unknown;
  if (Array.isArray(images) && images.length === 1) {
    encoded = images[0];
    if (Array.isArray(encoded) && encoded.length === 1) {
      encoded = encoded[0];
    }
  }
  if (
    typeof encoded !== 'string' ||
    encoded.length > 8_000_000 ||
    !encoded.length ||
    encoded.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new Error('provider_image_invalid');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) {
    throw new Error('provider_image_invalid');
  }
  return validatePng(bytes);
}
export const imageHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// Shared /workspace/artifacts mount is managed by Clawake, not by tool arguments.
export async function saveRender(workspaceDir: string, bytes: Buffer): Promise<string> {
  if (!path.isAbsolute(workspaceDir) || (await realpath(workspaceDir)) !== workspaceDir) {
    throw new Error('credential_store_unavailable');
  }
  const parent = path.join(workspaceDir, 'artifacts');
  await mkdir(parent, {recursive: true, mode: 0o700});
  const p = await lstat(parent);
  if (!p.isDirectory() || p.isSymbolicLink() || (await realpath(parent)) !== parent) {
    throw new Error('credential_store_unavailable');
  }
  const root = path.join(parent, 'claw-onshape');
  await mkdir(root, {mode: 0o700}).catch((e) => {
    if (e.code !== 'EEXIST') {
      throw e;
    }
  });
  const s = await lstat(root);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid?.() ||
    s.mode & 0o077 ||
    (await realpath(root)) !== root
  ) {
    throw new Error('credential_store_unavailable');
  }
  const file = path.join(root, `${randomBytes(16).toString('hex')}.png`);
  await writeFile(file, bytes, {flag: 'wx', mode: 0o600});
  return file;
}
export async function readRender(workspaceDir: string, file: string, sha256: string): Promise<Buffer> {
  const root = path.join(workspaceDir, 'artifacts', 'claw-onshape');
  if (path.dirname(file) !== root || !/^[a-f0-9]{32}\.png$/.test(path.basename(file))) {
    throw new Error('delegation_denied');
  }
  const s = await lstat(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size > 6_000_000 ||
    s.uid !== process.getuid?.() ||
    s.mode & 0o077 ||
    (await realpath(file)) !== file
  ) {
    throw new Error('delegation_denied');
  }
  const bytes = validatePng(await readFile(file));
  if (imageHash(bytes) !== sha256) {
    throw new Error('delegation_denied');
  }
  return bytes;
}

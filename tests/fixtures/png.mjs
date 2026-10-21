import {deflateSync} from 'node:zlib';
import {crc32} from '../../dist/render.js';
export function pngFixture() {
  const chunk = (kind, data) => {
    const bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    bytes.write(kind, 4);
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(800);
  header.writeUInt32BE(800, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(801 * 800))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

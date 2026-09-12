import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, isMaskable = false) {
  // RGBA buffer with filter byte per scanline
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * (isMaskable ? 0.38 : 0.44);
  const ringInner = r * 0.72;
  const ringOuter = r * 0.88;
  const dotR = r * 0.22;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (isMaskable) {
        // Solid dark background for maskable
        let red = 9;
        let green = 13;
        let blue = 22;

        if (dist <= dotR) {
          // Center glowing cyan dot
          red = 6; green = 182; blue = 212;
        } else if (dist >= ringInner && dist <= ringOuter) {
          // Cyan/indigo radar ring
          red = 59; green = 130; blue = 246;
        } else if (dist <= r && Math.abs(dx) <= 2) {
          // Crosshair vertical
          red = 14; green = 165; blue = 233;
        } else if (dist <= r && Math.abs(dy) <= 2) {
          // Crosshair horizontal
          red = 14; green = 165; blue = 233;
        }

        rawData[pxOffset] = red;
        rawData[pxOffset + 1] = green;
        rawData[pxOffset + 2] = blue;
        rawData[pxOffset + 3] = 255;
      } else {
        // Rounded badge on transparent background
        const cornerR = width * 0.22;
        // Check rounded rect distance
        const qx = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
        const qy = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
        const outsideDist = Math.sqrt(qx * qx + qy * qy);

        if (outsideDist > cornerR) {
          // Transparent
          rawData[pxOffset] = 0;
          rawData[pxOffset + 1] = 0;
          rawData[pxOffset + 2] = 0;
          rawData[pxOffset + 3] = 0;
        } else {
          let red = 10;
          let green = 15;
          let blue = 26;

          if (dist <= dotR) {
            red = 6; green = 182; blue = 212; // Cyan center
          } else if (dist >= ringInner && dist <= ringOuter) {
            red = 56; green = 189; blue = 248; // Outer radar ring
          } else if (dist <= r * 0.95 && Math.abs(dx) <= (width > 200 ? 3 : 2)) {
            red = 99; green = 102; blue = 241; // Crosshair
          } else if (dist <= r * 0.95 && Math.abs(dy) <= (width > 200 ? 3 : 2)) {
            red = 99; green = 102; blue = 241; // Crosshair
          }

          rawData[pxOffset] = red;
          rawData[pxOffset + 1] = green;
          rawData[pxOffset + 2] = blue;
          rawData[pxOffset + 3] = 255;
        }
      }
    }
  }

  // PNG chunks helper
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body), 0);

    return Buffer.concat([len, body, crcBuf]);
  }

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));

console.log('Successfully generated PWA PNG icons in /public');

/**
 * Web Bluetooth ESC/POS Direct Thermal Printer Utility
 * Supports 58mm Bluetooth thermal printers (including Bluepos, POS-58, MPT, etc.)
 *
 * The QR is drawn by the printer itself (GS ( k), so only the SKU text goes over
 * Bluetooth instead of a ~14KB bitmap. A large bitmap arrives slower than the head
 * prints, which makes the printer stop halfway and resume.
 * SKU and name are still rastered so any script (e.g. Amharic) prints with the
 * same fonts as the cable/system print.
 */

const CSS_DPI = 96;
const PAGE_WIDTH_MM = 58;
const HEAD_WIDTH = 384;
const DOTS_PER_MM = HEAD_WIDTH / PAGE_WIDTH_MM;

const mm = (value) => Math.round(value * DOTS_PER_MM);
const cssPx = (px) => mm((px / CSS_DPI) * 25.4);

// Printer QR module size in dots. 9 keeps a 21-module SKU code near the old raster size.
const QR_MODULE_DOTS = 9;

// Lines fed after the label so the name clears the tear bar above the print head.
const TEAR_FEED_LINES = 3;

const LABEL_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

function wrapText(ctx, text, maxWidth, breakAll) {
  const source = String(text || '');
  if (!source) return [''];

  const pushChars = (value, startLine) => {
    const lines = [];
    let line = startLine || '';
    for (const ch of value) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      } else {
        line = next;
      }
    }
    return { lines, line };
  };

  if (breakAll) {
    const { lines, line } = pushChars(source, '');
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  const lines = [];
  let line = '';
  for (const word of source.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width > maxWidth) {
      const broken = pushChars(word, '');
      lines.push(...broken.lines);
      line = broken.line;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function canvasToRaster(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const widthBytes = Math.ceil(width / 8);
  const data = ctx.getImageData(0, 0, width, height).data;

  const xL = widthBytes % 256;
  const xH = Math.floor(widthBytes / 256);
  const yL = height % 256;
  const yH = Math.floor(height / 256);
  const rasterBytes = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < widthBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = x * 8 + bit;
        if (pixelX >= width) continue;
        const idx = (y * width + pixelX) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (gray < 160) byte |= (1 << (7 - bit));
      }
      rasterBytes.push(byte);
    }
  }
  return rasterBytes;
}

function nativeQrCommands(text) {
  const data = new TextEncoder().encode(text);
  const storeLen = data.length + 3;
  return [
    0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,                 // model 2
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, QR_MODULE_DOTS,             // module size
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31,                       // error correction M
    0x1D, 0x28, 0x6B, storeLen % 256, Math.floor(storeLen / 256), 0x31, 0x50, 0x30, ...data,
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30,                       // print stored QR
  ];
}

function textBlockRaster({ sku, name }) {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas 2D context not available');

  const skuSize = cssPx(13);
  const nameSize = cssPx(11);
  const skuLineH = Math.round(skuSize * 1.2);
  const nameLineH = Math.round(nameSize * 1.2);

  measure.font = `800 ${skuSize}px ${LABEL_FONT}`;
  const skuLines = wrapText(measure, sku, HEAD_WIDTH, true);
  measure.font = `600 ${nameSize}px ${LABEL_FONT}`;
  const nameLines = wrapText(measure, name, HEAD_WIDTH, false);

  const gapAfterQr = 6;
  const beforeName = cssPx(1);
  const height = gapAfterQr + (skuLines.length * skuLineH) + beforeName + (nameLines.length * nameLineH);

  const canvas = document.createElement('canvas');
  canvas.width = HEAD_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, HEAD_WIDTH, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#000000';
  ctx.font = `800 ${skuSize}px ${LABEL_FONT}`;
  let y = gapAfterQr;
  for (const line of skuLines) {
    ctx.fillText(line, HEAD_WIDTH / 2, y);
    y += skuLineH;
  }

  y += beforeName;
  ctx.fillStyle = '#222222';
  ctx.font = `600 ${nameSize}px ${LABEL_FONT}`;
  for (const line of nameLines) {
    ctx.fillText(line, HEAD_WIDTH / 2, y);
    y += nameLineH;
  }

  return canvasToRaster(canvas);
}

/**
 * Builds the full 58mm tag: printer-drawn QR at the top, then SKU and name.
 */
export function labelToEscPos({ sku, name }) {
  return [
    0x1B, 0x40,             // initialize
    0x1B, 0x61, 0x01,       // center
    ...nativeQrCommands(sku),
    ...textBlockRaster({ sku, name }),
    0x1B, 0x64, TEAR_FEED_LINES,
  ];
}

async function writePrinterBytes(characteristic, bytes) {
  const write = characteristic.properties.writeWithoutResponse
    ? (chunk) => characteristic.writeValueWithoutResponse(chunk)
    : (chunk) => characteristic.writeValue(chunk);

  let chunkSize = 180;
  for (let offset = 0; offset < bytes.length;) {
    const end = Math.min(offset + chunkSize, bytes.length);
    try {
      await write(bytes.subarray(offset, end));
      offset = end;
    } catch (err) {
      if (chunkSize <= 20) throw err;
      chunkSize = 20;
    }
  }
}

/**
 * Connects to a Bluetooth Thermal Printer via Web Bluetooth and prints the QR label.
 * @param {Object} params
 * @param {string} params.sku - Product SKU code (encoded into the QR by the printer)
 * @param {string} params.name - Product Name
 */
export async function printQrLabelViaBluetooth({ sku, name }) {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported on this browser. Please use Chrome, Edge, or Samsung Internet on Android/PC.');
  }

  // 1. Request Bluetooth Device (supports standard BLE thermal printer GATT services)
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Bluepos / Standard Chinese BLE printer service
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard thermal printer service
      '0000ffe0-0000-1000-8000-00805f9b34fb', // Common serial BLE
      '0000ff00-0000-1000-8000-00805f9b34fb', // Alternative serial BLE
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent service
    ],
  });

  if (!device.gatt) {
    throw new Error('Bluetooth GATT server unavailable on selected device.');
  }

  // 2. Connect to GATT Server
  const server = await device.gatt.connect();

  try {
    // 3. Find writable characteristic
    let targetChar = null;
    const services = await server.getPrimaryServices();

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetChar = char;
            break;
          }
        }
      } catch {
        // service may not be accessible, continue searching
      }
      if (targetChar) break;
    }

    if (!targetChar) {
      throw new Error('No writable printing characteristic found on printer.');
    }

    // 4. Build and send the label
    await writePrinterBytes(targetChar, new Uint8Array(labelToEscPos({ sku, name })));

    return true;
  } finally {
    // Graceful disconnect after print transmission
    setTimeout(() => {
      try {
        if (device.gatt && device.gatt.connected) {
          device.gatt.disconnect();
        }
      } catch {
        // ignore
      }
    }, 1500);
  }
}

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

/**
 * Generates a valid 13-digit EAN-13 barcode with Uzbekistan GS1 prefix (478)
 */
export function generateEAN13(seed?: number): string {
  const random9 = String(seed ?? Math.floor(100000000 + Math.random() * 899999999)).slice(0, 9).padStart(9, '0');
  const base12 = `478${random9}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(base12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${base12}${checkDigit}`;
}

export function renderBarcodeToSvgString(
  code: string,
  options?: { width?: number; height?: number; fontSize?: number; displayValue?: boolean }
): string {
  if (typeof document === 'undefined') return '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const format = /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128';
  try {
    JsBarcode(svg, code, {
      format,
      width: options?.width ?? 1.6,
      height: options?.height ?? 42,
      displayValue: options?.displayValue ?? true,
      fontSize: options?.fontSize ?? 11,
      margin: 4,
      background: 'transparent',
      lineColor: '#0f172a',
    });
  } catch {
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: options?.width ?? 1.6,
      height: options?.height ?? 42,
      displayValue: options?.displayValue ?? true,
      fontSize: options?.fontSize ?? 11,
      margin: 4,
      background: 'transparent',
      lineColor: '#0f172a',
    });
  }
  return svg.outerHTML;
}

export async function generateQrDataUrl(text: string, size = 160): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch {
    return '';
  }
}

import { AppSettings, Sale, Store } from '../types/models';
import { formatDateTime, formatMoney, Language } from '../i18n';
import { generateQrDataUrl } from './barcode';
import { printHtmlDocument } from './print';
import { fiscalProvider } from '../integrations/interfaces';

export function formatUzsSpaced(amount: number): string {
  const rounded = Math.round(amount || 0);
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} UZS`;
}

export async function generateSaleQr(sale: Sale, enabled: boolean): Promise<string> {
  if (!enabled) return '';
  return generateQrDataUrl(`SHU-BREND-OMBOR:${sale.receiptNumber}:${sale.totalAmount}`);
}

export async function printSaleReceipt(params: {
  sale: Sale;
  settings: AppSettings;
  store?: Store;
  language: Language;
  methodLabels: Record<string, string>;
}) {
  const { sale, settings, store, language, methodLabels } = params;
  const widthMm = settings.receiptWidth === '58mm' ? '54mm' : '74mm';
  const qrUrl = await generateSaleQr(sale, settings.showReceiptQr);

  const headerLines = settings.receiptHeader
    .split('\n')
    .filter(Boolean)
    .map((l) => `<div class="center">${l}</div>`)
    .join('');

  const footerLines = settings.receiptFooter
    .split('\n')
    .filter(Boolean)
    .map((l) => `<div class="center">${l}</div>`)
    .join('');

  const itemRows = sale.items
    .map(
      (it) => `
      <div style="margin:4px 0;">
        <div class="bold">${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''}</div>
        <div style="display:flex;justify-content:space-between;">
          <span>${it.qty} x ${formatMoney(it.unitPrice, { lang: language })}</span>
          <span class="bold">${formatMoney(it.lineTotal, { lang: language })}</span>
        </div>
        ${it.discountAmount > 0 ? `<div style="font-size:10px;color:#444;">Chegirma: -${formatMoney(it.discountAmount, { lang: language })}</div>` : ''}
      </div>`
    )
    .join('');

  const payRows = sale.payments
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;"><span>${
          methodLabels[p.method] ?? p.method
        }</span><span>${formatMoney(p.amount, { lang: language })}</span></div>`
    )
    .join('');

  printHtmlDocument(
    `<div style="width:${widthMm};margin:0 auto;font-size:11px;">
      <div class="center bold" style="font-size:13px;margin-bottom:2px;">${settings.brandName}</div>
      ${store ? `<div class="center bold">${store.name}</div>` : ''}
      ${store?.address ? `<div class="center" style="font-size:10px;">${store.address}</div>` : ''}
      ${store?.phone ? `<div class="center" style="font-size:10px;">Tel: ${store.phone}</div>` : ''}
      ${headerLines}
      <div class="divider"></div>
      <div>Chek: <b>${sale.receiptNumber}</b></div>
      <div>Sana: ${formatDateTime(sale.paidAt || sale.createdAt, language)}</div>
      <div>Sotuvchi: ${sale.cashierName}</div>
      ${sale.customerName ? `<div>Mijoz: ${sale.customerName}</div>` : ''}
      <div class="divider"></div>
      ${itemRows}
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;">
        <span>Oraliq jami</span>
        <span>${formatMoney(sale.subtotal, { lang: language })}</span>
      </div>
      ${
        sale.checkDiscountAmount > 0
          ? `<div style="display:flex;justify-content:space-between;"><span>Chegirma</span><span>-${formatMoney(sale.checkDiscountAmount, { lang: language })}</span></div>`
          : ''
      }
      ${
        sale.loyaltyPointsSpent > 0
          ? `<div style="display:flex;justify-content:space-between;"><span>Keshbek</span><span>-${formatMoney(sale.loyaltyPointsSpent, { lang: language })}</span></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:4px;" class="bold">
        <span>JAMI</span>
        <span>${formatMoney(sale.totalAmount, { lang: language })}</span>
      </div>
      <div class="divider"></div>
      ${payRows}
      ${
        sale.cashGiven && sale.cashGiven > 0
          ? `<div style="display:flex;justify-content:space-between;"><span>Berilgan summa</span><span>${formatMoney(sale.cashGiven, { lang: language })}</span></div>`
          : ''
      }
      ${
        sale.changeAmount && sale.changeAmount > 0
          ? `<div style="display:flex;justify-content:space-between;" class="bold"><span>Qaytim</span><span>${formatMoney(sale.changeAmount, { lang: language })}</span></div>`
          : ''
      }
      <div class="divider"></div>
      <div class="center" style="font-size:10px;color:#555;margin:4px 0;">${fiscalProvider.name}: Ulanmagan</div>
      ${qrUrl ? `<div class="center" style="margin:6px 0;"><img src="${qrUrl}" style="width:92px;height:92px;" /></div>` : ''}
      ${footerLines}
    </div>`,
    `Chek ${sale.receiptNumber}`,
    settings.receiptWidth
  );
}

export function buildSaleShareText(params: {
  sale: Sale;
  brandName: string;
  store?: Store;
  language: Language;
}): string {
  const { sale, brandName, store, language } = params;
  const lines = [
    `${brandName}${store ? ` — ${store.name}` : ''}`,
    `Chek: ${sale.receiptNumber}`,
    `Sana: ${formatDateTime(sale.paidAt || sale.createdAt, language)}`,
    '---',
    ...sale.items.map(
      (it) => `${it.productName} x${it.qty} = ${formatUzsSpaced(it.lineTotal)}`
    ),
    '---',
    `JAMI: ${formatUzsSpaced(sale.totalAmount)}`,
    'Xaridingiz uchun rahmat!',
  ];
  return lines.join('\n');
}

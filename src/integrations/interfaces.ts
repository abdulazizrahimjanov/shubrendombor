/**
 * Integration-ready provider interfaces with clearly marked mock/placeholder adapters.
 * Real production credentials (OFD/Online-NKM, Click/Payme/Uzum, Eskiz SMS, Telegram Bot)
 * should be wired via backend API routes before enabling live mode.
 */

export interface FiscalReceiptRequest {
  saleId: string;
  receiptNumber: string;
  items: {
    name: string;
    qty: number;
    price: number;
    vatRate: number;
    ikpuCode?: string;
  }[];
  totalAmount: number;
  cashAmount: number;
  cardAmount: number;
}

export interface FiscalReceiptResult {
  status: 'not_configured' | 'queued' | 'error';
  message: string;
  isMock: true;
  // Intentionally omits fake fiscal signs or OFD QR codes
}

export interface IFiscalProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  fiscalizeSale(req: FiscalReceiptRequest): Promise<FiscalReceiptResult>;
}

export class PlaceholderFiscalProvider implements IFiscalProvider {
  readonly name = 'Online-NKM / OFD (Integration Ready)';
  readonly isConfigured = false;

  async fiscalizeSale(_req: FiscalReceiptRequest): Promise<FiscalReceiptResult> {
    return {
      status: 'not_configured',
      message: 'Fiskal modul ulanmagan (Sozlamalar -> Integratsiyalar orqali ulang).',
      isMock: true,
    };
  }
}

export interface BroadcastRequest {
  channel: 'sms' | 'telegram';
  recipients: { name: string; phone: string }[];
  message: string;
}

export interface BroadcastResult {
  accepted: boolean;
  queuedCount: number;
  isMock: true;
  note: string;
}

export interface INotificationProvider {
  sendBroadcast(req: BroadcastRequest): Promise<BroadcastResult>;
}

export class PlaceholderNotificationProvider implements INotificationProvider {
  async sendBroadcast(req: BroadcastRequest): Promise<BroadcastResult> {
    // TODO: Connect Eskiz.uz SMS API or Telegram Bot API via server-side route
    return {
      accepted: true,
      queuedCount: req.recipients.length,
      isMock: true,
      note:
        req.channel === 'sms'
          ? `SMS shlyuz ulanmagan (namuna rejimi): ${req.recipients.length} ta raqam tayyorlandi.`
          : `Telegram bot ulanmagan (namuna rejimi): ${req.recipients.length} ta mijoz tayyorlandi.`,
    };
  }
}

export interface OnlinePaymentLinkRequest {
  orderId: string;
  amount: number;
  provider: 'click' | 'payme' | 'uzum';
}

export interface OnlinePaymentLinkResult {
  configured: boolean;
  checkoutUrl: string | null;
  isMock: true;
  note: string;
}

export interface IPaymentGateway {
  createPaymentLink(req: OnlinePaymentLinkRequest): Promise<OnlinePaymentLinkResult>;
}

export class PlaceholderPaymentGateway implements IPaymentGateway {
  async createPaymentLink(req: OnlinePaymentLinkRequest): Promise<OnlinePaymentLinkResult> {
    // TODO: Wire Click/Payme/Uzum merchant keys on backend
    return {
      configured: false,
      checkoutUrl: null,
      isMock: true,
      note: `${req.provider.toUpperCase()} savdogar kalitlari kiritilmagan (namuna interfeysi).`,
    };
  }
}

export const fiscalProvider = new PlaceholderFiscalProvider();
export const notificationProvider = new PlaceholderNotificationProvider();
export const paymentGateway = new PlaceholderPaymentGateway();

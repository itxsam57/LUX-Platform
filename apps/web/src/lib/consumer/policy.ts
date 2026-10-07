export type SavedItem = {
  type: "profile" | "demand" | "campaign" | "release";
  publicId: string;
  title: string;
  subtitle: string;
  path: string;
  createdAt: string;
};

export type MessageThreadSummary = {
  publicId: string;
  otherHandle: string;
  otherDisplayName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  path: string;
};

export type MessageThread = {
  publicId: string;
  otherHandle: string;
  otherDisplayName: string;
  messages: Array<{
    publicId: string;
    sender: string;
    mine: boolean;
    body: string;
    createdAt: string;
  }>;
};

export type ConsumerOrder = {
  publicId: string;
  fundingPublicId: string;
  campaignPublicId: string;
  projectPublicId: string;
  title: string;
  tierTitle: string | null;
  state: "authorized" | "captured" | "partially_refunded" | "refunded" | "failed";
  requestedMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  fundingPath: string;
};

export type WalletEntry = {
  publicId: string;
  orderPublicId: string;
  fundingPublicId: string;
  title: string;
  entryType: "authorization" | "purchase" | "refund" | "payment_failed";
  direction: "hold" | "debit" | "credit" | "none";
  amountMinor: number;
  currency: string;
  createdAt: string;
};

const THREAD_ID = /^mth[0-9a-f]{24}$/;
const MESSAGE_ID = /^msg[0-9a-f]{24}$/;
const ORDER_ID = /^ord[0-9a-f]{24}$/;
const WALLET_ID = /^wlt[0-9a-f]{24}$/;
const FUNDING_ID = /^fnd[0-9a-f]{24}$/;
const CAMPAIGN_ID = /^cmp[0-9a-f]{24}$/;
const PROJECT_ID = /^prj[0-9a-f]{24}$/;
const HANDLE = /^[a-z0-9_]{3,30}$/;
const PATH = /^\/(?!\/)[^\\\u0000-\u001f\u007f]{0,511}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max && !CONTROL.test(value)
    ? value.trim()
    : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function minor(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function list<T>(value: unknown, parser: (value: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== null) ? parsed : [];
}

export function parseMessageHandle(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^@/,"");
  return HANDLE.test(normalized) ? normalized : null;
}

export function parseMessageBody(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 4000 && !CONTROL.test(normalized) ? normalized : null;
}

export function parseMessageThreadId(value: unknown) {
  return typeof value === "string" && THREAD_ID.test(value.trim()) ? value.trim() : null;
}

export function parseSavedItems(value: unknown): SavedItem[] {
  return list(value, (entry) => {
    const row = record(entry);
    if (!row) return null;
    const type = row.type === "profile" || row.type === "demand" || row.type === "campaign" || row.type === "release"
      ? row.type
      : null;
    const publicId = text(row.publicId,3,120);
    const title = text(row.title,1,180);
    const subtitle = typeof row.subtitle === "string" && row.subtitle.length <= 2000 && !CONTROL.test(row.subtitle)
      ? row.subtitle
      : null;
    const path = typeof row.path === "string" && PATH.test(row.path) ? row.path : null;
    const createdAt = timestamp(row.createdAt);
    return type && publicId && title && subtitle !== null && path && createdAt
      ? { type, publicId, title, subtitle, path, createdAt }
      : null;
  });
}

export function parseMessageThreadSummaries(value: unknown): MessageThreadSummary[] {
  return list(value, (entry) => {
    const row = record(entry);
    if (!row) return null;
    const publicId = typeof row.publicId === "string" && THREAD_ID.test(row.publicId) ? row.publicId : null;
    const otherHandle = typeof row.otherHandle === "string" && HANDLE.test(row.otherHandle) ? row.otherHandle : null;
    const otherDisplayName = text(row.otherDisplayName,1,80);
    const lastMessage = row.lastMessage === null ? null : text(row.lastMessage,1,4000);
    const lastMessageAt = row.lastMessageAt === null ? null : timestamp(row.lastMessageAt);
    const unreadCount = minor(row.unreadCount);
    const path = typeof row.path === "string" && PATH.test(row.path) ? row.path : null;
    return publicId && otherHandle && otherDisplayName && unreadCount !== null && path
      && (row.lastMessage === null || lastMessage) && (row.lastMessageAt === null || lastMessageAt)
      ? { publicId, otherHandle, otherDisplayName, lastMessage, lastMessageAt, unreadCount, path }
      : null;
  });
}

export function parseMessageThread(value: unknown): MessageThread | null {
  const row = record(value);
  if (!row) return null;
  const publicId = typeof row.publicId === "string" && THREAD_ID.test(row.publicId) ? row.publicId : null;
  const otherHandle = typeof row.otherHandle === "string" && HANDLE.test(row.otherHandle) ? row.otherHandle : null;
  const otherDisplayName = text(row.otherDisplayName,1,80);
  const messages = list(row.messages, (entry) => {
    const item = record(entry);
    if (!item) return null;
    const messagePublicId = typeof item.publicId === "string" && MESSAGE_ID.test(item.publicId) ? item.publicId : null;
    const sender = text(item.sender,2,32);
    const body = text(item.body,1,4000);
    const createdAt = timestamp(item.createdAt);
    return messagePublicId && sender && typeof item.mine === "boolean" && body && createdAt
      ? { publicId: messagePublicId, sender, mine: item.mine, body, createdAt }
      : null;
  });
  return publicId && otherHandle && otherDisplayName
    ? { publicId, otherHandle, otherDisplayName, messages }
    : null;
}

export function parseOrders(value: unknown): ConsumerOrder[] {
  const states = new Set<ConsumerOrder["state"]>(["authorized","captured","partially_refunded","refunded","failed"]);
  return list(value, (entry) => {
    const row = record(entry);
    if (!row) return null;
    const publicId = typeof row.publicId === "string" && ORDER_ID.test(row.publicId) ? row.publicId : null;
    const fundingPublicId = typeof row.fundingPublicId === "string" && FUNDING_ID.test(row.fundingPublicId) ? row.fundingPublicId : null;
    const campaignPublicId = typeof row.campaignPublicId === "string" && CAMPAIGN_ID.test(row.campaignPublicId) ? row.campaignPublicId : null;
    const projectPublicId = typeof row.projectPublicId === "string" && PROJECT_ID.test(row.projectPublicId) ? row.projectPublicId : null;
    const title = text(row.title,2,180);
    const tierTitle = row.tierTitle === null ? null : text(row.tierTitle,2,120);
    const state = typeof row.state === "string" && states.has(row.state as ConsumerOrder["state"]) ? row.state as ConsumerOrder["state"] : null;
    const requestedMinor = minor(row.requestedMinor), capturedMinor = minor(row.capturedMinor), refundedMinor = minor(row.refundedMinor);
    const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
    const createdAt = timestamp(row.createdAt), updatedAt = timestamp(row.updatedAt);
    const fundingPath = typeof row.fundingPath === "string" && PATH.test(row.fundingPath) ? row.fundingPath : null;
    return publicId && fundingPublicId && campaignPublicId && projectPublicId && title
      && (row.tierTitle === null || tierTitle) && state
      && requestedMinor !== null && capturedMinor !== null && refundedMinor !== null
      && currency && createdAt && updatedAt && fundingPath
      ? { publicId, fundingPublicId, campaignPublicId, projectPublicId, title, tierTitle, state, requestedMinor, capturedMinor, refundedMinor, currency, createdAt, updatedAt, fundingPath }
      : null;
  });
}

export function parseWalletEntries(value: unknown): WalletEntry[] {
  const entryTypes = new Set<WalletEntry["entryType"]>(["authorization","purchase","refund","payment_failed"]);
  const directions = new Set<WalletEntry["direction"]>(["hold","debit","credit","none"]);
  return list(value, (entry) => {
    const row = record(entry);
    if (!row) return null;
    const publicId = typeof row.publicId === "string" && WALLET_ID.test(row.publicId) ? row.publicId : null;
    const orderPublicId = typeof row.orderPublicId === "string" && ORDER_ID.test(row.orderPublicId) ? row.orderPublicId : null;
    const fundingPublicId = typeof row.fundingPublicId === "string" && FUNDING_ID.test(row.fundingPublicId) ? row.fundingPublicId : null;
    const title = text(row.title,2,180);
    const entryType = typeof row.entryType === "string" && entryTypes.has(row.entryType as WalletEntry["entryType"]) ? row.entryType as WalletEntry["entryType"] : null;
    const direction = typeof row.direction === "string" && directions.has(row.direction as WalletEntry["direction"]) ? row.direction as WalletEntry["direction"] : null;
    const amountMinor = minor(row.amountMinor);
    const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null;
    const createdAt = timestamp(row.createdAt);
    return publicId && orderPublicId && fundingPublicId && title && entryType && direction && amountMinor !== null && currency && createdAt
      ? { publicId, orderPublicId, fundingPublicId, title, entryType, direction, amountMinor, currency, createdAt }
      : null;
  });
}

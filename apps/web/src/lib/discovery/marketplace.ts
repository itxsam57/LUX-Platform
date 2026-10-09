export type MarketplaceDiscoveryItem = {
  type: "profile" | "demand" | "campaign" | "release";
  publicId: string;
  title: string;
  subtitle: string;
  path: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

const TYPES = new Set<MarketplaceDiscoveryItem["type"]>(["profile","demand","campaign","release"]);
const CONTROL = /[\u0000-\u001f\u007f]/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseMarketplaceFilter(value: unknown): "all" | MarketplaceDiscoveryItem["type"] {
  return value === "profile" || value === "demand" || value === "campaign" || value === "release" ? value : "all";
}

export function parseMarketplaceItems(value: unknown): MarketplaceDiscoveryItem[] {
  if (!Array.isArray(value)) return [];
  const parsed = value.map((entry) => {
    const row = object(entry);
    if (!row) return null;
    const type = typeof row.type === "string" && TYPES.has(row.type as MarketplaceDiscoveryItem["type"]) ? row.type as MarketplaceDiscoveryItem["type"] : null;
    const publicId = typeof row.publicId === "string" && row.publicId.length >= 3 && row.publicId.length <= 120 && !CONTROL.test(row.publicId) ? row.publicId : null;
    const title = typeof row.title === "string" && row.title.trim().length >= 1 && row.title.length <= 180 && !CONTROL.test(row.title) ? row.title.trim() : null;
    const subtitle = typeof row.subtitle === "string" && row.subtitle.length <= 2000 && !CONTROL.test(row.subtitle) ? row.subtitle : null;
    const path = typeof row.path === "string" && /^\/(?!\/)[^\\\u0000-\u001f\u007f]{1,511}$/.test(row.path) ? row.path : null;
    const createdAt = typeof row.createdAt === "string" && !Number.isNaN(Date.parse(row.createdAt)) ? row.createdAt : null;
    const meta = object(row.meta);
    return type && publicId && title && subtitle !== null && path && createdAt && meta
      ? { type,publicId,title,subtitle,path,createdAt,meta }
      : null;
  });
  return parsed.every((item): item is MarketplaceDiscoveryItem => item !== null) ? parsed : [];
}

export function marketplaceCursor(items: MarketplaceDiscoveryItem[]) {
  return items.length ? items[items.length - 1]?.createdAt ?? null : null;
}

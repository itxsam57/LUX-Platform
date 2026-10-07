export type AvailabilityView = {
  status: "available" | "limited" | "unavailable";
  nextAvailableAt: string | null;
  note: string | null;
  updatedAt?: string;
};

export type CreatorOfferView = {
  publicId: string;
  title: string;
  description: string;
  category: string;
  roleName: string;
  startingMinor: number | null;
  currency: string | null;
  state?: "active" | "paused" | "archived";
  createdAt?: string;
  updatedAt?: string;
};

export type CreatorCommerceView = {
  role?: "creator" | "performer";
  availability: AvailabilityView | null;
  offers: CreatorOfferView[];
};

const CONTROL = /[\u0000-\u001f\u007f]/;
const OFFER_ID = /^off[0-9a-f]{24}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max && !CONTROL.test(value)
    ? value.trim()
    : null;
}

function timestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseAvailability(value: unknown): AvailabilityView | null {
  if (value === null || value === undefined) return null;
  const row = object(value);
  if (!row || (row.status !== "available" && row.status !== "limited" && row.status !== "unavailable")) return null;
  const nextAvailableAt = row.nextAvailableAt === null ? null : timestamp(row.nextAvailableAt);
  const note = row.note === null ? null : text(row.note,3,500);
  const updatedAt = row.updatedAt === undefined ? undefined : timestamp(row.updatedAt);
  if ((row.nextAvailableAt !== null && !nextAvailableAt) || (row.note !== null && !note) || (row.updatedAt !== undefined && !updatedAt)) return null;
  return { status: row.status, nextAvailableAt, note, ...(updatedAt ? { updatedAt } : {}) };
}

function parseOffer(value: unknown): CreatorOfferView | null {
  const row = object(value);
  if (!row) return null;
  const publicId = typeof row.publicId === "string" && OFFER_ID.test(row.publicId) ? row.publicId : null;
  const title = text(row.title,3,120);
  const description = text(row.description,20,2000);
  const category = typeof row.category === "string" && /^[a-z0-9][a-z0-9_-]{1,47}$/.test(row.category) ? row.category : null;
  const roleName = typeof row.roleName === "string" && /^[a-z0-9][a-z0-9 _-]{1,63}$/.test(row.roleName) ? row.roleName : null;
  const startingMinor = row.startingMinor === null
    ? null
    : typeof row.startingMinor === "number" && Number.isSafeInteger(row.startingMinor) && row.startingMinor >= 0
      ? row.startingMinor
      : undefined;
  const currency = row.currency === null ? null : typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : undefined;
  const state = row.state === undefined ? undefined : row.state === "active" || row.state === "paused" || row.state === "archived" ? row.state : null;
  const createdAt = row.createdAt === undefined ? undefined : timestamp(row.createdAt);
  const updatedAt = row.updatedAt === undefined ? undefined : timestamp(row.updatedAt);
  if (!publicId || !title || !description || !category || !roleName || startingMinor === undefined || currency === undefined
    || (row.state !== undefined && !state) || (row.createdAt !== undefined && !createdAt) || (row.updatedAt !== undefined && !updatedAt)) return null;
  return {
    publicId,title,description,category,roleName,startingMinor,currency,
    ...(state ? { state } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function parseCreatorCommerce(value: unknown): CreatorCommerceView | null {
  const row = object(value);
  if (!row || !Array.isArray(row.offers)) return null;
  const role = row.role === undefined ? undefined : row.role === "creator" || row.role === "performer" ? row.role : null;
  if (row.role !== undefined && !role) return null;
  const availability = parseAvailability(row.availability);
  if (row.availability !== null && !availability) return null;
  const offers = row.offers.map(parseOffer);
  if (!offers.every((offer): offer is CreatorOfferView => offer !== null)) return null;
  return { ...(role ? { role } : {}), availability, offers };
}

export function parseAvailabilityInput(input: { status: unknown; nextAvailableAt: unknown; note: unknown }) {
  const status = input.status === "available" || input.status === "limited" || input.status === "unavailable" ? input.status : null;
  const nextAvailableAt = typeof input.nextAvailableAt === "string" && input.nextAvailableAt.trim()
    ? new Date(input.nextAvailableAt).toISOString()
    : null;
  const note = typeof input.note === "string" && input.note.trim() ? text(input.note,3,500) : null;
  if (!status || (typeof input.note === "string" && input.note.trim() && !note)) throw new Error("invalid_availability");
  return { status, nextAvailableAt, note };
}

export function parseOfferInput(input: Record<string, unknown>) {
  const title = text(input.title,3,120);
  const description = text(input.description,20,2000);
  const category = typeof input.category === "string" ? input.category.trim().toLowerCase() : "";
  const roleName = typeof input.roleName === "string" ? input.roleName.trim().toLowerCase() : "";
  const rawMinor = input.startingMinor;
  const rawCurrency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  const hasPrice = rawMinor !== "" && rawMinor !== null && rawMinor !== undefined || rawCurrency !== "";
  const startingMinor = hasPrice ? Number(rawMinor) : null;
  const currency = hasPrice ? rawCurrency : null;
  if (!title || !description || !/^[a-z0-9][a-z0-9_-]{1,47}$/.test(category)
    || !/^[a-z0-9][a-z0-9 _-]{1,63}$/.test(roleName)
    || (hasPrice && (!Number.isSafeInteger(startingMinor) || (startingMinor as number) < 0 || !currency || !/^[A-Z]{3}$/.test(currency)))) {
    throw new Error("invalid_creator_offer");
  }
  return { title,description,category,roleName,startingMinor,currency };
}

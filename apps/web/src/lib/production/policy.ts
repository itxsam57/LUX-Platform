export type ProductionTaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type ProductionStatus = "planned" | "active" | "delayed" | "at_risk" | "complete";
export type ProductionUpdateKind = "progress" | "delay" | "risk";
export type ProductionUpdateState = "draft" | "approved" | "published";
export type ProductionApprovalState = "approved" | "rejected";
export type ProductionAssetKind = "script" | "media" | "evidence";

export type ProductionWorkspaceRecord = {
  projectPublicId: string;
  title: string;
  projectState: string;
  isOwner: boolean;
  status: ProductionStatus;
  revisedEstimate: string | null;
  milestones: Array<{
    publicId: string;
    title: string;
    dueAt: string | null;
    status: ProductionTaskStatus;
    updatedAt: string;
  }>;
  tasks: Array<{
    publicId: string;
    title: string;
    roleName: string;
    status: ProductionTaskStatus;
    assignedToMe: boolean;
    milestonePublicId: string | null;
    updatedAt: string;
  }>;
  assets: Array<{
    publicId: string;
    kind: ProductionAssetKind;
    sha256: string;
    createdAt: string;
  }>;
  updates: Array<{
    publicId: string;
    kind: ProductionUpdateKind;
    state: ProductionUpdateState;
    body: string;
    revisedEstimate: string | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
  approvals: Array<{
    targetPublicId: string;
    state: ProductionApprovalState;
    note: string | null;
    isMine: boolean;
    updatedAt: string;
  }>;
};

const taskStatuses = new Set<ProductionTaskStatus>(["todo", "in_progress", "blocked", "done"]);
const productionStatuses = new Set<ProductionStatus>(["planned", "active", "delayed", "at_risk", "complete"]);
const updateKinds = new Set<ProductionUpdateKind>(["progress", "delay", "risk"]);
const updateStates = new Set<ProductionUpdateState>(["draft", "approved", "published"]);
const assetKinds = new Set<ProductionAssetKind>(["script", "media", "evidence"]);
const approvalStates = new Set<ProductionApprovalState>(["approved", "rejected"]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function nullableTimestamp(value: unknown): string | null | undefined {
  return value === null || value === undefined ? null : timestamp(value) ?? undefined;
}

export function parseOptionalIsoDate(value: string): string | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function opaqueId(value: unknown, prefix: string): string | null {
  return typeof value === "string" && new RegExp(`^${prefix}[0-9a-f]{24}$`).test(value) ? value : null;
}

function parseList<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parser);
  return parsed.every((item): item is T => item !== null) ? parsed : null;
}

export function parseProductionWorkspace(value: unknown): ProductionWorkspaceRecord | null {
  const row = object(value);
  if (!row) return null;
  const projectPublicId = opaqueId(row.projectPublicId, "prj");
  const title = text(row.title, 180);
  const projectState = text(row.projectState, 64);
  const status = typeof row.status === "string" && productionStatuses.has(row.status as ProductionStatus)
    ? row.status as ProductionStatus
    : null;
  const revisedEstimate = nullableTimestamp(row.revisedEstimate);
  if (!projectPublicId || !title || !projectState || typeof row.isOwner !== "boolean" || !status || revisedEstimate === undefined) return null;

  const milestones = parseList(row.milestones, (value) => {
    const item = object(value); if (!item) return null;
    const publicId = opaqueId(item.publicId, "mil"); const itemTitle = text(item.title, 160);
    const dueAt = nullableTimestamp(item.dueAt); const updatedAt = timestamp(item.updatedAt);
    const itemStatus = typeof item.status === "string" && taskStatuses.has(item.status as ProductionTaskStatus) ? item.status as ProductionTaskStatus : null;
    return publicId && itemTitle && dueAt !== undefined && updatedAt && itemStatus ? { publicId, title: itemTitle, dueAt, status: itemStatus, updatedAt } : null;
  });
  const tasks = parseList(row.tasks, (value) => {
    const item = object(value); if (!item) return null;
    const publicId = opaqueId(item.publicId, "tsk"); const itemTitle = text(item.title, 200); const roleName = text(item.roleName, 64);
    const milestonePublicId = item.milestonePublicId === null || item.milestonePublicId === undefined ? null : opaqueId(item.milestonePublicId, "mil");
    const updatedAt = timestamp(item.updatedAt); const itemStatus = typeof item.status === "string" && taskStatuses.has(item.status as ProductionTaskStatus) ? item.status as ProductionTaskStatus : null;
    return publicId && itemTitle && roleName && milestonePublicId !== undefined && updatedAt && itemStatus && typeof item.assignedToMe === "boolean"
      ? { publicId, title: itemTitle, roleName, status: itemStatus, assignedToMe: item.assignedToMe, milestonePublicId, updatedAt }
      : null;
  });
  const assets = parseList(row.assets, (value) => {
    const item = object(value); if (!item) return null;
    const publicId = opaqueId(item.publicId, "ast"); const createdAt = timestamp(item.createdAt);
    const kind = typeof item.kind === "string" && assetKinds.has(item.kind as ProductionAssetKind) ? item.kind as ProductionAssetKind : null;
    const sha256 = typeof item.sha256 === "string" && /^[0-9a-f]{64}$/.test(item.sha256) ? item.sha256 : null;
    return publicId && createdAt && kind && sha256 ? { publicId, kind, sha256, createdAt } : null;
  });
  const updates = parseList(row.updates, (value) => {
    const item = object(value); if (!item) return null;
    const publicId = opaqueId(item.publicId, "upd"); const body = text(item.body, 4000); const createdAt = timestamp(item.createdAt);
    const revised = nullableTimestamp(item.revisedEstimate); const publishedAt = nullableTimestamp(item.publishedAt);
    const kind = typeof item.kind === "string" && updateKinds.has(item.kind as ProductionUpdateKind) ? item.kind as ProductionUpdateKind : null;
    const state = typeof item.state === "string" && updateStates.has(item.state as ProductionUpdateState) ? item.state as ProductionUpdateState : null;
    return publicId && body && createdAt && revised !== undefined && publishedAt !== undefined && kind && state
      ? { publicId, kind, state, body, revisedEstimate: revised, createdAt, publishedAt }
      : null;
  });
  const approvals = row.approvals === undefined ? [] : parseList(row.approvals, (value) => {
    const item = object(value); if (!item) return null;
    const target = typeof item.targetPublicId === "string" && /^(mil|tsk)[0-9a-f]{24}$/.test(item.targetPublicId) ? item.targetPublicId : null;
    const state = typeof item.state === "string" && approvalStates.has(item.state as ProductionApprovalState) ? item.state as ProductionApprovalState : null;
    const note = item.note === null || item.note === undefined ? null : text(item.note, 1000);
    const updatedAt = timestamp(item.updatedAt);
    return target && state && note !== undefined && typeof item.isMine === "boolean" && updatedAt
      ? { targetPublicId: target, state, note, isMine: item.isMine, updatedAt }
      : null;
  });
  if (!milestones || !tasks || !assets || !updates || !approvals) return null;
  return { projectPublicId, title, projectState, isOwner: row.isOwner, status, revisedEstimate, milestones, tasks, assets, updates, approvals };
}

export function parseSupporterProductionUpdates(value: unknown) {
  return parseList(value, (entry) => {
    const row = object(entry); if (!row) return null;
    const publicId = opaqueId(row.publicId, "upd"); const body = text(row.body, 4000); const publishedAt = timestamp(row.publishedAt);
    const revisedEstimate = nullableTimestamp(row.revisedEstimate);
    const kind = typeof row.kind === "string" && updateKinds.has(row.kind as ProductionUpdateKind) ? row.kind as ProductionUpdateKind : null;
    return publicId && body && publishedAt && revisedEstimate !== undefined && kind ? { publicId, body, kind, revisedEstimate, publishedAt } : null;
  }) ?? [];
}

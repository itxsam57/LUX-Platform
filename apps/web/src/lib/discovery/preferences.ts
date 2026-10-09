export type DiscoveryPreferenceView = {
  interests: Array<{ slug:string; label:string; enabled:boolean }>;
  hiddenTopics: string[];
  hiddenItems: Array<{ type:"profile"|"demand"|"campaign"|"release"; publicId:string; createdAt:string }>;
};

const SLUG=/^[a-z0-9][a-z0-9_-]{1,47}$/;
const TYPES=new Set(["profile","demand","campaign","release"] as const);

export function parseDiscoveryPreferences(value: unknown): DiscoveryPreferenceView | null {
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const row=value as Record<string,unknown>;
  if (!Array.isArray(row.interests) || !Array.isArray(row.hiddenTopics) || !Array.isArray(row.hiddenItems)) return null;
  const interests=row.interests.map((entry)=>{
    if (!entry || typeof entry!=="object" || Array.isArray(entry)) return null;
    const item=entry as Record<string,unknown>;
    return typeof item.slug==="string" && SLUG.test(item.slug)
      && typeof item.label==="string" && item.label.trim().length>=2 && item.label.length<=80
      && typeof item.enabled==="boolean"
      ? {slug:item.slug,label:item.label.trim(),enabled:item.enabled}:null;
  });
  const hiddenTopics=row.hiddenTopics.filter((entry):entry is string=>typeof entry==="string"&&SLUG.test(entry));
  const hiddenItems=row.hiddenItems.map((entry)=>{
    if (!entry || typeof entry!=="object" || Array.isArray(entry)) return null;
    const item=entry as Record<string,unknown>;
    const type=typeof item.type==="string"&&TYPES.has(item.type as "profile"|"demand"|"campaign"|"release")
      ? item.type as "profile"|"demand"|"campaign"|"release":null;
    const publicId=typeof item.publicId==="string"&&item.publicId.length>=3&&item.publicId.length<=120?item.publicId:null;
    const createdAt=typeof item.createdAt==="string"&&!Number.isNaN(Date.parse(item.createdAt))?item.createdAt:null;
    return type&&publicId&&createdAt?{type,publicId,createdAt}:null;
  });
  if (interests.some((v)=>v===null) || hiddenTopics.length!==row.hiddenTopics.length || hiddenItems.some((v)=>v===null)) return null;
  return {
    interests:interests as DiscoveryPreferenceView["interests"],
    hiddenTopics,
    hiddenItems:hiddenItems as DiscoveryPreferenceView["hiddenItems"],
  };
}

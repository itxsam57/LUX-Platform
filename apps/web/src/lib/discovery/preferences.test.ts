import { describe,expect,it } from "vitest";
import { parseDiscoveryPreferences } from "./preferences";

describe("discovery preferences",()=>{
  it("parses interests, hidden topics, and exact hidden items",()=>{
    expect(parseDiscoveryPreferences({
      interests:[{slug:"performance",label:"Performance",enabled:true}],
      hiddenTopics:["editing"],
      hiddenItems:[{type:"campaign",publicId:"cmp"+"a".repeat(24),createdAt:"2026-10-07T00:00:00.000Z"}],
    })).toMatchObject({
      interests:[{slug:"performance",enabled:true}],
      hiddenTopics:["editing"],
    });
  });
  it("fails closed on malformed projections",()=>{
    expect(parseDiscoveryPreferences({interests:[{slug:"bad slug",label:"Bad",enabled:true}],hiddenTopics:[],hiddenItems:[]})).toBeNull();
  });
});

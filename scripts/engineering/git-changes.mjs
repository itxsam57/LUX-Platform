import { spawnSync } from "node:child_process";

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function validSha(value) {
  return Boolean(value && !/^0+$/.test(value));
}

function pathsFrom(result) {
  return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function withUntracked(files) {
  const untracked = pathsFrom(git(["ls-files", "--others", "--exclude-standard"]));
  return [...new Set([...files, ...untracked])];
}

export function changedFiles(explicitBase) {
  const candidates = [explicitBase, process.env.HANDOFF_BASE_SHA, process.env.GITHUB_BASE_SHA].filter(validSha);

  for (const base of candidates) {
    for (const range of [`${base}...HEAD`, `${base}..HEAD`]) {
      const result = git(["diff", "--name-only", range]);
      if (result.status === 0) return withUntracked(pathsFrom(result));
    }
  }

  const originMain = git(["rev-parse", "--verify", "origin/main"]);
  if (originMain.status === 0) {
    const base = git(["merge-base", "HEAD", "origin/main"]);
    if (base.status === 0 && base.stdout.trim() !== git(["rev-parse", "HEAD"]).stdout.trim()) {
      const result = git(["diff", "--name-only", `${base.stdout.trim()}...HEAD`]);
      if (result.status === 0) return withUntracked(pathsFrom(result));
    }
  }

  const parent = git(["rev-parse", "--verify", "HEAD^"]);
  if (parent.status === 0) {
    const result = git(["diff", "--name-only", "HEAD^", "HEAD"]);
    if (result.status === 0) return withUntracked(pathsFrom(result));
  }

  const tracked = git(["ls-files"]);
  return withUntracked(pathsFrom(tracked));
}

export function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || "unknown";
}

export function currentCommit() {
  return git(["rev-parse", "HEAD"]).stdout.trim() || "unknown";
}

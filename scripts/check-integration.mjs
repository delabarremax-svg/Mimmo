/** Inspect the PR stack and calculate merge trees. Never changes a ref or checkout. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const stack = [
  { pr: 3, sha: "dd04fefc2bfd6b196ced67f7ec864fd9101c214d" },
  { pr: 4, sha: "2e0d2cdbca9ae9898324df2a2aa75356cc3006e8" },
  { pr: 5, sha: "58e38f7c3db6f3cd853275c17e4cd80719ee0412" },
  { pr: 6, sha: git("rev-parse", "HEAD") },
];
const headBefore = git("rev-parse", "HEAD");
let previous = "0b0f4758bb56ee71b8d5fdf704c49ff2ac9d7f65";
const checks = [];
for (const item of stack) {
  git("merge-base", "--is-ancestor", previous, item.sha);
  const simulatedTree = git("merge-tree", "--write-tree", previous, item.sha);
  const expectedTree = git("rev-parse", item.sha + "^{tree}");
  if (simulatedTree !== expectedTree)
    throw new Error(`Arbre inattendu PR ${item.pr}`);
  checks.push({
    ...item,
    base: previous,
    conflictFree: true,
    tree: simulatedTree,
  });
  previous = item.sha;
}
if (git("rev-parse", "HEAD") !== headBefore) throw new Error("HEAD modifié");
mkdirSync("work", { recursive: true });
writeFileSync(
  "work/integration-check.json",
  JSON.stringify({ checks, refsChanged: false }, null, 2),
);
console.log(
  "PR 3 → 4 → 5 → 6 : ancêtres vérifiés, calcul des quatre arbres sans conflit. Aucun ref, checkout, PR ou déploiement modifié.",
);

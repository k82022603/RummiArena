import type { TableGroup } from "@/types/tile";

export function computeNewlyPlacedTiles(
  oldGroups: TableGroup[],
  newGroups: TableGroup[]
): string[] {
  const oldSet = new Set<string>();
  for (const g of oldGroups) for (const t of g.tiles) oldSet.add(t);
  const added: string[] = [];
  for (const g of newGroups) {
    for (const t of g.tiles) {
      if (!oldSet.has(t)) added.push(t);
    }
  }
  return added;
}

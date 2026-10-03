import { HoarderList } from "./hoarder-client";

/**
 * Resolves each list's full nested path (e.g. "Reading/Tech") by walking parentId chains.
 * Cycles (which shouldn't happen, but the API doesn't guarantee it) fall back to the list's own name.
 */
export function buildListPaths(lists: HoarderList[]): Map<string, string> {
  const byId = new Map(lists.map((list) => [list.id, list]));
  const paths = new Map<string, string>();

  for (const list of lists) {
    const chain = [list.name];
    const visited = new Set<string>([list.id]);
    let parentId = list.parentId;
    let hasCycle = false;

    while (parentId && byId.has(parentId)) {
      if (visited.has(parentId)) {
        hasCycle = true;
        break;
      }
      visited.add(parentId);
      const parent = byId.get(parentId)!;
      chain.unshift(parent.name);
      parentId = parent.parentId;
    }

    // On a cycle, fall back to just the list's own name rather than a
    // partial/garbled chain — the ancestor path can't be resolved.
    paths.set(list.id, hasCycle ? list.name : chain.join("/"));
  }

  return paths;
}

/**
 * Builds a bookmarkId -> list path[] map by paginating each list's bookmarks once.
 * This is far cheaper than querying list membership per-bookmark: list count is
 * typically orders of magnitude smaller than bookmark count.
 */
export async function buildBookmarkListsMap(
  lists: HoarderList[],
  getListBookmarkIds: (listId: string) => Promise<string[]>
): Promise<Map<string, string[]>> {
  const listPaths = buildListPaths(lists);

  // Fetch each list's bookmarks concurrently (lists are independent), but merge
  // afterward in list order so a bookmark's `lists` array is deterministic
  // regardless of which network request happens to finish first.
  const perList = await Promise.all(
    lists.map(async (list) => ({
      path: listPaths.get(list.id)!,
      bookmarkIds: await getListBookmarkIds(list.id),
    }))
  );

  const bookmarkLists = new Map<string, string[]>();
  for (const { path, bookmarkIds } of perList) {
    for (const bookmarkId of bookmarkIds) {
      if (!bookmarkLists.has(bookmarkId)) {
        bookmarkLists.set(bookmarkId, []);
      }
      bookmarkLists.get(bookmarkId)!.push(path);
    }
  }

  return bookmarkLists;
}

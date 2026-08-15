import { HoarderList } from "./hoarder-client";

/**
 * Resolves each list's full nested path (e.g. "Reading/Tech") by walking parentId chains.
 * Cycles (which shouldn't happen, but the API doesn't guarantee it) fall back to the list's own name.
 */
export function buildListPaths(lists: HoarderList[]): Map<string, string> {
  const byId = new Map(lists.map((list) => [list.id, list]));
  const paths = new Map<string, string>();

  function resolve(id: string, seen: Set<string>): string {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;

    const list = byId.get(id);
    if (!list) return "";

    if (seen.has(id)) return list.name;
    seen.add(id);

    const path =
      list.parentId && byId.has(list.parentId)
        ? `${resolve(list.parentId, seen)}/${list.name}`
        : list.name;

    paths.set(id, path);
    return path;
  }

  for (const list of lists) {
    resolve(list.id, new Set());
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

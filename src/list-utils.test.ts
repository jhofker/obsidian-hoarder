import { HoarderList } from "./hoarder-client";
import { buildBookmarkListsMap, buildListPaths } from "./list-utils";

function makeList(overrides: Partial<HoarderList> & { id: string; name: string }): HoarderList {
  return {
    icon: "📁",
    parentId: null,
    type: "manual",
    ...overrides,
  };
}

describe("buildListPaths", () => {
  it("returns the plain name for top-level lists", () => {
    const lists = [makeList({ id: "1", name: "Reading" })];
    expect(buildListPaths(lists)).toEqual(new Map([["1", "Reading"]]));
  });

  it("joins nested lists with a slash", () => {
    const lists = [
      makeList({ id: "1", name: "Reading" }),
      makeList({ id: "2", name: "Tech", parentId: "1" }),
      makeList({ id: "3", name: "AI", parentId: "2" }),
    ];
    const paths = buildListPaths(lists);
    expect(paths.get("1")).toBe("Reading");
    expect(paths.get("2")).toBe("Reading/Tech");
    expect(paths.get("3")).toBe("Reading/Tech/AI");
  });

  it("falls back to the list name when parentId points to a missing list", () => {
    const lists = [makeList({ id: "1", name: "Orphan", parentId: "missing" })];
    expect(buildListPaths(lists).get("1")).toBe("Orphan");
  });

  it("falls back to each list's own name on a cyclical parentId chain", () => {
    const lists = [
      makeList({ id: "1", name: "A", parentId: "2" }),
      makeList({ id: "2", name: "B", parentId: "1" }),
    ];
    const paths = buildListPaths(lists);
    expect(paths.get("1")).toBe("A");
    expect(paths.get("2")).toBe("B");
  });
});

describe("buildBookmarkListsMap", () => {
  it("maps bookmark ids to the paths of every list containing them", async () => {
    const lists = [
      makeList({ id: "1", name: "Reading" }),
      makeList({ id: "2", name: "Tech", parentId: "1" }),
    ];
    const bookmarksByList: Record<string, string[]> = {
      "1": ["bm-a", "bm-b"],
      "2": ["bm-a"],
    };

    const result = await buildBookmarkListsMap(
      lists,
      async (listId) => bookmarksByList[listId] || []
    );

    expect(result.get("bm-a")).toEqual(["Reading", "Reading/Tech"]);
    expect(result.get("bm-b")).toEqual(["Reading"]);
    expect(result.has("bm-c")).toBe(false);
  });

  it("returns an empty map when there are no lists", async () => {
    const result = await buildBookmarkListsMap([], async () => []);
    expect(result.size).toBe(0);
  });
});

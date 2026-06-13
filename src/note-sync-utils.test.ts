import { shouldPushLocalNotesToRemote } from "./note-sync-utils";

describe("shouldPushLocalNotesToRemote", () => {
  it("should not push when no local notes can be extracted", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: null,
        originalNotes: null,
        remoteNotes: "remote note",
      })
    ).toBe(false);
  });

  it("should not push empty local notes without sync history over remote notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "",
        originalNotes: null,
        remoteNotes: "remote note",
      })
    ).toBe(false);
  });

  it("should push non-empty local notes without sync history when they differ from remote notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "local note",
        originalNotes: null,
        remoteNotes: "remote note",
      })
    ).toBe(true);
  });

  it("should not push non-empty local notes without sync history when they match remote notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "same note",
        originalNotes: null,
        remoteNotes: "same note",
      })
    ).toBe(false);
  });

  it("should push local changes when they differ from original and remote notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "updated note",
        originalNotes: "original note",
        remoteNotes: "remote note",
      })
    ).toBe(true);
  });

  it("should not push when local notes match original notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "original note",
        originalNotes: "original note",
        remoteNotes: "remote note",
      })
    ).toBe(false);
  });

  it("should not push when local notes already match remote notes", () => {
    expect(
      shouldPushLocalNotesToRemote({
        currentNotes: "remote note",
        originalNotes: "original note",
        remoteNotes: "remote note",
      })
    ).toBe(false);
  });
});

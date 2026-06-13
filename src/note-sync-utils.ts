export interface NoteSyncState {
  currentNotes: string | null;
  originalNotes: string | null;
  remoteNotes: string;
}

export function shouldPushLocalNotesToRemote({
  currentNotes,
  originalNotes,
  remoteNotes,
}: NoteSyncState): boolean {
  if (currentNotes === null) {
    return false;
  }

  if (originalNotes === null) {
    return currentNotes !== "" && currentNotes !== remoteNotes;
  }

  return currentNotes !== originalNotes && currentNotes !== remoteNotes;
}

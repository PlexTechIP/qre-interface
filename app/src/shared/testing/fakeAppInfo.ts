/**
 * A deterministic `AppInfoService` for tests.
 *
 * The paths are obviously fictional on purpose: a fixture that returned a real
 * `app.getPath("userData")` would make assertions depend on whose machine the
 * suite runs on.
 */

import type {
  AppInfoService,
  RevealResult,
  StorageInfo,
  StorageLocation,
  StorageLocationId,
} from "../appInfoTypes";

export const FAKE_STORAGE_LOCATIONS: readonly StorageLocation[] = [
  { id: "runDatabase", path: "/fixture/userData/run-history.sqlite", overridden: false },
  { id: "chatDatabase", path: "/fixture/userData/chat-history.sqlite", overridden: false },
];

export interface FakeAppInfoOptions {
  locations?: readonly StorageLocation[];
  /** Resolve `reveal` as a failure, the way a missing folder really does. */
  revealResult?: RevealResult;
  /** Records which location was revealed, for assertions. */
  onReveal?: (id: StorageLocationId) => void;
}

export function fakeAppInfoService(options: FakeAppInfoOptions = {}): AppInfoService {
  return {
    async getStorage(): Promise<StorageInfo> {
      return { locations: options.locations ?? FAKE_STORAGE_LOCATIONS };
    },
    async reveal(id: StorageLocationId): Promise<RevealResult> {
      options.onReveal?.(id);
      return options.revealResult ?? { ok: true };
    },
  };
}

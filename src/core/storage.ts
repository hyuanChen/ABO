export function readJsonStorage<T>(key: string, fallback: T, storage: Storage = localStorage): T {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
    return fallback;
  }
}

export function readStringStorage(key: string, fallback = "", storage: Storage = localStorage): string {
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[storage] Failed to write JSON for ${key}`, error);
    return false;
  }
}

export function writeStringStorage(key: string, value: string, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[storage] Failed to write string for ${key}`, error);
    return false;
  }
}

export function removeStorageKey(key: string, storage: Storage = localStorage): void {
  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] Failed to remove ${key}`, error);
  }
}

/** Сохранения в IndexedDB с версионированием и резервным путём в localStorage. */

export const SAVE_VERSION = 1;
const DB_NAME = 'forest99';
const STORE = 'saves';
const LS_KEY = 'forest99.save.v1';

export interface PlacedPieceSave {
  id: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  night: number;
  bonusNights: number;
  phase: 'day' | 'night';
  phaseTime: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  stats: { health: number; hunger: number; stamina: number };
  inventory: Array<{ id: string; count: number }>;
  hotbar: Array<string | null>;
  campfire: { fuel: number; lit: boolean; x: number; z: number };
  built: PlacedPieceSave[];
  rescued: string[];
  foundNotes: string[];
  questsDone: string[];
  questProgress: Record<string, number>;
  unlockedRecipes: string[];
  gatheredTotal: number;
  playTime: number;
  storyStage: number;
}

export class SaveManager {
  private db: IDBDatabase | null = null;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.open();
  }

  private open(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async save(data: SaveData): Promise<boolean> {
    await this.ready;
    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(data, 'current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return true;
      } catch {
        /* падаем в localStorage */
      }
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<SaveData | null> {
    await this.ready;
    if (this.db) {
      try {
        const raw = await new Promise<unknown>((resolve, reject) => {
          const tx = this.db!.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get('current');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const data = this.validate(raw);
        if (data) return data;
      } catch {
        /* пробуем localStorage */
      }
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return this.validate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    await this.ready;
    if (this.db) {
      try {
        await new Promise<void>((resolve) => {
          const tx = this.db!.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete('current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        /* ignore */
      }
    }
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Проверка структуры сохранения: повреждённый файл не должен ломать игру. */
  private validate(raw: unknown): SaveData | null {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Partial<SaveData>;
    if (typeof d.version !== 'number' || typeof d.night !== 'number') return null;
    if (!d.player || typeof d.player.x !== 'number') return null;
    if (!Array.isArray(d.inventory) || !d.stats) return null;
    if (d.version > SAVE_VERSION) return null;
    return {
      ...(d as SaveData),
      built: Array.isArray(d.built) ? d.built : [],
      rescued: Array.isArray(d.rescued) ? d.rescued : [],
      foundNotes: Array.isArray(d.foundNotes) ? d.foundNotes : [],
      questsDone: Array.isArray(d.questsDone) ? d.questsDone : [],
      questProgress: d.questProgress ?? {},
      unlockedRecipes: Array.isArray(d.unlockedRecipes) ? d.unlockedRecipes : [],
      bonusNights: typeof d.bonusNights === 'number' ? d.bonusNights : 0,
      storyStage: typeof d.storyStage === 'number' ? d.storyStage : 0,
      gatheredTotal: typeof d.gatheredTotal === 'number' ? d.gatheredTotal : 0,
      playTime: typeof d.playTime === 'number' ? d.playTime : 0,
    };
  }
}

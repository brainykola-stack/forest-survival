/** Пользовательские настройки с сохранением в localStorage. */

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  musicVolume: number;
  sfxVolume: number;
  sensitivity: number;
  quality: Quality;
  renderScale: number;
  headBob: boolean;
  showFps: boolean;
  fullscreen: boolean;
  daySpeed: number;
}

const KEY = 'forest99.settings.v1';

export const DEFAULT_SETTINGS: SettingsData = {
  musicVolume: 0.55,
  sfxVolume: 0.8,
  sensitivity: 1.0,
  quality: 'medium',
  renderScale: 1.0,
  headBob: true,
  showFps: true,
  fullscreen: false,
  daySpeed: 1.0,
};

export class Settings {
  data: SettingsData = { ...DEFAULT_SETTINGS };
  private listeners: Array<(s: SettingsData) => void> = [];

  constructor() {
    this.load();
  }

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsData>) };
    } catch {
      this.data = { ...DEFAULT_SETTINGS };
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* приватный режим — молча живём без сохранения настроек */
    }
    for (const fn of this.listeners) fn(this.data);
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.save();
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.push(fn);
  }

  get qualityPreset(): {
    shadows: boolean;
    shadowSize: number;
    pixelRatio: number;
    drawDistance: number;
    grass: number;
    fogNear: number;
  } {
    const q = this.data.quality;
    if (q === 'low')
      return { shadows: false, shadowSize: 512, pixelRatio: 0.7, drawDistance: 120, grass: 0, fogNear: 20 };
    if (q === 'high')
      return { shadows: true, shadowSize: 2048, pixelRatio: 1.25, drawDistance: 260, grass: 1, fogNear: 30 };
    return { shadows: true, shadowSize: 1024, pixelRatio: 1.0, drawDistance: 180, grass: 0.5, fogNear: 24 };
  }
}

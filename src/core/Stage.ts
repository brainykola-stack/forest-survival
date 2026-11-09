import type * as THREE from 'three';
import type { Settings } from './Settings';
import type { AudioEngine } from './Audio';
import type { InputManager } from './InputManager';
import type { SaveManager, SaveData } from './SaveManager';
import type { HUD } from '../ui/HUD';
import type { Screens } from '../ui/Screens';
import type { PlayerClass } from '../player/Classes';

/** Один игровой экран: меню, лобби или лес. */
export interface Stage {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update(dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
  onPointerLock?(locked: boolean): void;
}

/** То, что доступно экранам от ядра игры. */
export interface GameHandle {
  settings: Settings;
  audio: AudioEngine;
  input: InputManager;
  save: SaveManager;
  hud: HUD;
  screens: Screens;
  /** Выбранный в лобби класс персонажа. */
  playerClass: PlayerClass;
  setPlayerClass(value: PlayerClass): void;
  toMenu(): void;
  toLobby(): void;
  toGame(save?: SaveData | null): void;
  /** Перечитать сохранение после записи, чтобы «Продолжить» было актуальным. */
  afterSave(): Promise<void>;
}

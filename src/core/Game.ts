import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Settings } from './Settings';
import { AudioEngine } from './Audio';
import { InputManager } from './InputManager';
import { SaveManager, type SaveData } from './SaveManager';
import { RecoveryState } from './RecoveryState';
import type { Stage, GameHandle } from './Stage';
import { HUD } from '../ui/HUD';
import { Screens } from '../ui/Screens';
import { MenuStage } from '../stages/MenuStage';
import { LobbyStage } from '../stages/LobbyStage';
import { GameStage } from '../stages/GameStage';

/** Ядро: рендерер, цикл, переключение сцен и общие сервисы. */
export class Game implements GameHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly settings = new Settings();
  readonly audio = new AudioEngine();
  readonly input: InputManager;
  readonly save = new SaveManager();
  readonly hud: HUD;
  readonly screens: Screens;

  private stage: Stage | null = null;
  private clock = new THREE.Clock();
  private fpsTime = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private fade: HTMLElement;
  private transitioning = false;
  private booted = false;
  private recovery = new RecoveryState();
  private fatalOverlay: HTMLElement | null = null;

  constructor(
    private host: HTMLElement,
    private uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.data.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);

    this.fade = document.createElement('div');
    this.fade.className = 'fade-overlay';
    uiRoot.appendChild(this.fade);

    this.input = new InputManager(this.renderer.domElement, document.body);
    this.input.onLockChange = (locked) => this.stage?.onPointerLock?.(locked);

    this.hud = new HUD(uiRoot);
    this.hud.setVisible(false);

    this.screens = new Screens(uiRoot, this.settings, () => this.applySettings());

    this.settings.onChange(() => this.applySettings());
    this.applySettings();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => {
      /* прогресс сохраняется явно, чтобы не терять данные при закрытии */
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.stage && !this.input.locked && this.stage instanceof GameStage) {
        // захват мыши — только по клику, как требует браузер
        this.input.requestLock();
      }
    });
  }

  async start(): Promise<void> {
    await RAPIER.init();
    this.toMenu(true);
    document.getElementById('boot-screen')?.classList.add('hidden');
    window.setTimeout(() => document.getElementById('boot-screen')?.remove(), 900);
    this.renderer.setAnimationLoop(() => this.loop());
    this.booted = true;
  }

  private loop(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.currentFps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.hud.setFps(this.currentFps, this.settings.data.showFps);
    }
    if (this.stage && this.recovery.canRender) {
      try {
        this.stage.update(dt);
        this.renderer.render(this.stage.scene, this.stage.camera);
      } catch (err) {
        // Останавливаем цикл, чтобы исключение не повторялось каждый кадр,
        // но показываем окно только один раз за аварию.
        if (this.recovery.markCrash()) this.fatal(err);
      }
    }
    this.input.endFrame();
  }

  private applySettings(): void {
    const preset = this.settings.qualityPreset;
    const scale = THREE.MathUtils.clamp(this.settings.data.renderScale, 0.4, 1.3);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale * (preset.pixelRatio / 1.0));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.audio.setVolumes(this.settings.data.musicVolume, this.settings.data.sfxVolume);
    if (document.fullscreenElement && !this.settings.data.fullscreen) {
      void document.exitFullscreen();
    } else if (!document.fullscreenElement && this.settings.data.fullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    this.stage?.resize(window.innerWidth, window.innerHeight);
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.stage?.resize(window.innerWidth, window.innerHeight);
  }

  private fatal(err: unknown): void {
    const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
    console.error(err);

    // Одно окно на все повторные ошибки: не плодим модальные слои и обработчики.
    if (!this.fatalOverlay) {
      const box = document.createElement('div');
      box.className = 'modal';
      box.id = 'fatal-overlay';
      box.innerHTML = `<div class="panel"><div class="panel-title">Ошибка игры</div>
        <div class="panel-sub">сцена не смогла загрузиться</div>
        <pre id="fatal-msg" style="white-space:pre-wrap;font-size:12px;color:#e0a8a0;max-height:40vh;overflow:auto"></pre>
        <div class="panel-actions"><button class="btn btn-primary" id="err-back">В меню</button></div></div>`;
      box.querySelector('#err-back')?.addEventListener('click', () => this.recoverFromFatal());
      this.uiRoot.appendChild(box);
      this.fatalOverlay = box;
    }
    const pre = this.fatalOverlay.querySelector('#fatal-msg');
    if (pre) pre.textContent = msg;
    this.fatalOverlay.classList.remove('hidden');
    this.fade.classList.remove('on');
    this.transitioning = false;
  }

  /** Возврат из окна аварии: сцена меню устанавливается заново и снимает флаг. */
  private recoverFromFatal(): void {
    this.fatalOverlay?.remove();
    this.fatalOverlay = null;
    this.toMenu(true);
  }

  private setStage(stage: Stage): void {
    if (this.stage) this.stage.dispose();
    this.stage = stage;
    stage.resize(window.innerWidth, window.innerHeight);
    this.screens.clear();
    // Новая сцена установлена успешно — цикл снова может обновляться и рисовать.
    this.recovery.installOk();
  }

  private async transitionTo(make: () => Stage): Promise<boolean> {
    if (this.transitioning) return false;
    this.transitioning = true;
    this.fade.classList.add('on');
    this.fade.textContent = 'Загрузка...';
    this.input.releaseLock();
    this.input.clear();
    await new Promise((r) => window.setTimeout(r, 400));
    try {
      this.setStage(make());
    } catch (err) {
      this.fatal(err);
      return false;
    }
    await new Promise((r) => window.setTimeout(r, 120));
    this.fade.classList.remove('on');
    await new Promise((r) => window.setTimeout(r, 450));
    this.fade.textContent = '';
    this.transitioning = false;
    return true;
  }

  toMenu(immediate = false): void {
    this.audio.ensure();
    this.audio.startAmbience();
    this.audio.setNightLevel(0.25);
    this.hud.setVisible(false);
    this.input.releaseLock();
    const build = () => new MenuStage(this);
    if (immediate) {
      try {
        this.setStage(build());
      } catch (err) {
        this.fatal(err);
        return;
      }
      this.screens.showMenu(
        {
          play: () => this.toLobby(),
          multiplayer: () => {
            this.screens.showMultiplayer(() => this.toMenu());
          },
          continueGame: () => this.continueGame(),
          settings: () => this.screens.showSettings(() => this.toMenu()),
          controls: () => this.screens.showControls(() => this.toMenu()),
          about: () => this.screens.showAbout(() => this.toMenu()),
        },
        this.hasSave(),
      );
      return;
    }
    void this.transitionTo(build).then((ok) => {
      if (ok) this.showMenuAgain();
    });
  }

  private showMenuAgain(): void {
    this.audio.startMenuMusic();
    this.screens.showMenu(
      {
        play: () => this.toLobby(),
        multiplayer: () => this.screens.showMultiplayer(() => this.showMenuAgain()),
        continueGame: () => this.continueGame(),
        settings: () => this.screens.showSettings(() => this.showMenuAgain()),
        controls: () => this.screens.showControls(() => this.showMenuAgain()),
        about: () => this.screens.showAbout(() => this.showMenuAgain()),
      },
      this.hasSave(),
    );
  }

  private saveCache: SaveData | null | undefined = undefined;

  private hasSave(): boolean {
    return !!this.saveCache;
  }

  /** Асинхронно проверяем наличие сохранения при старте. */
  async prefetchSave(): Promise<void> {
    this.saveCache = await this.save.load();
    if (!this.booted) return;
    if (this.stage instanceof MenuStage) this.toMenu(true);
  }

  private continueGame(): void {
    const data = this.saveCache;
    if (!data) {
      this.screens.showNote('Сохранение не найдено', 'Начни новую игру.', () => this.showMenuAgain());
      return;
    }
    this.toGame(data);
  }

  toLobby(): void {
    this.hud.setVisible(false);
    this.input.releaseLock();
    void this.transitionTo(() => new LobbyStage(this));
  }

  toGame(save?: SaveData | null): void {
    this.hud.setVisible(true);
    this.audio.ensure();
    this.audio.startAmbience();
    const seed = save?.seed ?? Math.floor(Math.random() * 1e9);
    void this.transitionTo(() => new GameStage(this, seed, save ?? null)).then((ok) => {
      // Автоматический захват мыши может быть отклонён браузером — тогда
      // игрок кликнет по экрану, подсказка в HUD это показывает.
      if (ok) this.input.requestLock();
    });
  }

  async afterSave(): Promise<void> {
    this.saveCache = await this.save.load();
  }
}

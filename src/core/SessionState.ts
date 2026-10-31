/**
 * Состояние сессии: игра, модальное окно, пауза, смерть, победа.
 *
 * Отдельный класс нужен, чтобы возврат из вложенных экранов паузы был
 * предсказуемым и проверяемым тестами без DOM и WebGL.
 */

export type SessionPhase = 'playing' | 'ui' | 'dead' | 'victory';
export type UiMode = 'pause' | 'inventory' | 'crafting' | 'building' | 'note' | 'dialog';

export class SessionState {
  phase: SessionPhase = 'playing';
  ui: UiMode | null = null;

  /** true, если из паузы открыт вложенный экран (настройки/управление). */
  private nestedReturn = false;

  get isPlaying(): boolean {
    return this.phase === 'playing';
  }

  get isPaused(): boolean {
    return this.phase === 'ui' && this.ui === 'pause';
  }

  /**
   * Показывает паузу. Возвращает false, если пауза сейчас невозможна:
   * идёт другой экран (инвентарь, крафт, диалог), смерть или победа.
   */
  openPause(): boolean {
    if (this.phase === 'playing') {
      this.phase = 'ui';
      this.ui = 'pause';
      return true;
    }
    // Возврат из «Настроек»/«Управления»: состояние уже 'ui' + 'pause',
    // поэтому пауза должна просто показаться снова, без повторного входа.
    if (this.phase === 'ui' && this.ui === 'pause' && this.nestedReturn) {
      this.nestedReturn = false;
      return true;
    }
    return false;
  }

  /** Пометить, что сейчас из паузы открывается вложенный экран. */
  openNested(): boolean {
    if (this.phase !== 'ui' || this.ui !== 'pause') return false;
    this.nestedReturn = true;
    return true;
  }

  /** Открыть обычное модальное окно из игры. */
  openUi(mode: Exclude<UiMode, 'pause'>): boolean {
    if (this.phase !== 'playing') return false;
    this.phase = 'ui';
    this.ui = mode;
    return true;
  }

  /** Закрыть любое окно и вернуть управление. */
  closeUi(): boolean {
    if (this.phase !== 'ui') return false;
    this.phase = 'playing';
    this.ui = null;
    this.nestedReturn = false;
    return true;
  }

  die(): void {
    if (this.phase === 'dead' || this.phase === 'victory') return;
    this.phase = 'dead';
    this.ui = null;
    this.nestedReturn = false;
  }

  win(): void {
    if (this.phase === 'dead' || this.phase === 'victory') return;
    this.phase = 'victory';
    this.ui = null;
    this.nestedReturn = false;
  }
}

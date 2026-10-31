/**
 * Флаг аварии игрового цикла.
 *
 * Правила:
 * - ошибка в update/render останавливает цикл, чтобы не зациклить исключения;
 * - успешная установка рабочей сцены снимает аварию;
 * - снимать флаг вслепую каждый кадр нельзя, иначе ошибка спрячется.
 */
export class RecoveryState {
  private crashed = false;
  private crashReports = 0;

  get canRender(): boolean {
    return !this.crashed;
  }

  get isCrashed(): boolean {
    return this.crashed;
  }

  get reports(): number {
    return this.crashReports;
  }

  /**
   * Отмечает аварию. Возвращает true, если окно с ошибкой нужно показать
   * именно сейчас (то есть цикл был здоров до этого сбоя).
   */
  markCrash(): boolean {
    const first = !this.crashed;
    this.crashed = true;
    if (first) this.crashReports++;
    return first;
  }

  /** Вызывать только после успешной установки новой сцены. */
  installOk(): void {
    this.crashed = false;
  }
}

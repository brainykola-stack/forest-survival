import { describe, it, expect } from 'vitest';
import { SessionState } from '../src/core/SessionState';
import { RecoveryState } from '../src/core/RecoveryState';

describe('Пауза и модальные окна', () => {
  it('Esc из игры открывает паузу', () => {
    const s = new SessionState();
    expect(s.openPause()).toBe(true);
    expect(s.isPaused).toBe(true);
    expect(s.phase).toBe('ui');
  });

  it('после закрытия настроек пауза показывается снова (регрессия)', () => {
    const s = new SessionState();
    expect(s.openPause()).toBe(true); // Esc
    expect(s.openNested()).toBe(true); // открыли «Настройки»
    expect(s.phase).toBe('ui');

    // закрыли настройки — обработчик вызывает pause()
    expect(s.openPause()).toBe(true);
    expect(s.isPaused).toBe(true);
    expect(s.ui).toBe('pause');
  });

  it('после управления пауза тоже возвращается', () => {
    const s = new SessionState();
    s.openPause();
    s.openNested();
    expect(s.openPause()).toBe(true);
    expect(s.isPaused).toBe(true);
  });

  it('«Продолжить» возвращает игру и не оставляет вложенного состояния', () => {
    const s = new SessionState();
    s.openPause();
    s.openNested();
    s.openPause(); // вернулись в меню паузы
    expect(s.closeUi()).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.ui).toBeNull();

    // повторный Esc снова открывает паузу, а не молчит
    expect(s.openPause()).toBe(true);
  });

  it('пауза не открывается поверх инвентаря, крафта и диалога', () => {
    for (const mode of ['inventory', 'crafting', 'building', 'note', 'dialog'] as const) {
      const s = new SessionState();
      expect(s.openUi(mode)).toBe(true);
      expect(s.openPause()).toBe(false);
      expect(s.isPaused).toBe(false);
      expect(s.phase).toBe('ui');
    }
  });

  it('пауза не открывается после смерти и победы', () => {
    const dead = new SessionState();
    dead.die();
    expect(dead.openPause()).toBe(false);

    const won = new SessionState();
    won.win();
    expect(won.openPause()).toBe(false);
  });

  it('вложенный экран нельзя открыть, если пауза не активна', () => {
    const s = new SessionState();
    expect(s.openNested()).toBe(false); // игра идёт
    s.openUi('inventory');
    expect(s.openNested()).toBe(false); // открыт инвентарь, а не пауза
  });

  it('закрытие обычного окна не трогает паузу и наоборот', () => {
    const s = new SessionState();
    s.openUi('inventory');
    expect(s.closeUi()).toBe(true);
    expect(s.phase).toBe('playing');

    s.openPause();
    expect(s.openUi('inventory')).toBe(false); // поверх паузы инвентарь не открывается
    expect(s.closeUi()).toBe(true);
    expect(s.closeUi()).toBe(false); // повторное закрытие ничего не ломает
  });
});

describe('Восстановление после ошибки', () => {
  it('ошибка останавливает цикл обновления и рендера', () => {
    const r = new RecoveryState();
    expect(r.canRender).toBe(true);
    expect(r.markCrash()).toBe(true);
    expect(r.canRender).toBe(false);
  });

  it('повторная ошибка не показывает второе окно', () => {
    const r = new RecoveryState();
    r.markCrash();
    expect(r.markCrash()).toBe(false);
    expect(r.reports).toBe(1);
  });

  it('успешная установка сцены возвращает рендер', () => {
    const r = new RecoveryState();
    r.markCrash();
    r.installOk();
    expect(r.canRender).toBe(true);
  });

  it('неудачная установка сцены не снимает аварию', () => {
    const r = new RecoveryState();
    r.markCrash();
    // сцена не установилась — installOk не вызывается
    expect(r.canRender).toBe(false);
    expect(r.isCrashed).toBe(true);
  });

  it('после восстановления новая ошибка снова требует показа окна', () => {
    const r = new RecoveryState();
    r.markCrash();
    r.installOk();
    expect(r.markCrash()).toBe(true);
    expect(r.reports).toBe(2);
    expect(r.canRender).toBe(false);
  });
});

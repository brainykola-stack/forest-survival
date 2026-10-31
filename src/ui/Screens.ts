import { Settings, type SettingsData } from '../core/Settings';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export interface MenuHandlers {
  play: () => void;
  multiplayer: () => void;
  continueGame: () => void;
  settings: () => void;
  controls: () => void;
  about: () => void;
}

/** Все экраны интерфейса, кроме HUD. */
export class Screens {
  private active: HTMLElement[] = [];

  constructor(
    private root: HTMLElement,
    private settings: Settings,
    private onSettingsChanged: (s: SettingsData) => void,
  ) {}

  private add(node: HTMLElement): HTMLElement {
    this.root.appendChild(node);
    this.active.push(node);
    return node;
  }

  clear(): void {
    for (const n of this.active) n.remove();
    this.active = [];
  }

  // ------------------------------------------------------------------ меню

  showMenu(h: MenuHandlers, hasSave: boolean): void {
    this.clear();
    const wrap = el('div', 'screen');
    const menu = el('div', 'menu-wrap');
    menu.innerHTML = `
      <div>
        <div class="menu-title">99 НОЧЕЙ<small>В ДИКОМ ЛЕСУ</small></div>
      </div>
      <div class="menu-sub">выживание в лесу · хоррор</div>
    `;

    const buttons = el('div', 'menu-buttons');
    const mk = (label: string, cls: string, fn: () => void, disabled = false) => {
      const b = el('button', `btn ${cls}`, label);
      b.disabled = disabled;
      b.addEventListener('click', fn);
      buttons.appendChild(b);
      return b;
    };
    mk('Играть', 'btn-primary', h.play);
    mk('Мультиплеер', '', h.multiplayer);
    mk('Продолжить игру', '', h.continueGame, !hasSave);
    mk('Настройки', '', h.settings);
    mk('Управление', '', h.controls);
    mk('Об игре', '', h.about);
    menu.appendChild(buttons);

    const footer = el('div', 'menu-footer', 'нажми «Играть», чтобы войти в лес');
    wrap.appendChild(menu);
    wrap.appendChild(footer);
    this.add(wrap);
  }

  // ------------------------------------------------------------------ настройки

  private openSettingsPanel(onClose: () => void): void {
    const modal = el('div', 'modal');
    const panel = el('div', 'panel');
    panel.innerHTML = `<div class="panel-title">Настройки</div><div class="panel-sub">графика · звук · управление</div>`;

    const s = this.settings.data;

    const range = (
      label: string,
      hint: string,
      value: number,
      min: number,
      max: number,
      step: number,
      format: (v: number) => string,
      apply: (v: number) => void,
    ) => {
      const row = el('div', 'row');
      const left = el('div');
      left.appendChild(el('div', 'row-label', label));
      if (hint) left.appendChild(el('div', 'row-hint', hint));
      row.appendChild(left);

      const right = el('div');
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      const out = el('span', 'range-value', format(value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = format(v);
        apply(v);
      });
      right.appendChild(input);
      right.appendChild(out);
      row.appendChild(right);
      panel.appendChild(row);
    };

    const check = (label: string, hint: string, value: boolean, apply: (v: boolean) => void) => {
      const row = el('div', 'row');
      const left = el('div');
      left.appendChild(el('div', 'row-label', label));
      if (hint) left.appendChild(el('div', 'row-hint', hint));
      row.appendChild(left);
      const input = el('input');
      input.type = 'checkbox';
      input.checked = value;
      input.style.width = '18px';
      input.style.height = '18px';
      input.style.accentColor = '#e0a848';
      input.addEventListener('change', () => apply(input.checked));
      row.appendChild(input);
      panel.appendChild(row);
    };

    range('Громкость музыки', 'эмбиент, ветер, ночной гул', s.musicVolume, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) =>
      this.settings.set('musicVolume', v),
    );
    range('Громкость эффектов', 'шаги, удары, звуки зверей', s.sfxVolume, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) =>
      this.settings.set('sfxVolume', v),
    );
    range('Чувствительность мыши', 'скорость обзора', s.sensitivity, 0.2, 2, 0.05, (v) => v.toFixed(2), (v) =>
      this.settings.set('sensitivity', v),
    );
    range('Разрешение рендера', '40–130% от размера окна', s.renderScale, 0.4, 1.3, 0.05, (v) => `${Math.round(v * 100)}%`, (v) =>
      this.settings.set('renderScale', v),
    );

    // Качество
    const qRow = el('div', 'row');
    const qLeft = el('div');
    qLeft.appendChild(el('div', 'row-label', 'Качество графики'));
    qLeft.appendChild(el('div', 'row-hint', 'тени, трава, дальность'));
    qRow.appendChild(qLeft);
    const qSel = el('select');
    for (const q of ['low', 'medium', 'high']) {
      const o = el('option', '', q === 'low' ? 'Низкое' : q === 'medium' ? 'Среднее' : 'Высокое');
      o.value = q;
      if (s.quality === q) o.selected = true;
      qSel.appendChild(o);
    }
    qSel.addEventListener('change', () => this.settings.set('quality', qSel.value as SettingsData['quality']));
    qRow.appendChild(qSel);
    panel.appendChild(qRow);

    // Скорость суток
    const dRow = el('div', 'row');
    const dLeft = el('div');
    dLeft.appendChild(el('div', 'row-label', 'Скорость суток'));
    dLeft.appendChild(el('div', 'row-hint', 'для тестирования: 10× = быстрый цикл'));
    dRow.appendChild(dLeft);
    const dSel = el('select');
    for (const [v, label] of [
      [1, 'Обычная'],
      [4, '4×'],
      [10, '10×'],
    ] as Array<[number, string]>) {
      const o = el('option', '', label);
      o.value = String(v);
      if (s.daySpeed === v) o.selected = true;
      dSel.appendChild(o);
    }
    dSel.addEventListener('change', () => this.settings.set('daySpeed', Number(dSel.value)));
    dRow.appendChild(dSel);
    panel.appendChild(dRow);

    check('Покачивание камеры', 'плавный шаг при ходьбе', s.headBob, (v) => this.settings.set('headBob', v));
    check('Показывать FPS', 'счётчик в углу экрана', s.showFps, (v) => this.settings.set('showFps', v));
    check('Полноэкранный режим', 'переключается сразу', s.fullscreen, (v) => this.settings.set('fullscreen', v));

    this.settings.onChange((data) => this.onSettingsChanged(data));

    const actions = el('div', 'panel-actions');
    const back = el('button', 'btn btn-primary', 'Готово');
    back.addEventListener('click', () => {
      modal.remove();
      this.active = this.active.filter((a) => a !== modal);
      onClose();
    });
    actions.appendChild(back);
    panel.appendChild(actions);
    modal.appendChild(panel);
    this.add(modal);
  }

  showSettings(onClose: () => void): void {
    this.openSettingsPanel(onClose);
  }

  // ------------------------------------------------------------------ текст

  private textPanel(title: string, subtitle: string, body: string, onClose: () => void, cta = 'Закрыть'): void {
    const modal = el('div', 'modal');
    const panel = el('div', 'panel');
    panel.innerHTML = `<div class="panel-title">${title}</div><div class="panel-sub">${subtitle}</div>`;
    const text = el('div', 'dialog-text');
    text.innerHTML = body;
    panel.appendChild(text);
    const actions = el('div', 'panel-actions');
    const btn = el('button', 'btn btn-primary', cta);
    btn.addEventListener('click', () => {
      modal.remove();
      this.active = this.active.filter((a) => a !== modal);
      onClose();
    });
    actions.appendChild(btn);
    panel.appendChild(actions);
    modal.appendChild(panel);
    this.add(modal);
  }

  showControls(onClose: () => void): void {
    this.textPanel(
      'Управление',
      'клавиши и мышь',
      `<table style="width:100%; border-collapse:collapse; font-size:14px">
        <tr><td style="padding:5px 0">WASD</td><td>движение</td></tr>
        <tr><td style="padding:5px 0">Shift</td><td>бег</td></tr>
        <tr><td style="padding:5px 0">Пробел</td><td>прыжок</td></tr>
        <tr><td style="padding:5px 0">E</td><td>взаимодействие: рубить, собирать, спасать</td></tr>
        <tr><td style="padding:5px 0">F</td><td>подбросить топливо в костёр, открыть дверь</td></tr>
        <tr><td style="padding:5px 0">ЛКМ</td><td>удар / использовать предмет</td></tr>
        <tr><td style="padding:5px 0">ПКМ</td><td>быстрый выбор факела</td></tr>
        <tr><td style="padding:5px 0">1–4</td><td>быстрые слоты</td></tr>
        <tr><td style="padding:5px 0">Tab</td><td>инвентарь</td></tr>
        <tr><td style="padding:5px 0">C</td><td>крафт</td></tr>
        <tr><td style="padding:5px 0">B</td><td>строительство</td></tr>
        <tr><td style="padding:5px 0">Esc</td><td>пауза и освобождение курсора</td></tr>
      </table>`,
      onClose,
    );
  }

  showAbout(onClose: () => void): void {
    this.textPanel(
      'Об игре',
      'оригинальный проект',
      `<p>Ты оказался в лесу, из которого не выходят. Дети пропали, а по ночам в темноте ходит
      Олень — хозяин этого места. Продержись 99 ночей, собери записки, найди и спаси четырёх детей
      и узнай, с чего всё началось.</p>
      <p style="margin-top:10px">Игра полностью процедурная: лес, рельеф и расстановка объектов
      генерируются из seed, звук синтезируется в браузере. Внешних моделей и текстур нет.</p>
      <p style="margin-top:10px; color:#9aa89a">Сетевой режим пока не подключён: серверная часть
      не запущена, кнопка «Мультиплеер» честно сообщает об этом.</p>`,
      onClose,
    );
  }

  showMultiplayer(onClose: () => void): void {
    this.textPanel(
      'Мультиплеер',
      'статус: недоступен',
      `<p>Сетевой режим не развёрнут: сервер с Socket.IO не запущен, поэтому подключаться некуда.</p>
      <p style="margin-top:10px">Архитектура к нему готова: клиент вынесен в отдельный модуль,
      состояние матча описано отдельно от отрисовки. Когда сервер появится, кнопка начнёт
      подключать к комнате, а не показывать это окно.</p>
      <p style="margin-top:10px; color:#9aa89a">Одиночная игра работает полностью и ни от чего не зависит.</p>`,
      onClose,
    );
  }

  showNote(title: string, text: string, onClose: () => void): void {
    this.textPanel(title, 'найденная записка', `<p>${text.replace(/\n/g, '<br><br>')}</p>`, onClose, 'Убрать записку');
  }

  showDialog(speaker: string, text: string, onClose: () => void, cta = 'Продолжить'): void {
    this.textPanel(speaker, 'разговор', `<p>${text}</p>`, onClose, cta);
  }

  // ------------------------------------------------------------------ пауза и финалы

  showPause(h: { resume: () => void; settings: () => void; controls: () => void; lobby: () => void; menu: () => void }): void {
    this.clear();
    const modal = el('div', 'modal');
    const panel = el('div', 'panel');
    panel.innerHTML = `<div class="panel-title">Пауза</div><div class="panel-sub">лес ждёт</div>`;
    const list = el('div', 'menu-buttons');
    const mk = (label: string, cls: string, fn: () => void) => {
      const b = el('button', `btn ${cls}`, label);
      b.addEventListener('click', fn);
      list.appendChild(b);
    };
    mk('Продолжить', 'btn-primary', h.resume);
    mk('Настройки', '', h.settings);
    mk('Управление', '', h.controls);
    mk('Выйти в лобби', '', h.lobby);
    mk('В главное меню', 'btn-ghost', h.menu);
    panel.appendChild(list);
    modal.appendChild(panel);
    this.add(modal);
  }

  showDeath(stats: { nights: number; rescued: number; notes: number }, onRestart: () => void, onLobby: () => void): void {
    this.clear();
    const wrap = el('div', 'screen');
    const box = el('div', 'end-screen');
    box.innerHTML = `
      <div class="end-title death">ТЫ НЕ ДОЖИЛ</div>
      <div class="end-sub">лес забрал ещё одного</div>
      <div class="end-stats">
        <div>Пережито ночей <b>${stats.nights}</b></div>
        <div>Спасено детей <b>${stats.rescued}</b></div>
        <div>Найдено записок <b>${stats.notes}</b></div>
      </div>
    `;
    const buttons = el('div', 'menu-buttons');
    const b1 = el('button', 'btn btn-primary', 'Новая игра');
    b1.addEventListener('click', onRestart);
    const b2 = el('button', 'btn', 'В лобби');
    b2.addEventListener('click', onLobby);
    buttons.append(b1, b2);
    box.appendChild(buttons);
    wrap.appendChild(box);
    this.add(wrap);
  }

  showVictory(stats: { nights: number; rescued: number; notes: number; outcome: string }, onRestart: () => void, onLobby: () => void): void {
    this.clear();
    const wrap = el('div', 'screen');
    const box = el('div', 'end-screen');
    box.innerHTML = `
      <div class="end-title">99 НОЧЕЙ ПОЗАДИ</div>
      <div class="end-sub">${stats.outcome}</div>
      <div class="end-stats">
        <div>Пережито ночей <b>${stats.nights}</b></div>
        <div>Спасено детей <b>${stats.rescued}</b></div>
        <div>Найдено записок <b>${stats.notes}</b></div>
      </div>
    `;
    const buttons = el('div', 'menu-buttons');
    const b1 = el('button', 'btn btn-primary', 'Начать заново');
    b1.addEventListener('click', onRestart);
    const b2 = el('button', 'btn', 'В лобби');
    b2.addEventListener('click', onLobby);
    buttons.append(b1, b2);
    box.appendChild(buttons);
    wrap.appendChild(box);
    this.add(wrap);
  }
}

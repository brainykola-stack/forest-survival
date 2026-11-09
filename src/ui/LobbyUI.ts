import type { Stage } from '../core/Stage';
import type { GameHandle } from '../core/Stage';
import type { SaveData } from '../core/SaveManager';
import type { BuildKind } from '../survival/Building';
import { CLASS_LIST, type PlayerClass } from '../player/Classes';

interface LobbyHandlers {
  onCount: (n: number) => void;
  onClass: (c: PlayerClass) => void;
  onReady: () => void;
  onStart: () => void;
  onBack: () => void;
}

/** Экран лобби: состав, готовность, обратный отсчёт. */
export class LobbyUI {
  private panel: HTMLElement | null = null;
  private count = 1;
  private ready = false;
  private countdown = 0;
  private selectedClass: PlayerClass = 'lumberjack';

  constructor(
    private root: HTMLElement,
    private handlers: LobbyHandlers,
  ) {}

  show(): void {
    this.close();
    const wrap = document.createElement('div');
    wrap.className = 'screen';
    const panel = document.createElement('div');
    panel.className = 'lobby-panel';
    panel.innerHTML = `
      <div class="lobby-head">
        <div class="lobby-title">Лесной лагерь</div>
        <div class="lobby-status">ожидание</div>
      </div>
      <div class="lobby-hint">Это безопасное место перед выходом в лес. Выбери класс, размер отряда и подтверди готовность.</div>
      <div class="lobby-classes"></div>
      <div class="lobby-count"></div>
      <div class="player-list"></div>
      <div class="countdown hidden"></div>
      <div class="panel-actions">
        <button class="btn btn-ghost" data-act="back">В главное меню</button>
        <button class="btn" data-act="ready">Я готов</button>
        <button class="btn btn-primary" data-act="start" disabled>Начать</button>
      </div>
      <div class="lobby-hint" data-role="net">Сетевой режим недоступен: сервер не запущен. Играем в одиночку.</div>
    `;
    wrap.appendChild(panel);
    this.root.appendChild(wrap);
    this.panel = wrap;

    panel.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'back') this.handlers.onBack();
        if (act === 'ready') {
          this.ready = !this.ready;
          this.handlers.onReady();
          this.refresh();
        }
        if (act === 'start' && this.ready) this.handlers.onStart();
      });
    });

    const countBox = panel.querySelector('.lobby-count') as HTMLElement;
    for (const n of [1, 2, 3, 4]) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${n} ${n === 1 ? 'игрок' : 'игрока'}`;
      b.addEventListener('click', () => {
        this.count = n;
        this.handlers.onCount(n);
        this.refresh();
      });
      countBox.appendChild(b);
    }

    const classBox = panel.querySelector('.lobby-classes') as HTMLElement;
    for (const c of CLASS_LIST) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.cls = c.id;
      b.innerHTML = `${c.icon} ${c.name}`;
      b.title = c.description;
      b.addEventListener('click', () => {
        this.selectedClass = c.id;
        this.handlers.onClass(c.id);
        this.refresh();
      });
      classBox.appendChild(b);
    }

    this.refresh();
  }

  setCountdown(seconds: number): void {
    this.countdown = seconds;
    this.refresh();
  }

  private refresh(): void {
    if (!this.panel) return;
    const panel = this.panel.querySelector('.lobby-panel') as HTMLElement;
    const status = panel.querySelector('.lobby-status') as HTMLElement;
    const list = panel.querySelector('.player-list') as HTMLElement;
    const countBox = panel.querySelector('.lobby-count') as HTMLElement;
    const startBtn = panel.querySelector('[data-act="start"]') as HTMLButtonElement;
    const readyBtn = panel.querySelector('[data-act="ready"]') as HTMLButtonElement;
    const cd = panel.querySelector('.countdown') as HTMLElement;

    status.textContent = this.ready ? 'готовность подтверждена' : 'ожидание';
    status.style.color = this.ready ? '#9fd6a0' : '#7fa86a';

    Array.from(countBox.children).forEach((btn, i) => {
      (btn as HTMLElement).classList.toggle('active', i + 1 === this.count);
    });

    const classBox = panel.querySelector('.lobby-classes') as HTMLElement;
    Array.from(classBox.children).forEach((btn) => {
      const el = btn as HTMLElement;
      el.classList.toggle('active', el.dataset.cls === this.selectedClass);
    });

    list.innerHTML = '';
    for (let i = 0; i < this.count; i++) {
      const row = document.createElement('div');
      row.className = 'player-row';
      if (i === 0) {
        row.innerHTML = `<span>Ты — Странник</span><span class="tag ${this.ready ? 'ready' : ''}">${
          this.ready ? 'готов' : 'не готов'
        }</span>`;
      } else {
        row.innerHTML = `<span>Слот ${i + 1}</span><span class="tag">сеть не подключена</span>`;
      }
      list.appendChild(row);
    }

    startBtn.disabled = !this.ready;
    readyBtn.textContent = this.ready ? 'Отменить готовность' : 'Я готов';

    if (this.countdown > 0) {
      cd.classList.remove('hidden');
      cd.textContent = String(Math.ceil(this.countdown));
    } else {
      cd.classList.add('hidden');
    }
  }

  close(): void {
    this.panel?.remove();
    this.panel = null;
  }
}

export type { Stage, GameHandle, SaveData, BuildKind };

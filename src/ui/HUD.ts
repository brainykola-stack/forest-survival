import { ITEMS, type ItemId } from '../survival/Items';
import type { Inventory } from '../survival/Inventory';

/** Игровой интерфейс: полосы, счётчики, быстрый доступ, подсказки, уведомления. */
export class HUD {
  readonly root: HTMLDivElement;
  private health: HTMLElement;
  private hunger: HTMLElement;
  private stamina: HTMLElement;
  private nightLabel: HTMLElement;
  private clockLabel: HTMLElement;
  private fireLabel: HTMLElement;
  private resLabel: HTMLElement;
  private questTitle: HTMLElement;
  private questDesc: HTMLElement;
  private hotbar: HTMLElement;
  private interact: HTMLElement;
  private toasts: HTMLElement;
  private flash: HTMLElement;
  private fps: HTMLElement;
  private rescueLabel: HTMLElement;
  private banner: HTMLElement;
  private ammoLabel: HTMLElement;
  private bannerTimer = 0;
  private toastsCount = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-left">
        <div class="bar bar-health"><div class="bar-fill"></div><div class="bar-label">Здоровье</div></div>
        <div class="bar bar-hunger"><div class="bar-fill"></div><div class="bar-label">Голод</div></div>
        <div class="bar bar-stamina"><div class="bar-fill"></div><div class="bar-label">Силы</div></div>
      </div>
      <div class="hud-top">
        <div class="hud-night">НОЧЬ 1 / 99</div>
        <div class="hud-clock">06:00 · ДЕНЬ</div>
      </div>
      <div class="hud-right">
        <div class="hud-res hud-fire">Костёр: 100%</div>
        <div class="hud-res hud-res-count">🪵 0 · 🪨 0 · 🌿 0</div>
        <div class="hud-res hud-rescue">Спасено: 0 / 4</div>
        <div class="hud-res hud-ammo hidden">Патроны: 0</div>
      </div>
      <div class="hud-quest"><b>Задание</b><span class="q-desc"></span></div>
      <div class="hotbar"></div>
      <div class="crosshair"></div>
      <div class="interact hidden"></div>
      <div class="toast-stack"></div>
      <div class="night-banner hidden"></div>
      <div class="damage-flash"></div>
      <div class="fps"></div>
    `;
    parent.appendChild(this.root);

    const q = this.root.querySelector('.hud-quest') as HTMLElement;
    this.questTitle = q.querySelector('b') as HTMLElement;
    this.questDesc = q.querySelector('.q-desc') as HTMLElement;
    this.health = this.root.querySelector('.bar-health .bar-fill') as HTMLElement;
    this.hunger = this.root.querySelector('.bar-hunger .bar-fill') as HTMLElement;
    this.stamina = this.root.querySelector('.bar-stamina .bar-fill') as HTMLElement;
    this.nightLabel = this.root.querySelector('.hud-night') as HTMLElement;
    this.clockLabel = this.root.querySelector('.hud-clock') as HTMLElement;
    this.fireLabel = this.root.querySelector('.hud-fire') as HTMLElement;
    this.resLabel = this.root.querySelector('.hud-res-count') as HTMLElement;
    this.rescueLabel = this.root.querySelector('.hud-rescue') as HTMLElement;
    this.hotbar = this.root.querySelector('.hotbar') as HTMLElement;
    this.interact = this.root.querySelector('.interact') as HTMLElement;
    this.toasts = this.root.querySelector('.toast-stack') as HTMLElement;
    this.flash = this.root.querySelector('.damage-flash') as HTMLElement;
    this.fps = this.root.querySelector('.fps') as HTMLElement;
    this.banner = this.root.querySelector('.night-banner') as HTMLElement;
    this.ammoLabel = this.root.querySelector('.hud-ammo') as HTMLElement;

    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="glyph"></span><span class="count"></span>`;
      this.hotbar.appendChild(slot);
    }
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  /** Крупный заголовок события: «НОЧЬ СТАИ», «КРОВАВАЯ ЛУНА» и т. п. */
  showBanner(title: string, subtitle: string, ms = 5200): void {
    this.banner.innerHTML = `<div class="nb-title">${title}</div><div class="nb-sub">${subtitle}</div>`;
    this.banner.classList.remove('hidden');
    this.banner.style.opacity = '1';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.banner.style.opacity = '0';
      window.setTimeout(() => this.banner.classList.add('hidden'), 900);
    }, ms);
  }

  setStats(health: number, hunger: number, stamina: number): void {
    this.health.style.width = `${Math.max(0, Math.min(100, health))}%`;
    this.hunger.style.width = `${Math.max(0, Math.min(100, hunger))}%`;
    this.stamina.style.width = `${Math.max(0, Math.min(100, stamina))}%`;
  }

  setNight(n: number, total: number): void {
    this.nightLabel.textContent = `НОЧЬ ${Math.max(1, n)} / ${total}`;
  }

  setClock(label: string, isNight: boolean): void {
    this.clockLabel.textContent = `${label} · ${isNight ? 'НОЧЬ' : 'ДЕНЬ'}`;
  }

  setFire(fuel: number, lit: boolean, near: boolean): void {
    const pct = Math.round(fuel);
    this.fireLabel.textContent = near ? `Костёр: ${lit ? pct + '%' : 'погас'}` : 'Костёр далеко';
    this.fireLabel.classList.toggle('low', lit ? pct < 25 : true);
  }

  setResources(counts: Partial<Record<ItemId, number>>): void {
    this.resLabel.textContent = `🪵 ${counts.wood ?? 0} · 🪨 ${counts.stone ?? 0} · 🌿 ${counts.fiber ?? 0}`;
  }

  setRescued(n: number, total: number): void {
    this.rescueLabel.textContent = `Спасено: ${n} / ${total}`;
  }

  /** Показывает боезапас, пока в руках ружьё. */
  setAmmo(count: number | null): void {
    if (count === null) {
      this.ammoLabel.classList.add('hidden');
      return;
    }
    this.ammoLabel.classList.remove('hidden');
    this.ammoLabel.textContent = `Патроны: ${count}`;
    this.ammoLabel.classList.toggle('low', count <= 3);
  }

  setQuest(title: string, desc: string, progress: string): void {
    this.questTitle.textContent = title;
    this.questDesc.textContent = `${desc} (${progress})`;
  }

  setHotbar(inv: Inventory): void {
    const slots = this.hotbar.children;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i] as HTMLElement;
      const item = inv.slots[i];
      const glyph = el.querySelector('.glyph') as HTMLElement;
      const count = el.querySelector('.count') as HTMLElement;
      if (item) {
        glyph.textContent = ITEMS[item.id].icon;
        count.textContent = item.count > 1 ? String(item.count) : '';
      } else {
        glyph.textContent = '';
        count.textContent = '';
      }
      el.classList.toggle('active', i === inv.selected);
    }
  }

  setInteract(html: string | null, blocked = false): void {
    if (!html) {
      this.interact.classList.add('hidden');
      return;
    }
    this.interact.innerHTML = html;
    this.interact.classList.remove('hidden');
    this.interact.classList.toggle('blocked', blocked);
  }

  toast(text: string, duration = 3200): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    this.toastsCount++;
    while (this.toasts.children.length > 5) this.toasts.removeChild(this.toasts.firstChild!);
    window.setTimeout(() => {
      el.classList.add('fade');
      window.setTimeout(() => el.remove(), 520);
    }, duration);
    this.toastsCount = Math.max(0, this.toastsCount - 1);
  }

  flashDamage(): void {
    this.flash.classList.add('show');
    window.setTimeout(() => this.flash.classList.remove('show'), 90);
  }

  setFps(value: number, visible: boolean): void {
    this.fps.textContent = visible ? `${value.toFixed(0)} FPS` : '';
  }

  /** Подсветка низкого здоровья красным по краям. */
  setLowHealth(danger: boolean): void {
    this.flash.style.opacity = danger ? '0.32' : '';
    this.flash.style.transition = danger ? 'opacity 0.2s ease' : 'opacity 0.6s ease';
  }

  dispose(): void {
    this.root.remove();
  }
}

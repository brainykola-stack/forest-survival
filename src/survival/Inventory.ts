import { ITEMS, type ItemId } from './Items';

export interface Slot {
  id: ItemId;
  count: number;
}

/** Инвентарь: первые четыре слота — быстрый доступ, остальные — рюкзак. */
export class Inventory {
  readonly capacity = 24;
  readonly hotbarSize = 4;
  slots: Array<Slot | null>;
  selected = 0;

  constructor() {
    this.slots = new Array(this.capacity).fill(null);
  }

  countOf(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Возвращает остаток, который не влез. */
  add(id: ItemId, count = 1): number {
    const def = ITEMS[id];
    let left = count;
    // сначала в существующие стопки
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.count < def.maxStack) {
        const move = Math.min(def.maxStack - s.count, left);
        s.count += move;
        left -= move;
      }
    }
    // затем в свободные слоты
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const move = Math.min(def.maxStack, left);
        this.slots[i] = { id, count: move };
        left -= move;
      }
    }
    return left;
  }

  canAdd(id: ItemId, count = 1): boolean {
    const def = ITEMS[id];
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += def.maxStack;
      else if (s.id === id) room += def.maxStack - s.count;
    }
    return room >= count;
  }

  remove(id: ItemId, count = 1): boolean {
    if (this.countOf(id) < count) return false;
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, left);
        s.count -= take;
        left -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  has(cost: Partial<Record<ItemId, number>>): boolean {
    for (const [id, n] of Object.entries(cost)) {
      if (this.countOf(id as ItemId) < (n ?? 0)) return false;
    }
    return true;
  }

  pay(cost: Partial<Record<ItemId, number>>): boolean {
    if (!this.has(cost)) return false;
    for (const [id, n] of Object.entries(cost)) this.remove(id as ItemId, n ?? 0);
    return true;
  }

  refund(cost: Partial<Record<ItemId, number>>): void {
    for (const [id, n] of Object.entries(cost)) this.add(id as ItemId, n ?? 0);
  }

  selectedSlot(): Slot | null {
    return this.slots[this.selected] ?? null;
  }

  select(index: number): void {
    if (index >= 0 && index < this.hotbarSize) this.selected = index;
  }

  /** Подобрать свободный слот для быстрого доступа (при первом предмете). */
  autoHotbar(): void {
    for (let i = 0; i < this.hotbarSize; i++) {
      if (!this.slots[i]) {
        this.selected = i;
        return;
      }
    }
  }

  clear(): void {
    this.slots = new Array(this.capacity).fill(null);
    this.selected = 0;
  }

  toJSON(): Array<Slot | null> {
    return this.slots.map((s) => (s ? { id: s.id, count: s.count } : null));
  }

  fromJSON(data: unknown): void {
    this.slots = new Array(this.capacity).fill(null);
    if (!Array.isArray(data)) return;
    for (let i = 0; i < Math.min(data.length, this.capacity); i++) {
      const raw = data[i] as { id?: string; count?: number } | null;
      if (raw && typeof raw.id === 'string' && ITEMS[raw.id as ItemId] && typeof raw.count === 'number') {
        this.slots[i] = { id: raw.id as ItemId, count: raw.count };
      }
    }
  }
}

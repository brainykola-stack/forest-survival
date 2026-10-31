import { ITEMS, type ItemId } from '../survival/Items';
import type { Inventory } from '../survival/Inventory';

export interface InventoryActions {
  onUse: (id: ItemId, slot: number) => void;
  onDrop: (slot: number) => void;
  onEquip: (slot: number) => void;
  onClose: () => void;
}

/** Окно инвентаря: сетка слотов и подробности о предмете. */
export class InventoryUI {
  private modal: HTMLElement | null = null;
  private selected = 0;

  constructor(private root: HTMLElement) {}

  get isOpen(): boolean {
    return this.modal !== null;
  }

  open(inv: Inventory, actions: InventoryActions): void {
    this.close();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">Инвентарь</div><div class="panel-sub">Tab — закрыть · предметы занимают место</div>`;
    const layout = document.createElement('div');
    layout.className = 'inv-layout';
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    const detail = document.createElement('div');
    detail.className = 'item-detail';
    layout.append(grid, detail);
    panel.appendChild(layout);

    const renderDetail = () => {
      const slot = inv.slots[this.selected];
      if (!slot) {
        detail.innerHTML = `<div class="inv-empty">Пустой слот</div>`;
        return;
      }
      const def = ITEMS[slot.id];
      detail.innerHTML = `
        <h3>${def.name}</h3>
        <div class="item-type">${categoryName(def.category)}</div>
        <div>${def.description}</div>
        <div style="margin-top:12px; color:#9aa89a">В стопке: ${slot.count} / ${def.maxStack}</div>
      `;
      const buttons = document.createElement('div');
      buttons.className = 'panel-actions';
      buttons.style.justifyContent = 'flex-start';
      buttons.style.marginTop = '16px';

      const usable = def.category === 'food' || def.category === 'medicine';
      const equipable = def.category === 'tool' || def.category === 'weapon';
      if (usable) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = 'Использовать';
        b.addEventListener('click', () => {
          actions.onUse(slot.id, this.selected);
          this.open(inv, actions);
        });
        buttons.appendChild(b);
      }
      if (equipable) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = 'В быстрый слот';
        b.addEventListener('click', () => {
          actions.onEquip(this.selected);
          this.open(inv, actions);
        });
        buttons.appendChild(b);
      }
      const drop = document.createElement('button');
      drop.className = 'btn btn-danger';
      drop.textContent = 'Выбросить';
      drop.addEventListener('click', () => {
        actions.onDrop(this.selected);
        this.open(inv, actions);
      });
      buttons.appendChild(drop);
      detail.appendChild(buttons);
    };

    const renderGrid = () => {
      grid.innerHTML = '';
      inv.slots.forEach((slot, i) => {
        const cell = document.createElement('div');
        cell.className = `inv-cell${i === this.selected ? ' selected' : ''}`;
        if (slot) {
          const def = ITEMS[slot.id];
          cell.innerHTML = `<span class="glyph">${def.icon}</span>${slot.count > 1 ? `<span class="count">${slot.count}</span>` : ''}${
            i < inv.hotbarSize ? '<span class="tier">быстрый</span>' : ''
          }`;
        } else if (i < inv.hotbarSize) {
          cell.innerHTML = `<span class="tier">быстрый</span>`;
        }
        cell.addEventListener('click', () => {
          this.selected = i;
          renderGrid();
          renderDetail();
        });
        grid.appendChild(cell);
      });
      renderDetail();
    };

    renderGrid();

    const actionsRow = document.createElement('div');
    actionsRow.className = 'panel-actions';
    const close = document.createElement('button');
    close.className = 'btn btn-primary';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => {
      this.close();
      actions.onClose();
    });
    actionsRow.appendChild(close);
    panel.appendChild(actionsRow);

    modal.appendChild(panel);
    this.root.appendChild(modal);
    this.modal = modal;
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
  }
}

export function categoryName(cat: string): string {
  switch (cat) {
    case 'resource':
      return 'ресурс';
    case 'tool':
      return 'инструмент';
    case 'weapon':
      return 'оружие';
    case 'food':
      return 'еда';
    case 'medicine':
      return 'лекарство';
    case 'story':
      return 'сюжет';
    default:
      return 'предмет';
  }
}

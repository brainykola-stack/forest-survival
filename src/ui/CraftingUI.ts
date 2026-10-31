import { RECIPES, canCraft, type Recipe } from '../survival/Crafting';
import { ITEMS } from '../survival/Items';
import type { Inventory } from '../survival/Inventory';
import { BUILD_DEFS, type BuildKind } from '../survival/Building';

/** Окно крафта: рецепты, стоимость и кнопка создания. */
export class CraftingUI {
  private modal: HTMLElement | null = null;

  constructor(private root: HTMLElement) {}

  get isOpen(): boolean {
    return this.modal !== null;
  }

  open(
    inv: Inventory,
    hasWorkbench: boolean,
    onCraft: (recipe: Recipe) => void,
    onClose: () => void,
  ): void {
    this.close();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">Крафт</div><div class="panel-sub">${
      hasWorkbench ? 'рабочий стол рядом — доступны сложные чертежи' : 'без рабочего стола доступны простые вещи'
    }</div>`;

    const list = document.createElement('div');
    list.className = 'craft-list';

    for (const recipe of RECIPES) {
      const row = document.createElement('div');
      const locked = !!recipe.requiresWorkbench && !hasWorkbench;
      const possible = canCraft(inv, recipe, hasWorkbench);
      row.className = `recipe${locked ? ' locked' : ''}`;

      const cost = Object.entries(recipe.cost)
        .map(([id, n]) => {
          const have = inv.countOf(id as keyof typeof ITEMS);
          const cls = have >= (n ?? 0) ? 'have' : 'lack';
          return `<span class="${cls}">${ITEMS[id as keyof typeof ITEMS]?.icon ?? ''} ${n}</span>`;
        })
        .join(' · ');

      row.innerHTML = `
        <div class="glyph">${recipe.icon}</div>
        <div>
          <div class="recipe-name">${recipe.name}</div>
          <div class="recipe-cost">${cost}${locked ? ' · нужен рабочий стол' : ''}</div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = locked ? 'Заперто' : 'Создать';
      btn.disabled = !possible || locked;
      btn.addEventListener('click', () => {
        onCraft(recipe);
        this.open(inv, hasWorkbench, onCraft, onClose);
      });
      row.appendChild(btn);
      list.appendChild(row);
    }

    panel.appendChild(list);
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const close = document.createElement('button');
    close.className = 'btn btn-primary';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => {
      this.close();
      onClose();
    });
    actions.appendChild(close);
    panel.appendChild(actions);
    modal.appendChild(panel);
    this.root.appendChild(modal);
    this.modal = modal;
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
  }
}

/** Окно строительства: выбор объекта и режим разборки. */
export class BuildingUI {
  private modal: HTMLElement | null = null;

  constructor(private root: HTMLElement) {}

  get isOpen(): boolean {
    return this.modal !== null;
  }

  open(
    inv: Inventory,
    onSelect: (kind: BuildKind | null) => void,
    onRemoveMode: () => void,
    onClose: () => void,
  ): void {
    this.close();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">Строительство</div><div class="panel-sub">выбери объект · колёсико/ЛКМ ставит · F разбирает</div>`;

    const grid = document.createElement('div');
    grid.className = 'build-list';

    for (const def of Object.values(BUILD_DEFS)) {
      const card = document.createElement('div');
      card.className = 'build-card';
      const cost = Object.entries(def.cost)
        .map(([id, n]) => {
          const have = inv.countOf(id as keyof typeof ITEMS);
          return `<span class="${have >= (n ?? 0) ? '' : 'lack'}" style="color:${have >= (n ?? 0) ? '#89c27a' : '#e2715f'}">${
            ITEMS[id as keyof typeof ITEMS]?.icon ?? ''
          } ${n}</span>`;
        })
        .join(' ');
      card.innerHTML = `<div class="name">${def.icon} ${def.name}</div><div class="cost">${cost}</div>`;
      card.addEventListener('click', () => {
        onSelect(def.kind);
        this.close();
        onClose();
      });
      grid.appendChild(card);
    }

    panel.appendChild(grid);
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const rm = document.createElement('button');
    rm.className = 'btn btn-danger';
    rm.textContent = 'Режим разборки';
    rm.addEventListener('click', () => {
      onRemoveMode();
      this.close();
      onClose();
    });
    const close = document.createElement('button');
    close.className = 'btn btn-primary';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => {
      this.close();
      onClose();
    });
    actions.append(rm, close);
    panel.appendChild(actions);
    modal.appendChild(panel);
    this.root.appendChild(modal);
    this.modal = modal;
  }

  close(): void {
    this.modal?.remove();
    this.modal = null;
  }
}

/** Задания: основная линия, дополнительные и исследовательские. */

export type QuestKind = 'main' | 'side' | 'explore';

export type QuestEvent =
  | 'gather_wood'
  | 'gather_stone'
  | 'gather_food'
  | 'craft'
  | 'build'
  | 'fuel'
  | 'night_survived'
  | 'note'
  | 'rescue'
  | 'kill';

export interface Quest {
  id: string;
  title: string;
  desc: string;
  kind: QuestKind;
  event: QuestEvent;
  target: number;
  reward?: { items?: Array<{ id: string; n: number }>; hint?: string };
}

export const QUESTS: Quest[] = [
  {
    id: 'q_wood',
    title: 'Осмотреться',
    desc: 'Собери 5 единиц древесины для первого костра.',
    kind: 'main',
    event: 'gather_wood',
    target: 5,
  },
  {
    id: 'q_axe',
    title: 'Инструмент',
    desc: 'Смастери топор — с ним лес отдаёт больше.',
    kind: 'main',
    event: 'craft',
    target: 1,
  },
  {
    id: 'q_fire',
    title: 'Поддержать огонь',
    desc: 'Подбрось топливо в костёр 3 раза.',
    kind: 'main',
    event: 'fuel',
    target: 3,
  },
  {
    id: 'q_night1',
    title: 'Первая ночь',
    desc: 'Переживи первую ночь, не отходя далеко от костра.',
    kind: 'main',
    event: 'night_survived',
    target: 1,
  },
  {
    id: 'q_shelter',
    title: 'Крыша над головой',
    desc: 'Построй 6 объектов базы (стены, пол, забор).',
    kind: 'side',
    event: 'build',
    target: 6,
  },
  {
    id: 'q_note1',
    title: 'Чужие следы',
    desc: 'Найди первую записку.',
    kind: 'explore',
    event: 'note',
    target: 1,
  },
  {
    id: 'q_child1',
    title: 'Кто-то жив',
    desc: 'Спаси хотя бы одного ребёнка.',
    kind: 'main',
    event: 'rescue',
    target: 1,
  },
  {
    id: 'q_stone',
    title: 'Камень и металл',
    desc: 'Добудь 20 камня.',
    kind: 'side',
    event: 'gather_stone',
    target: 20,
  },
  {
    id: 'q_night5',
    title: 'Пять ночей',
    desc: 'Переживи 5 ночей подряд.',
    kind: 'main',
    event: 'night_survived',
    target: 5,
  },
  {
    id: 'q_notes_all',
    title: 'Вся правда',
    desc: 'Найди все 6 записок.',
    kind: 'explore',
    event: 'note',
    target: 6,
  },
  {
    id: 'q_children_all',
    title: 'Никто не забыт',
    desc: 'Спаси всех четырёх детей.',
    kind: 'main',
    event: 'rescue',
    target: 4,
  },
  {
    id: 'q_night99',
    title: 'Девяносто девять',
    desc: 'Доживи до конца 99-й ночи и выполни финальное испытание.',
    kind: 'main',
    event: 'night_survived',
    target: 99,
  },
];

export interface QuestState {
  progress: number;
  done: boolean;
}

/** Следит за выполнением заданий и не даёт засчитать одно задание дважды. */
export class QuestSystem {
  states = new Map<string, QuestState>();

  constructor(done: string[] = [], progress: Record<string, number> = {}) {
    for (const q of QUESTS) {
      const isDone = done.includes(q.id);
      this.states.set(q.id, { progress: isDone ? q.target : Math.min(progress[q.id] ?? 0, q.target), done: isDone });
    }
  }

  activeQuests(): Array<{ quest: Quest; state: QuestState }> {
    return QUESTS.filter((q) => !this.states.get(q.id)!.done).map((q) => ({ quest: q, state: this.states.get(q.id)! }));
  }

  /** Текущая主线 задача для HUD. */
  currentMain(): { quest: Quest; state: QuestState } | null {
    for (const q of QUESTS) {
      if (q.kind !== 'main') continue;
      const st = this.states.get(q.id)!;
      if (!st.done) return { quest: q, state: st };
    }
    return null;
  }

  /** Возвращает задания, которые завершились этим событием. */
  notify(event: QuestEvent, amount = 1): Quest[] {
    const completed: Quest[] = [];
    for (const q of QUESTS) {
      if (q.event !== event) continue;
      const st = this.states.get(q.id)!;
      if (st.done) continue;
      st.progress = Math.min(q.target, st.progress + amount);
      if (st.progress >= q.target) {
        st.done = true;
        completed.push(q);
      }
    }
    return completed;
  }

  doneIds(): string[] {
    return QUESTS.filter((q) => this.states.get(q.id)!.done).map((q) => q.id);
  }

  progressMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const q of QUESTS) out[q.id] = this.states.get(q.id)!.progress;
    return out;
  }
}

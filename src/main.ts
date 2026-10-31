import './styles/main.css';
import { Game } from './core/Game';

const host = document.getElementById('game-root');
const uiRoot = document.getElementById('ui-root');
const bootStatus = document.getElementById('boot-status');
const bootBar = document.getElementById('boot-progress');

function setBoot(text: string, pct: number): void {
  if (bootStatus) bootStatus.textContent = text;
  if (bootBar) bootBar.style.width = `${pct}%`;
}

function fatal(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  setBoot(`Ошибка запуска: ${msg}`, 100);
  const el = document.getElementById('boot-screen');
  if (el) {
    el.innerHTML = `<div style="max-width:640px;padding:24px;text-align:center;font-family:Arial">
      <h2 style="color:#e08a7e">Не удалось запустить игру</h2>
      <p style="margin-top:12px;color:#c9d3c6">${msg}</p>
      <p style="margin-top:12px;color:#8a9a8a;font-size:13px">Проверь, что браузер поддерживает WebGL2 и включено аппаратное ускорение.</p>
    </div>`;
  }
  console.error(err);
}

async function boot(): Promise<void> {
  if (!host || !uiRoot) throw new Error('Не найдены элементы страницы');
  setBoot('Подготовка движка...', 15);

  const game = new Game(host, uiRoot);

  setBoot('Загрузка мира...', 45);
  await game.start();

  setBoot('Проверка сохранения...', 85);
  await game.prefetchSave();

  setBoot('Готово', 100);
  document.getElementById('boot-screen')?.classList.add('hidden');
}

function showRuntimeError(message: string): void {
  if (document.getElementById('runtime-error')) return;
  const box = document.createElement('div');
  box.id = 'runtime-error';
  box.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#2a0f0c;border:1px solid #a33;padding:12px 16px;color:#ffd7d0;font:12px/1.5 monospace;white-space:pre-wrap;max-height:38vh;overflow:auto';
  box.textContent = `Ошибка во время игры:\n${message}\n\nСкопируй этот текст и пришли его в чат.`;
  const btn = document.createElement('button');
  btn.textContent = 'скрыть';
  btn.style.cssText = 'position:absolute;right:8px;top:6px;background:#522;color:#fdd;border:0;padding:2px 8px;cursor:pointer';
  btn.onclick = () => box.remove();
  box.appendChild(btn);
  document.body.appendChild(box);
}

window.addEventListener('error', (e) => {
  showRuntimeError(`${e.message}\n${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`);
});
window.addEventListener('unhandledrejection', (e) => {
  showRuntimeError(`Promise: ${String(e.reason)}\n${e.reason?.stack ?? ''}`);
});

boot().catch(fatal);

@echo off
cd /d "%~dp0"
set GIT_SSH=C:\Projects\A2AF~1\keys\git-ssh.cmd
echo Публикация изменений на GitHub...
git push
if errorlevel 1 (
  echo.
  echo Не удалось отправить. Проверь текст ошибки выше.
) else (
  echo.
  echo Готово. Изменения на GitHub.
)
pause

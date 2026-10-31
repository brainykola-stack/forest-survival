@echo off
cd /d "%~dp0"
rem Открываем окно браузера через 4 секунды и запускаем сервер разработки.
start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:5199"
call npm run dev
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js. Descarga la version LTS en https://nodejs.org
  echo.
  pause
  exit /b
)
node --disable-warning=ExperimentalWarning server.js --demo --abrir
pause

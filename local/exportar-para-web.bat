@echo off
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning exportar-para-web.js %*
echo.
pause

@echo off
cd /d "%~dp0"

:: Try venv Python first, fall back to system Python
set VENV_PY=%~dp0backend\venv\Scripts\pythonw.exe
if exist "%VENV_PY%" (
    start "" "%VENV_PY%" "%~dp0control_panel.pyw"
) else (
    where pythonw >nul 2>&1
    if %errorlevel%==0 (
        start "" pythonw "%~dp0control_panel.pyw"
    ) else (
        start "" python "%~dp0control_panel.pyw"
    )
)

@echo off
REM Forgekeeper launcher for Windows
REM Usage: forgekeeper [command] [args...]

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
REM Get the project root (parent of bin directory)
set PROJECT_ROOT=%SCRIPT_DIR%..

REM Change to project root
cd /d "%PROJECT_ROOT%"

REM Run forgekeeper with all arguments
python -m forgekeeper %*

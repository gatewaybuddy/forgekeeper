@echo off
echo Starting ForgeKeeper Web Server with llama-cpp backend...

REM Add current folder to PYTHONPATH
set PYTHONPATH=%CD%
python forgekeeper\main_llamacpp.py
pause

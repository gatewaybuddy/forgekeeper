@echo off
echo Starting ForgeKeeper Console with DUAL llama-cpp backend...
set PYTHONPATH=%CD%
python forgekeeper\dual_llm_agent.py
pause

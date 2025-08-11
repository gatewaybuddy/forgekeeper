$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
wsl bash "$scriptDir/setup_docker_env.sh"

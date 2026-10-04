@echo off
rem HRACK_REMOTE_CLI_READY 的 HRACK_ 前缀是历史遗留（早期工作名 HRack），
rem 属于对外的运行时契约，改名会打断既有 e2e 与外部脚本，故保留。
echo HRACK_REMOTE_CLI_READY %*
cmd.exe /d /q

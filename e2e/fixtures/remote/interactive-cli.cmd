@echo off
rem ASC_REMOTE_CLI_READY marks this fake CLI as started; e2e waits for it.
rem Keep the ASCII-only body: batch files are read through the console codepage.
echo ASC_REMOTE_CLI_READY %*
cmd.exe /d /q

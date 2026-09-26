@echo off
setlocal
cd /d "%~dp0"

rem RareDrop LAN access.
rem Opens TCP 5173 (frontend preview) and TCP 3333 (API) for incoming
rem connections so phones and other computers on the same network can open
rem RareDrop. Administrator rights are required; this script asks for them.

net session >nul 2>nul
if not errorlevel 1 goto apply

echo Requesting administrator rights...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:apply
echo Adding RareDrop firewall rules...

netsh advfirewall firewall delete rule name="RareDrop 5173" >nul 2>nul
netsh advfirewall firewall add rule name="RareDrop 5173" dir=in action=allow protocol=TCP localport=5173 profile=any

netsh advfirewall firewall delete rule name="RareDrop 3333" >nul 2>nul
netsh advfirewall firewall add rule name="RareDrop 3333" dir=in action=allow protocol=TCP localport=3333 profile=any

echo.
echo Done. Added inbound allow rules "RareDrop 5173" and "RareDrop 3333".
echo Start RareDrop, then open the network address printed in the console window.
echo.
echo To remove the rules later, run these two lines in an administrator terminal:
echo   netsh advfirewall firewall delete rule name="RareDrop 5173"
echo   netsh advfirewall firewall delete rule name="RareDrop 3333"
echo.
pause

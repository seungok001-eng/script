@echo off
rem TOEIC photo forge launcher: starts the local server (port 8767) and opens Chrome. Closing this window stops the server.
rem Comments are ASCII only: cmd reads this file in the system code page and Korean text here breaks parsing.
rem First run also creates a desktop shortcut (Korean name built from Unicode code points below).
cd /d "%~dp0\.."
set "TOEIC=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$name = [string]::Join('', [char[]](0xD1A0,0xC775,0x20,0xC0AC,0xC9C4,0x20,0xACF5,0xBC29));" ^
  "$lnk = [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), $name + '.lnk');" ^
  "if (-not (Test-Path $lnk)) { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = '%TOEIC%\tools\photo-forge.cmd'; $s.WorkingDirectory = '%TOEIC%'; $s.IconLocation = '%TOEIC%\tools\forge\icon.ico,0'; $s.Save() }"
chcp 65001 >nul
python tools\forge\server.py %*
pause

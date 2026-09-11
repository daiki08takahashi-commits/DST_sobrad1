@echo off
setlocal
cd /d "%~dp0"

node --version >nul 2>nul
if not %ERRORLEVEL%==0 (
    echo Node.js was not found on this computer.
    echo Please install it from https://nodejs.org/ ^(choose the LTS version^),
    echo then close this window and run start.bat again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Setting up the frontend for the first time, this can take a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo Installing dependencies failed -- see the error above.
        pause
        exit /b 1
    )
)

echo.
echo Starting the SOBRAD frontend at http://localhost:5173
echo Make sure start.bat in the backend folder is already running in another window.
echo Leave this window open while you use the app. Press Ctrl+C to stop it.
echo.
call npm run dev

pause

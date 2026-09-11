@echo off
setlocal
cd /d "%~dp0"

rem Windows ships a fake "python"/"python3" command that only prints a
rem Microsoft Store install prompt and is NOT real Python. Detect a real
rem install properly instead of just checking whether a "python" command
rem exists in PATH.

set "PYEXE="

py -3 --version >nul 2>nul
if %ERRORLEVEL%==0 (
    set "PYEXE=py -3"
) else (
    python --version >nul 2>nul
    if %ERRORLEVEL%==0 (
        set "PYEXE=python"
    )
)

if not defined PYEXE (
    echo Python was not found on this computer.
    echo ^(If Windows just offered to open the Microsoft Store, that is NOT
    echo real Python -- it is a shortcut placeholder and won't work here.^)
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo During setup, tick the box that says "Add python.exe to PATH".
    echo.
    echo If you already have Python installed and still see this message,
    echo turn off the Store shortcut: open Settings, then search for and
    echo open "App execution aliases", then switch OFF "python.exe" and
    echo "python3.exe". Close this window and run start.bat again after that.
    pause
    exit /b 1
)

if not exist venv\Scripts\activate.bat (
    echo Setting up the backend for the first time, this can take a minute...
    if exist venv rmdir /s /q venv
    %PYEXE% -m venv venv
)

if not exist venv\Scripts\activate.bat (
    echo Something went wrong creating the Python virtual environment.
    echo Please make sure Python was installed correctly ^(see above^) and try again.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

echo Installing/checking dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Installing dependencies failed -- see the error above.
    pause
    exit /b 1
)

echo.
echo Starting the SOBRAD backend at http://localhost:8000
echo Leave this window open while you use the app. Press Ctrl+C to stop it.
echo.
uvicorn app.main:app --host 0.0.0.0 --port 8000

pause

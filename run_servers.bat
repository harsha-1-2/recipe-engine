@echo off
echo ===================================================
echo   Recipe-to-Cart v2 Upgraded - Server Runner
echo ===================================================
echo.

echo [1/3] Ensuring PostgreSQL database is running via Docker...
docker-compose up -d
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Failed to start Docker. If you are using a local database, please ensure it is running.
)
echo.

echo [2/3] Starting API Backend on http://localhost:4000...
start "Recipe-to-Cart API Backend" cmd /k "cd apps\api && npm run dev"
echo.

echo [3/3] Starting Web Frontend on http://localhost:3000...
start "Recipe-to-Cart Web Frontend" cmd /k "cd apps\web && npm run dev"
echo.

echo ===================================================
echo   Servers started!
echo   Web Frontend: http://localhost:3000
echo   API Backend:  http://localhost:4000
echo ===================================================
echo.
pause

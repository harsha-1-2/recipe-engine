@echo off
echo ===================================================
echo   Recipe-to-Cart v2 Upgraded Auto-Runner
echo ===================================================
echo.

:CHOICE
set /p "use_docker=Do you want to start/use the database via Docker? [Y/N] (default is Y): "
if "%use_docker%"=="" set use_docker=Y

if /i "%use_docker%"=="Y" goto DOCKER
if /i "%use_docker%"=="N" goto LOCAL_DB
echo Invalid choice. Please enter Y or N.
goto CHOICE

:DOCKER
echo.
echo [1/5] Starting PostgreSQL database via Docker...
docker-compose up -d
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start Docker. 
    echo Please make sure Docker Desktop is running/started on your machine, then run this script again.
    pause
    exit /b %ERRORLEVEL%
)
echo.
goto DEPS

:LOCAL_DB
echo.
echo [1/5] Skipping Docker. Using local PostgreSQL config...
echo Please ensure PostgreSQL is running locally and matches the DATABASE_URL in:
echo   apps/api/.env
echo   db/.env
echo.
pause
goto DEPS

:DEPS
:: Step 2: Install dependencies
echo [2/5] Installing npm dependencies (db, api, web)...
echo.
echo Installing db dependencies...
cd db
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install db dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Installing api dependencies...
cd ../apps/api
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install api dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Installing web dependencies...
cd ../web
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install web dependencies.
    pause
    exit /b %ERRORLEVEL%
)
cd ../..
echo.

:: Step 3: Run Prisma Db Push & Client Generation
echo [3/5] Syncing database schema & generating Prisma Clients...
cd db
call npx prisma db push
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to push schema to database.
    echo Please check if your DATABASE_URL is correct and PostgreSQL is running.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Generating Prisma Client for API...
cd ../apps/api
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to generate Prisma Client for API.
    pause
    exit /b %ERRORLEVEL%
)
cd ../..
echo.

:: Step 4: Seed Database
echo [4/5] Seeding sample and demo data...
cd apps/api
call npm run seed
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to seed database.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [Optional] Seeding full recipes from CSV (this may take a minute)...
call npm run seed:csv
cd ../..
echo.

:: Step 5: Start Servers in Separate Windows
echo [5/5] Starting API and Web servers in separate windows...
echo.
echo Starting API Backend on http://localhost:4000...
start "Recipe-to-Cart API Backend" cmd /k "cd apps\api && npm run dev"

echo Starting Web Frontend on http://localhost:3000...
start "Recipe-to-Cart Web Frontend" cmd /k "cd apps\web && npm run dev"

echo.
echo ===================================================
echo   Setup Complete!
echo   Web Frontend: http://localhost:3000
echo   API Backend:  http://localhost:4000
echo   Demo Login:   demo@royal.com / demo123
echo ===================================================
echo.
pause

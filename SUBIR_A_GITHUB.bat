@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Subir Servidor ONPE a GitHub

echo ========================================================
echo    SUBIR CARPETA SERVER A GITHUB
echo ========================================================
echo Carpeta actual: %CD%
echo.

:: 1. Detectar ejecutable de Git
set "GIT_CMD="
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "GIT_CMD=git"
) else if exist "C:\Program Files\Microsoft Visual Studio\18\Enterprise\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Microsoft Visual Studio\18\Enterprise\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
) else if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
)

if "%GIT_CMD%"=="" (
    echo [ERROR] No se encontro Git instalado en tu sistema.
    echo Por favor instala Git desde: https://git-scm.com/downloads
    echo.
    pause
    exit /b 1
)

echo [OK] Git detectado correctamente.
echo.

:: 2. Inicializar repositorio si no existe
if not exist ".git" (
    echo [INFO] Inicializando repositorio Git en server/...
    "%GIT_CMD%" init
    "%GIT_CMD%" branch -M main
) else (
    echo [INFO] Repositorio Git existente detectado en server/.
)

:: 3. Configurar URL del repositorio remoto
set "REMOTE_URL="
for /f "tokens=*" %%a in ('"%GIT_CMD%" remote get-url origin 2^>nul') do set "REMOTE_URL=%%a"

if "%REMOTE_URL%"=="" (
    echo.
    echo ========================================================
    echo  Pega la URL de tu repositorio de GitHub para el SERVER:
    echo  (Ejemplo: https://github.com/tu-usuario/onpe-scraper-api.git)
    echo ========================================================
    set /p REPO_URL="URL de GitHub: "
    
    if "%REPO_URL%"=="" (
        echo [ERROR] No ingresaste ninguna URL. Operacion cancelada.
        pause
        exit /b 1
    )
    
    "%GIT_CMD%" remote add origin %REPO_URL%
    set "REMOTE_URL=%REPO_URL%"
) else (
    echo [INFO] Repositorio remoto actual: %REMOTE_URL%
    set /p CAMBIAR_REMOTE="Deseas cambiar la URL del repositorio remoto? (S/N) [N]: "
    if /i "!CAMBIAR_REMOTE!"=="S" (
        set /p NUEVA_URL="Ingresa la nueva URL de GitHub: "
        if not "!NUEVA_URL!"=="" (
            "%GIT_CMD%" remote set-url origin !NUEVA_URL!
            set "REMOTE_URL=!NUEVA_URL!"
        )
    )
)

echo.
echo ========================================================
echo  Preparando y subiendo archivos del servidor...
echo ========================================================

:: 4. Agregar archivos y commit
"%GIT_CMD%" add .
"%GIT_CMD%" commit -m "Servidor ONPE Scraper API con Dockerfile y Puppeteer"

echo.
echo [INFO] Subiendo a GitHub (%REMOTE_URL%)...
"%GIT_CMD%" push -u origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] Sincronizando con force push inicial...
    "%GIT_CMD%" push -u origin main --force
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo    [EXITO] SERVIDOR SUBIDO CON EXITO A GITHUB
    echo ========================================================
    echo  Ahora puedes ir a Render.com o Railway y conectarlo.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo    [ERROR] No se pudo completar la subida.
    echo    Verifica tu conexion o tus credenciales de GitHub.
    echo ========================================================
)

echo.
pause

@echo off
title Custodia (modo local)
cd /d "%~dp0"
echo ============================================
echo   CUSTODIA - modo local
echo   Abre la aplicacion en tu navegador:
echo   http://localhost:3000
echo.
echo   Para usar tu base de datos Supabase,
echo   crea el archivo .env con la linea:
echo   DATABASE_URL=cadena-de-conexion
echo ============================================
node server.js
pause
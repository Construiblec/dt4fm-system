Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando preparacion del entorno DT4FM..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Configurar Backend
Write-Host "`n[1/2] Configurando Backend..." -ForegroundColor Yellow
if (!(Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "✅ Archivo .env creado en el Backend." -ForegroundColor Green
} else {
    Write-Host "ℹ️ El archivo .env ya existe en el Backend." -ForegroundColor Gray
}

Write-Host "📦 Instalando dependencias del Backend..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

# 2. Configurar Frontend
Write-Host "`n[2/2] Configurando Frontend..." -ForegroundColor Yellow
if (!(Test-Path "frontend\modulo-incidentes\.env")) {
    Copy-Item "frontend\modulo-incidentes\.env.example" "frontend\modulo-incidentes\.env"
    Write-Host "✅ Archivo .env creado en el Frontend." -ForegroundColor Green
} else {
    Write-Host "ℹ️ El archivo .env ya existe en el Frontend." -ForegroundColor Gray
}

Write-Host "📦 Instalando dependencias del Frontend..." -ForegroundColor Yellow
Set-Location frontend\modulo-incidentes
npm install
Set-Location ..\..

# 3. Instrucciones Finales
Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "🎉 ¡Preparacion completada exitosamente!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "`nPara iniciar el desarrollo, abre dos terminales:"
Write-Host "1. En la carpeta backend/: npm run start:dev" -ForegroundColor Yellow
Write-Host "2. En la carpeta frontend/modulo-incidentes/: npm run dev" -ForegroundColor Yellow
Write-Host "`n⚠️ Nota: Asegurate de haber ejecutado 'docker compose up' en OpenMaintCore previamente." -ForegroundColor Red

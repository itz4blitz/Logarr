# Logarr Update Script for Windows
# Updates Logarr to the latest version

$ErrorActionPreference = "Stop"

Write-Host "=== Logarr Update Script ===" -ForegroundColor Green
Write-Host ""

# Check if docker compose is available
try {
    docker compose version | Out-Null
} catch {
    Write-Host "Error: docker is not installed or not running" -ForegroundColor Red
    exit 1
}

# Check if we're in the logarr directory
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "Error: docker-compose.yml not found. Are you in the logarr directory?" -ForegroundColor Red
    exit 1
}

# Stop running containers
Write-Host "Stopping containers..." -ForegroundColor Yellow
docker compose down
Write-Host ""

# Pull latest images
Write-Host "Pulling latest images..." -ForegroundColor Green
docker compose pull
Write-Host ""

# Start containers
Write-Host "Starting containers..." -ForegroundColor Yellow
docker compose up -d
Write-Host ""

# Wait for services
Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Show status
Write-Host "Container status:" -ForegroundColor Green
docker compose ps
Write-Host ""

Write-Host "=== Update complete! ===" -ForegroundColor Green
Write-Host "Logarr should be running on http://localhost:3001"

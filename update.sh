#!/bin/bash
# Logarr Update Script
# Updates Logarr to the latest version

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Logarr Update Script ===${NC}"
echo ""

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "Error: docker is not installed"
    exit 1
fi

# Check if we're in the logarr directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found. Are you in the logarr directory?"
    exit 1
fi

# Stop running containers
echo -e "${YELLOW}Stopping containers...${NC}"
docker compose down
echo ""

# Pull latest images
echo -e "${GREEN}Pulling latest images...${NC}"
docker compose pull
echo ""

# Start containers
echo -e "${YELLOW}Starting containers...${NC}"
docker compose up -d
echo ""

# Wait for services
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Show status
echo -e "${GREEN}Container status:${NC}"
docker compose ps
echo ""

echo -e "${GREEN}=== Update complete! ===${NC}"
echo "Logarr should be running on http://localhost:3001"

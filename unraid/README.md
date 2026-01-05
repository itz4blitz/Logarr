# Logarr Unraid Templates

These templates allow you to install Logarr on Unraid.

## Installation Order

Install the containers in this order:

1. **logarr-db** - PostgreSQL database
2. **logarr-redis** - Redis cache
3. **logarr-backend** - API server (depends on db and redis)
4. **logarr-frontend** - Web UI (depends on backend)

## Installing Templates (Unraid 7)

SSH into your Unraid server and download the templates:

```bash
cd /boot/config/plugins/dockerMan/templates-user/
wget https://raw.githubusercontent.com/itz4blitz/logarr/master/unraid/logarr-db.xml
wget https://raw.githubusercontent.com/itz4blitz/logarr/master/unraid/logarr-redis.xml
wget https://raw.githubusercontent.com/itz4blitz/logarr/master/unraid/logarr-backend.xml
wget https://raw.githubusercontent.com/itz4blitz/logarr/master/unraid/logarr-frontend.xml
```

Then go to **Docker** > **Add Container** and the templates will appear in the dropdown.

## Quick Setup

### 1. Install logarr-db

- Leave defaults or customize port/credentials
- Wait for container to start and become healthy

### 2. Install logarr-redis

- Leave defaults
- Wait for container to start

### 3. Install logarr-backend

- Update `DATABASE_URL` if you changed db credentials
- Update `CORS_ORIGIN` to `http://YOUR_UNRAID_IP:3001`
- Optionally mount log directories to `/app/logs`

### 4. Install logarr-frontend

- Update `NEXT_PUBLIC_API_URL` to `http://YOUR_UNRAID_IP:4001/api`
- Update `NEXT_PUBLIC_WS_URL` to `ws://YOUR_UNRAID_IP:4001`

## Network Configuration

All containers use bridge networking by default. The containers communicate via their container names:

- `logarr-db` - PostgreSQL on port 5432
- `logarr-redis` - Redis on port 6379
- `logarr-backend` - API on port 4000 (exposed as 4001)
- `logarr-frontend` - Web UI on port 3000 (exposed as 3001)

## Manual Installation (No Templates)

If you prefer to set up containers manually without templates:

### logarr-db

- **Repository:** `postgres:16-alpine`
- **Port:** `5433` -> `5432`
- **Variables:**
  - `POSTGRES_USER` = `postgres`
  - `POSTGRES_PASSWORD` = `postgres`
  - `POSTGRES_DB` = `logarr`
- **Path:** `/mnt/user/appdata/logarr/postgres` -> `/var/lib/postgresql/data`

### logarr-redis

- **Repository:** `redis:7-alpine`
- **Port:** `6380` -> `6379`
- **Path:** `/mnt/user/appdata/logarr/redis` -> `/data`

### logarr-backend

- **Repository:** `ghcr.io/itz4blitz/logarr-backend:latest`
- **Port:** `4001` -> `4000`
- **Variables:**
  - `DATABASE_URL` = `postgresql://postgres:postgres@logarr-db:5432/logarr`
  - `REDIS_URL` = `redis://logarr-redis:6379`
  - `CORS_ORIGIN` = `http://YOUR_UNRAID_IP:3001`
  - `NODE_ENV` = `production`

### logarr-frontend

- **Repository:** `ghcr.io/itz4blitz/logarr-frontend:latest`
- **Port:** `3001` -> `3000`
- **Variables:**
  - `NEXT_PUBLIC_API_URL` = `http://YOUR_UNRAID_IP:4001/api`
  - `NEXT_PUBLIC_WS_URL` = `ws://YOUR_UNRAID_IP:4001`

## Troubleshooting

### Backend won't start

- Ensure logarr-db and logarr-redis are running first
- Check DATABASE_URL and REDIS_URL are correct
- View container logs for specific errors

### Frontend shows connection errors

- Verify NEXT_PUBLIC_API_URL points to your backend
- Ensure CORS_ORIGIN in backend matches frontend URL
- Check that backend is running and accessible

### Logs not appearing

- Mount your application log directories to `/app/logs` in the backend container
- Configure log sources in the Logarr web UI

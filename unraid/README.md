# Logarr Unraid Templates

These templates allow you to install Logarr on Unraid via Community Applications.

## Installation Order

Install the containers in this order:

1. **logarr-db** - PostgreSQL database
2. **logarr-redis** - Redis cache
3. **logarr-backend** - API server (depends on db and redis)
4. **logarr-frontend** - Web UI (depends on backend)

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

## Adding Template Repository

To add these templates to Community Applications:

1. Go to **Apps** > **Settings** (gear icon)
2. Add this URL to **Template repositories**:
   ```
   https://github.com/itz4blitz/logarr
   ```
3. Click **Save** and force update

## Manual Installation

If templates don't appear in CA, you can manually add them:

1. Go to **Docker** tab
2. Click **Add Container**
3. Click **Template repositories** dropdown
4. Select **Add template** and paste the raw XML URL

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

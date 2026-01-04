# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private vulnerability reporting:

**[Report a Security Vulnerability](https://github.com/itz4blitz/Logarr/security/advisories/new)**

Or manually:

1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Fill out the form with details

### What to Include

- **Description**: A clear description of the vulnerability
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Impact**: What an attacker could achieve
- **Affected Versions**: Which versions are affected
- **Suggested Fix**: If you have one (optional)

### Response Timeline

1. **Acknowledgment**: Within 48 hours
2. **Assessment**: We will investigate and assess severity
3. **Updates**: We will keep you informed of progress
4. **Resolution**: Critical issues addressed within 7 days
5. **Credit**: You will be credited in release notes (unless you prefer anonymity)

### Disclosure Policy

- Please give us reasonable time to address the issue before public disclosure
- We follow coordinated disclosure practices

## Security Best Practices for Users

### API Keys

- Never commit API keys to version control
- Use environment variables for sensitive configuration
- Rotate API keys periodically
- Use read-only API keys where possible

### Deployment

- Run behind a reverse proxy (nginx, Traefik, Caddy)
- Use HTTPS in production
- Keep Docker images updated
- Limit network exposure

### Database

- Use strong passwords for PostgreSQL
- Do not expose database ports to the internet
- Regular backups are recommended

## Security Considerations

### AI Provider API Keys

When using AI analysis features, your API keys are:

- Stored in environment variables (not in the database)
- Never logged or exposed in the UI
- Only used for API calls to the respective providers

### Log Data

- Logs may contain sensitive information from your media servers
- Access to Logarr should be restricted to trusted users
- Consider your data retention policies

## Security Updates

Security updates will be released as patch versions and announced in GitHub releases.

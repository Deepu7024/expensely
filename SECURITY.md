# Security policy

Expensely stores financial records and can connect to Gmail through OAuth.
Treat every installation as sensitive, even when it is used only on a private
network.

## Project status

Expensely is an early-stage self-hosted project. It has automated tests, but it
has not received a professional security audit. The maintainers do not claim
that it is suitable for regulated, enterprise, or high-risk environments.

Only the latest code on the default branch receives security fixes. Older
commits, forks, and releases are not supported unless stated otherwise.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option in the repository's Security
tab to submit a private report. Include:

- the affected version or commit;
- the vulnerable endpoint or component;
- steps to reproduce the issue;
- the likely impact; and
- a suggested fix, if you have one.

Do not include real financial records, passwords, OAuth tokens, API keys, or
other personal data. If private vulnerability reporting is unavailable, open
a minimal public issue asking for a private contact channel without publishing
the exploit details.

Please allow a reasonable period for investigation and remediation before
public disclosure. There is currently no paid bug-bounty program.

## Deployment responsibilities

Operators are responsible for securing their own installation. At minimum:

- use HTTPS outside local development;
- set `COOKIE_SECURE=true` behind HTTPS;
- restrict `ALLOWED_ORIGINS` to trusted frontend origins;
- disable open registration with `ALLOW_REGISTRATION=false` after creating the
  intended accounts;
- protect PostgreSQL from public network access;
- keep Gmail credentials, tokens, `.env` files, and backups outside Git; and
- update dependencies and the application regularly.

If credentials may have been exposed, revoke and rotate them immediately.

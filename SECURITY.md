# Security

Please report security problems privately, through GitHub's **Report a vulnerability** button on the repository's Security tab, not in a public issue. You'll get an answer within a week.

## What KurTest protects

- By default it listens on `127.0.0.1` only.
- Sending runs always needs the token; the token is compared in constant time.
- Viewing from anywhere but the machine itself needs the token or the sign-in cookie (`HttpOnly`, `SameSite=Lax`, `Secure` behind HTTPS), unless you turn on `--lan-view`.
- Requests that arrive through a proxy or tunnel are always treated as coming from outside.
- The token file is written with `0600` permissions.

## What it doesn't

KurTest stores and shows what your tests print as reasons and descriptions. Anyone who can view the page can read them, so keep secrets out of test output, and don't share the page with people who shouldn't see your test results.

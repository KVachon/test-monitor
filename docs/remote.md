# Remote access

Out of the box, KurTest only listens on the machine it runs on. That's the safe default for a laptop on café Wi-Fi. This page is for when you want one page for several machines: your laptop, a desktop, CI, cloud sessions.

## The token

KurTest makes a token the first time it starts and keeps it in `~/.kurtest/token` (or in the data folder, if you set one). `kurtest token` prints it, with a sign-in link for other devices.

- **Sending runs always needs it**: set `KURTEST_TOKEN` on the sending machine, or save it in that machine's `~/.kurtest/token`. Runs on the same machine as KurTest find it by themselves.
- **Viewing the page from another device needs it once**: open the sign-in link (`http://<host>:7357/?token=…`), and KurTest swaps the token for a cookie and takes it out of the address bar. Or open the page and paste the token into the form.

To use your own token instead (say, one kept in a password manager), set `KURTEST_TOKEN` where KurTest runs.

## On your local network

On the always-on machine:

```sh
kurtest serve --host 0.0.0.0                # or: kurtest service install --host 0.0.0.0
```

On every machine that sends runs:

```sh
export KURTEST_URL=http://my-server.local:7357
export KURTEST_TOKEN=<token>
```

To skip the sign-in on devices at home, add `--lan-view`: the page (not sending) is then open to private network addresses (`10.*`, `172.16–31.*`, `192.168.*`). Only do this on a network you trust.

## From anywhere

Don't open port 7357 on your router. Put KurTest behind a tunnel instead; both of these are free for personal use.

### Tailscale (simplest)

Install [Tailscale](https://tailscale.com) on the KurTest machine and on everything that sends runs. Start KurTest with `--host 0.0.0.0`, and use the machine's Tailscale name:

```sh
export KURTEST_URL=http://my-server:7357     # the machine's name on your tailnet
```

Only your own devices can reach it, and senders still need the token.

### Cloudflare Tunnel (a public address, for cloud sessions and CI)

With a domain on Cloudflare, a named tunnel gives KurTest a fixed `https://` address without opening any ports. KurTest can stay on `127.0.0.1`:

```sh
cloudflared tunnel login
cloudflared tunnel create kurtest
cloudflared tunnel route dns kurtest tests.example.com
cloudflared tunnel run --url http://localhost:7357 kurtest
```

Then `sudo cloudflared service install` keeps the tunnel running. Senders use `KURTEST_URL=https://tests.example.com`. Every request through the tunnel needs the token, for sending and for viewing, because KurTest treats anything that arrives through a proxy as coming from outside.

Without a domain, `cloudflared tunnel --url http://localhost:7357` gives a temporary `trycloudflare.com` address that changes every time it restarts: fine for a try, not for a setup you keep.

### Other reverse proxies

Any proxy works if it sets `X-Forwarded-For` (nginx, Caddy and Traefik do by default) so KurTest knows the request came from outside. Serve it over HTTPS; the sign-in cookie is marked `Secure` when the proxy sends `X-Forwarded-Proto: https`.

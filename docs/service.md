# Keeping KurTest running

`kurtest -- <command>` starts KurTest in the background when it isn't running, so you don't need any of this to use it. Set it up as a service when you want it there all the time, for example on a machine other machines report to.

## On your own computer

```sh
npm i -g kurtest
kurtest service install
```

| System | What it sets up | Log |
| --- | --- | --- |
| macOS | A launchd agent, `~/Library/LaunchAgents/dev.kurtest.plist` | `~/.kurtest/server.log` |
| Linux | A systemd user service, `~/.config/systemd/user/kurtest.service` | `journalctl --user -u kurtest` |
| Windows | A scheduled task "KurTest" that starts it hidden when you log in | `%USERPROFILE%\.kurtest\server.log` |

Anything after `install` is passed to `kurtest serve`, so `kurtest service install --host 0.0.0.0` shares it on your network ([remote access](remote.md)). Run `install` again to change the options, `kurtest service status` to check on it, and `kurtest service remove` to undo it.

The service runs the Node that installed it. If you switch Node versions (nvm, fnm, Volta), run `kurtest service install` again.

On a Linux server with nobody logged in, also run `loginctl enable-linger $USER` so the service keeps running.

## Docker

```sh
docker run -d --name kurtest --restart unless-stopped \
  -p 7357:7357 -v kurtest:/data ghcr.io/kvachon/kurtest
docker exec kurtest kurtest token
```

The image listens on all addresses inside the container, keeps runs and the token in the `/data` volume, and makes a token on first start. Use `-p 127.0.0.1:7357:7357` to keep it to the host machine. In the sign-in link that `kurtest token` prints, replace the container's name with the host's.

## Your own service manager

Run `kurtest serve` with the options you want ([settings](settings.md)). It logs to stdout, exits on `SIGTERM`, and answers `GET /healthz` for health checks.

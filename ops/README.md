# Ops: fully automatic live operation

The web app on Vercel is stateless; the **cranker** is the engine. These launchd services
keep it (and the bot crowd) running unattended on the operator machine: start at login,
restart on crash, logs in `/tmp/bigshout-*.log`.

The cranker is autonomous end to end: it discovers fixtures every 15 minutes, follows the
live SSE score stream, fires cards off real events, drifts odds, settles (proof YES /
expiry NO), sweeps claims, mirrors chain state into Postgres, and executes replay requests
queued from the deployed site. A Postgres advisory lock guarantees only one live cranker
ever runs — a duplicate instance exits immediately.

## Production: Oracle Cloud VM (current setup)

The cranker + bots run as systemd services on the operator VM (`ubuntu@193.123.191.188`),
compiled to plain JS for low memory alongside flashsettle-keeper. Deploy/update:

```bash
# build locally, ship, restart (from repo root)
cd cranker && npx tsc && rsync -aq dist .env _keys ubuntu@193.123.191.188:~/big-shout/cranker/
ssh ubuntu@193.123.191.188 'cd ~/big-shout && git pull -q && cd cranker && npm ci --omit=dev --silent && ln -sfn ../../_keys dist/cranker/_keys && sudo systemctl restart bigshout-cranker bigshout-bots'

# watch
ssh ubuntu@193.123.191.188 'journalctl -f -u bigshout-cranker -o cat'
```

Units: `ops/bigshout-cranker.service`, `ops/bigshout-bots.service` (installed under
`/etc/systemd/system`, `Restart=always`). The Postgres advisory lock means a stray second
cranker anywhere (laptop included) exits immediately — cutovers are race-free.

## Alternative: macOS launchd (operator laptop)

```bash
cp ops/com.bigshout.cranker.plist ops/com.bigshout.bots.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bigshout.cranker.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bigshout.bots.plist
```

## Manage

```bash
launchctl kickstart -k gui/$(id -u)/com.bigshout.cranker   # restart now
launchctl bootout gui/$(id -u)/com.bigshout.cranker        # stop + disable
tail -f /tmp/bigshout-cranker.log                          # watch it work
```

Note: the plists reference this repo's absolute path — regenerate them if the repo moves.

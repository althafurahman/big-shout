# Ops: fully automatic live operation

The web app on Vercel is stateless; the **cranker** is the engine. These launchd services
keep it (and the bot crowd) running unattended on the operator machine: start at login,
restart on crash, logs in `/tmp/bigshout-*.log`.

The cranker is autonomous end to end: it discovers fixtures every 15 minutes, follows the
live SSE score stream, fires cards off real events, drifts odds, settles (proof YES /
expiry NO), sweeps claims, mirrors chain state into Postgres, and executes replay requests
queued from the deployed site. A Postgres advisory lock guarantees only one live cranker
ever runs — a duplicate instance exits immediately.

## Install (one-time, per operator machine)

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

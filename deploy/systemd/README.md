# systemd units — myBeez ops

## `mybeez-backup.{service,timer}`

Daily Postgres dump → R2 via `npm run backup` inside the running
`mybeez-app` container. The script (`scripts/backup-postgres.ts`) is
already wired in the repo; this unit just schedules it.

### Install (one-time, on the Hetzner host)

```bash
sudo cp /opt/mybeez/deploy/systemd/mybeez-backup.service /etc/systemd/system/
sudo cp /opt/mybeez/deploy/systemd/mybeez-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mybeez-backup.timer
```

### Verify

```bash
# Next firing
systemctl list-timers mybeez-backup.timer

# Run once manually (does not affect the schedule)
sudo systemctl start mybeez-backup.service
sudo journalctl -u mybeez-backup.service -n 200 --no-pager
```

### Schedule

`OnCalendar=*-*-* 03:15:00` with `RandomizedDelaySec=1800` → daily
between 03:15 and 03:45 host-local. `Persistent=true` catches up if
the host was offline at the scheduled time (e.g. reboot mid-window).

### Failure mode

`Restart=no` is intentional: the next timer firing will retry. A
persistent backup outage shows up two ways:

- `journalctl -u mybeez-backup.service` will have a non-zero exit
- The R2 listing under `r2mybeez/mybeezdb/` will not advance past 24h

Pair with the `BACKUP_RETENTION_DAYS` env (default 30) and the R2 R/W
keys from `.env.production`.

# UptimeRobot monitor setup

Use this when adding a new city crawler monitor.

## Login

- Open https://dashboard.uptimerobot.com
- Sign in with the user's GitHub account.

## Monitor target

Use the Cloudflare Worker trigger URL:

```text
https://yongin-tennis-worker.ccoo2000.workers.dev/trigger/{city}?token={TRIGGER_TOKEN}
```

Valid city targets currently include:

- `yongin`
- `goyang`
- `suwon`
- `seongnam`
- `anyang`
- `paju`
- `all`

`TRIGGER_TOKEN` is stored as the Worker secret `TRIGGER_TOKEN` and is also available locally as `UPTIMEROBOT_TRIGGER_TOKEN` when configured. Never commit or print the token.

## Monitor settings

- Type: HTTP(s)
- Friendly name: `Tennis crawler - {City}`
- URL: Worker trigger URL above
- Interval: match the existing city crawler monitors
- Expected status: HTTP 200

## Notes

- If an existing `/trigger/all` monitor is active, new city targets included in `crawl_all.yml` are already covered by that monitor.
- Add a dedicated city monitor when the user asks for the city to be updated the same way as the other separate city monitors.
- After creating a monitor, trigger the Worker once and confirm the matching GitHub Actions workflow succeeds.

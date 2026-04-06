# opensearch-link

A lightweight OpenSearch Dashboards plugin that translates short, parameterized URLs into full Discover deep links.

Put human-readable links in your Prometheus alerts — the plugin builds the Discover URL and redirects.

## Usage

```
GET /_dashboards/api/link?<field>=<value>&time=<duration>
```

Any query parameter that isn't a reserved name becomes a `match_phrase` filter on that field in Discover. Use the actual OpenSearch field names directly.

### Reserved Parameters

| Parameter  | Default   | Description                                              |
|------------|-----------|----------------------------------------------------------|
| `index`    | `logs-*`  | Index pattern name (resolved to saved object ID)         |
| `time`     | `15m`     | Relative time range looking back from now (`5m`, `1h`, `24h`, `7d`) |
| `from`     | —         | Absolute start time (ISO 8601). Overrides `time`.        |
| `to`       | `now`     | Absolute end time. Only used with `from`.                |
| `query`    | —         | Free-text KQL query (e.g. `level:ERROR`)                 |
| `columns`  | `message` | Comma-separated columns to display                       |

Everything else is a filter.

### Examples

Pod logs from the last 15 minutes:
```
/api/link?kubernetes.pod.name=api-server-7f8b9c-x4k2p&time=15m
```

Multiple filters:
```
/api/link?kubernetes.pod.name=api-server-7f8b9c&kubernetes.container.name=api&kubernetes.namespace=production&time=1h
```

Absolute time range with query:
```
/api/link?kubernetes.namespace=production&from=2026-04-05T10:00:00Z&to=2026-04-05T10:30:00Z&query=level:ERROR
```

Non-Kubernetes fields work the same way:
```
/api/link?service.name=checkout&trace.id=abc123&columns=message,level,trace.id
```

Custom index:
```
/api/link?host.name=worker-03&index=infra-logs-*&time=1h
```

## Prometheus / Alertmanager Integration

### Alert Rule

```yaml
groups:
  - name: pod-restarts
    rules:
      - alert: PodCrashLooping
        expr: increase(kube_pod_container_status_restarts_total[15m]) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} is crash-looping in {{ $labels.namespace }}"
          logs: "https://opensearch.example.com/_dashboards/api/link?kubernetes.pod.name={{ $labels.pod }}&kubernetes.namespace={{ $labels.namespace }}&kubernetes.container.name={{ $labels.container }}&time=30m"
```

### Alertmanager Template

```yaml
receivers:
  - name: slack
    slack_configs:
      - channel: '#alerts'
        title: '{{ .CommonAnnotations.summary }}'
        text: '<{{ .CommonAnnotations.logs }}|View Logs>'
```

The link in Slack is short, readable, and always resolves to the right Discover view.

## How It Works

```
User/Alertmanager              Plugin                          Discover
    |                            |                                |
    |  GET /api/link             |                                |
    |  ?kubernetes.pod.name=X    |                                |
    |  &time=15m                 |                                |
    |--------------------------->|                                |
    |                            |  1. Parse query params          |
    |                            |  2. Resolve index pattern ID    |
    |                            |  3. Build _g and _a state JSON  |
    |                            |  4. Encode as RISON             |
    |                            |  5. HTTP 302 redirect           |
    |                            |------------------------------->|
    |                            |                                |
    |                            |      User lands on log lines   |
```

1. Every non-reserved query parameter becomes a `match_phrase` filter
2. The `index` parameter (e.g. `logs-*`) is resolved to its saved object UUID via the saved objects API
3. The global state (`_g`) and app state (`_a`) are built as JSON and encoded to RISON
4. The plugin responds with `302 Found` redirecting to `/app/discover#/?_g=...&_a=...`

If the index pattern doesn't exist, the `index` field is omitted and Discover falls back to its default.

## Security Plugin

If the security plugin is enabled (OpenID, SAML, or basic auth), `/api/link` will return `401 Unauthorized` by default. Add the route to the unauthenticated routes list in `opensearch_dashboards.yml`:

```yaml
opensearch_security.auth.unauthenticated_routes: ["/api/link"]
```

The redirect itself is safe to expose — it only builds a Discover URL from the query parameters. After the redirect, Discover will prompt for login as usual.

> **Note:** Setting `unauthenticated_routes` overrides the default whitelist. If your health probe hits `/api/reporting/stats`, include that too:
> ```yaml
> opensearch_security.auth.unauthenticated_routes: ["/api/link", "/api/reporting/stats"]
> ```

## Why Not Use the Built-in Short URL?

OpenSearch Dashboards has `POST /api/shorten_url` + `/goto/{id}`, but:

- You'd have to pre-generate short URLs for every pod/container/namespace combination
- It creates saved objects that accumulate and need cleanup
- The caller needs write permissions to `.opensearch_dashboards`
- URLs are opaque hashes — you can't read or debug them in an alert template

This plugin has no stored state. The URL *is* the state.

## Project Structure

```
opensearch-link/
  opensearch_dashboards.json    # Plugin manifest (server-only, no UI)
  package.json
  tsconfig.json
  server/                       # TypeScript source
    index.ts
    plugin.ts
    types.ts
    routes/redirect.ts
    lib/rison.ts
    lib/state_builder.ts
  build/opensearch-link/        # Pre-built JS (ready to install)
    opensearch_dashboards.json
    package.json
    server/                     # Same structure, compiled to JS
  test/
    test_rison.mjs              # RISON encoder unit tests
    test_integration.js         # Full state builder + URL tests (51 tests)
  docker-compose.yml            # OpenSearch 3.5.0 + Dashboards for testing
  Dockerfile.dashboards         # Builds Dashboards image with plugin
```

## Install

### Option A: Copy pre-built plugin

The `build/opensearch-link/` directory contains the pre-compiled JS plugin. Copy it into your Dashboards plugins directory and restart:

```bash
cp -r build/opensearch-link /usr/share/opensearch-dashboards/plugins/opensearch-link
# restart dashboards
```

### Option B: Docker

```bash
docker compose up --build
```

This starts OpenSearch 3.5.0 + Dashboards with the plugin pre-installed. Dashboards will be at http://localhost:5601.

### Option C: Development (inside OSD source tree)

If you have the OpenSearch-Dashboards repo cloned:

```bash
cp -r opensearch-link /path/to/OpenSearch-Dashboards/plugins/
cd /path/to/OpenSearch-Dashboards
yarn osd bootstrap
yarn start
```

OSD dev mode compiles TypeScript on the fly. The plugin will be available immediately.

> **Version note:** This build targets OpenSearch Dashboards 3.5.0. For other versions,
> update the version in `opensearch_dashboards.json` and `package.json`, then run `./build.sh`.

## Testing

### Unit tests (no OSD needed)

```bash
# RISON encoder tests
node test/test_rison.mjs

# Full integration tests (RISON + state builder + URL construction, 51 tests)
node test/test_integration.js
```

### Manual test against a running Dashboards

1. Start Dashboards with the plugin installed (Docker or dev mode)

2. Create an index pattern if you don't have one:
   ```bash
   curl -X POST "http://localhost:5601/api/saved_objects/index-pattern/test" \
     -H 'osd-xsrf: true' \
     -H 'Content-Type: application/json' \
     -d '{"attributes": {"title": "logs-*", "timeFieldName": "@timestamp"}}'
   ```

3. Test the redirect (follow redirects disabled to inspect the Location header):
   ```bash
   curl -v 'http://localhost:5601/api/link?kubernetes.pod.name=test-pod&time=15m' 2>&1 | grep -i location
   ```
   You should see a `302` with a `Location` header pointing to `/app/discover#/?_g=...&_a=...`.

4. Open it in a browser — paste the full URL and confirm Discover loads with the filter applied:
   ```
   http://localhost:5601/api/link?kubernetes.pod.name=test-pod&time=15m
   ```

5. Test error handling:
   ```bash
   # No filters — should return 400
   curl -s 'http://localhost:5601/api/link' | jq .

   # Query-only (no field filters) — should work
   curl -v 'http://localhost:5601/api/link?query=level:ERROR' 2>&1 | grep -i location
   ```

## License

Apache-2.0

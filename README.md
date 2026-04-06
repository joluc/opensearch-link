# opensearch link

A lightweight OpenSearch Dashboards plugin that translates short, parameterized URLs into full Discover deep links.

Put human-readable links in your Prometheus alerts. The plugin builds the Discover URL and redirects.

## Usage

```
GET /api/link?<field>=<value>&time=<duration>
```

Any query parameter that isn't a reserved name becomes a `match_phrase` filter on that field in Discover. Use the actual OpenSearch field names directly.

### Reserved Parameters

| Parameter  | Default   | Description                                              |
|------------|-----------|----------------------------------------------------------|
| `index`    | `logs-*`  | Index pattern name (resolved to saved object ID)         |
| `time`     | `15m`     | Relative time range looking back from now (`5m`, `1h`, `24h`, `7d`) |
| `from`     |           | Absolute start time (ISO 8601). Overrides `time`.        |
| `to`       | `now`     | Absolute end time. Only used with `from`.                |
| `query`    |           | Free-text KQL query (e.g. `level:ERROR`)                 |
| `columns`  | `message` | Comma-separated columns to display                       |

Everything else is a filter.

### Examples

Pod logs from the last 15 minutes:
```
/api/link?resource.k8s.pod.name=api-server-7f8b9c-x4k2p&time=15m
```

Multiple filters:
```
/api/link?resource.k8s.pod.name=api-server-7f8b9c&resource.k8s.container.name=api&resource.k8s.namespace.name=production&time=1h
```

Absolute time range with query:
```
/api/link?resource.k8s.namespace.name=production&from=2026-04-05T10:00:00Z&to=2026-04-05T10:30:00Z&query=level:ERROR
```

Non Kubernetes fields work the same way:
```
/api/link?service.name=checkout&trace.id=abc123&columns=message,level,trace.id
```

Custom index:
```
/api/link?host.name=worker-03&index=infra-logs-*&time=1h
```

## Prometheus / Alertmanager Integration

Prometheus label names don't match log field names. The URL parameter key is the OpenSearch field, the value comes from the Prometheus label:

| Prometheus label | URL parameter (OpenSearch field) |
|-----------------|----------------------------------|
| `{{ $labels.pod }}` | `resource.k8s.pod.name` |
| `{{ $labels.namespace }}` | `resource.k8s.namespace.name` |
| `{{ $labels.container }}` | `resource.k8s.container.name` |
| `{{ $labels.node }}` | `resource.k8s.node.name` |

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
          summary: "Pod {{ $labels.pod }} is crash looping in {{ $labels.namespace }}"
          logs: >-
            https://opensearch.example.com/api/link
            ?resource.k8s.pod.name={{ $labels.pod }}
            &resource.k8s.namespace.name={{ $labels.namespace }}
            &resource.k8s.container.name={{ $labels.container }}
            &time=30m
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
    |  ?resource.k8s.pod.name=X  |                                |
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

The redirect itself is safe to expose. It only builds a Discover URL from the query parameters. After the redirect, Discover will prompt for login as usual.

> **Note:** Setting `unauthenticated_routes` overrides the default whitelist. If your health probe hits `/api/reporting/stats`, include that too:
> ```yaml
> opensearch_security.auth.unauthenticated_routes: ["/api/link", "/api/reporting/stats"]
> ```

## Why Not Use the Built-in Short URL?

OpenSearch Dashboards has `POST /api/shorten_url` + `/goto/{id}`, but:

- You'd have to pre-generate short URLs for every pod/container/namespace combination
- It creates saved objects that accumulate and need cleanup
- The caller needs write permissions to `.opensearch_dashboards`
- URLs are opaque hashes. You can't read or debug them in an alert template

This plugin has no stored state. The URL *is* the state.

## Install

### Option A: Download release

Download the zip from [GitHub Releases](https://github.com/joluc/opensearch-link/releases) and install:

```bash
bin/opensearch-dashboards-plugin install file:///path/to/opensearch-link-3.5.0.0.zip
```

Or install directly from the URL:

```bash
bin/opensearch-dashboards-plugin install https://github.com/joluc/opensearch-link/releases/download/v3.5.0.0/opensearch-link-3.5.0.0.zip
```

### Option B: Kubernetes Operator

If using the [OpenSearch Kubernetes Operator](https://github.com/opensearch-project/opensearch-k8s-operator), add it to your cluster spec:

```yaml
dashboards:
  pluginsList:
    - https://github.com/joluc/opensearch-link/releases/download/v3.5.0.0/opensearch-link-3.5.0.0.zip
```

### Option C: Docker

```bash
docker compose up --build
```

This starts OpenSearch 3.5.0 + Dashboards with the plugin pre-installed. Dashboards will be at http://localhost:5601.

### Option D: Copy pre-built plugin

The `build/opensearch-link/` directory contains the pre-compiled JS. Copy it into your Dashboards plugins directory and restart:

```bash
cp -r build/opensearch-link /usr/share/opensearch-dashboards/plugins/opensearch-link
```

> **Version note:** This build targets OpenSearch Dashboards 3.5.0. For other versions,
> update the version in `opensearch_dashboards.json` and `package.json`, then run `./build.sh`.

## Testing

```bash
node test/test_rison.mjs
node test/test_integration.js
```

## License

Apache 2.0

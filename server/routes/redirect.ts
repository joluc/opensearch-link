import { CoreSetup, IRouter, Logger } from '../../../../src/core/server';
import { buildDiscoverUrl } from '../lib/state_builder';
import { RESERVED_PARAMS } from '../types';

export function defineRoutes(router: IRouter, core: CoreSetup, logger: Logger) {
  router.get(
    {
      path: '/api/link',
      validate: false,
    },
    async (context, request, response) => {
      // OSD's request.url may be a legacy Url object (no .searchParams).
      // Parse it as a WHATWG URL to reliably access query parameters.
      const rawUrl = request.url.href || request.url.path || request.url.pathname + (request.url.search || '');
      const url = new URL(rawUrl, 'http://localhost');
      const query: Record<string, string> = {};

      for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
      }

      // Check that at least one filter or query is provided
      const hasFilter = Object.keys(query).some((k) => !RESERVED_PARAMS.has(k));
      const hasQuery = query.query && query.query.length > 0;

      if (!hasFilter && !hasQuery) {
        return response.badRequest({
          body: {
            message:
              'At least one filter parameter or query is required. ' +
              'Any parameter that is not a reserved name (index, time, from, to, query, columns) ' +
              'becomes a match_phrase filter. Example: /api/link?kubernetes.pod.name=my-pod&time=15m',
          },
        });
      }

      // Resolve index pattern name to saved object ID
      const indexName = query.index || 'logs-*';
      let indexPatternId: string | undefined;

      try {
        const client = context.core.savedObjects.client;
        const result = await client.find({
          type: 'index-pattern',
          perPage: 1000,
        });

        if (result.total > 1000) {
          logger.warn(
            `opensearch-link: ${result.total} index patterns found but only first 1000 checked`
          );
        }

        const match = result.saved_objects.find(
          (obj: { attributes: Record<string, unknown> }) =>
            obj.attributes.title === indexName
        );

        if (match) {
          indexPatternId = match.id;
        } else {
          logger.warn(
            `opensearch-link: no index pattern found for "${indexName}", redirecting without index`
          );
        }
      } catch (err) {
        logger.error(`opensearch-link: failed to resolve index pattern: ${err}`);
        // Continue without index — Discover will use its default
      }

      const discoverPath = buildDiscoverUrl(query, indexPatternId);

      // Prepend the basePath so the redirect works behind /_dashboards/ or any other prefix
      const basePath = core.http.basePath.get(request);
      const location = `${basePath}${discoverPath}`;

      return response.redirected({
        headers: { location },
      });
    }
  );
}

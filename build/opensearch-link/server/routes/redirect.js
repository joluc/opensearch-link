"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineRoutes = defineRoutes;

const { buildDiscoverUrl } = require('../lib/state_builder');
const { RESERVED_PARAMS } = require('../types');

function defineRoutes(router, core, logger) {
  router.get(
    {
      path: '/api/link',
      validate: false,
      options: { authRequired: 'optional' },
    },
    async (context, request, response) => {
      // OSD's request.url may be a legacy Url object (no .searchParams).
      // Parse it as a WHATWG URL to reliably access query parameters.
      const rawUrl = request.url.href || request.url.path || request.url.pathname + (request.url.search || '');
      const url = new URL(rawUrl, 'http://localhost');
      const query = {};

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
      let indexPatternId;

      try {
        const soClient = context.core.savedObjects?.client;
        if (!soClient) {
          logger.debug('opensearch-link: no saved objects client (unauthenticated request), skipping index resolution');
        } else {
          const result = await soClient.find({
            type: 'index-pattern',
            perPage: 1000,
          });

          if (result.total > 1000) {
            logger.warn(
              `opensearch-link: ${result.total} index patterns found but only first 1000 checked`
            );
          }

          const match = result.saved_objects.find(
            (obj) => obj.attributes.title === indexName
          );

          if (match) {
            indexPatternId = match.id;
          } else {
            logger.warn(
              `opensearch-link: no index pattern found for "${indexName}", redirecting without index`
            );
          }
        }
      } catch (err) {
        logger.error(`opensearch-link: failed to resolve index pattern: ${err}`);
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

import { Router, Request, Response } from 'express';

const router = Router();

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Incident War Room API',
    version: '1.0.0',
    description: 'Multi-tenant incident response platform — REST API.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey:    { type: 'apiKey', in: 'header', name: 'Authorization' },
    },
    schemas: {
      Incident: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          title:       { type: 'string' },
          description: { type: 'string' },
          severity:    { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] },
          status:      { type: 'string', enum: ['open', 'investigating', 'resolved', 'closed'] },
          commander_id:{ type: 'string', format: 'uuid', nullable: true },
          created_at:  { type: 'string', format: 'date-time' },
          resolved_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: { success: { type: 'boolean' }, error: { type: 'string' } },
      },
    },
  },
  security: [{ bearerAuth: [] }, { apiKey: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email/password',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email','password'],
          properties: { email: {type:'string',format:'email'}, password: {type:'string'} }
        }}}},
        responses: { '200': { description: 'Returns JWT pair' }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/auth/register': {
      post: { tags: ['Auth'], summary: 'Register new tenant + owner user', security: [],
        responses: { '201': { description: 'Created' } } },
    },
    '/incidents': {
      get: {
        tags: ['Incidents'], summary: 'List incidents',
        responses: { '200': { description: 'List of incidents' } },
      },
      post: {
        tags: ['Incidents'], summary: 'Create incident',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['title','description','severity'],
          properties: {
            title: {type:'string'}, description: {type:'string'},
            severity: {type:'string', enum:['P1','P2','P3','P4']},
          }
        }}}},
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Incident' } } } } },
      },
    },
    '/incidents/{id}': {
      get: { tags: ['Incidents'], summary: 'Get incident',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Incident', content: { 'application/json': { schema: { $ref: '#/components/schemas/Incident' } } } } } },
      patch: { tags: ['Incidents'], summary: 'Update incident',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Updated' } } },
    },
    '/incidents/search': {
      post: { tags: ['Incidents'], summary: 'Advanced search with filters',
        requestBody: { content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Full-text query' },
            status: { type: 'array', items: { type: 'string' } },
            severity: { type: 'array', items: { type: 'string' } },
            tag_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            limit: { type: 'integer' },
          }
        }}}},
        responses: { '200': { description: 'Search results' } } },
    },
    '/incidents/bulk': {
      post: { tags: ['Incidents'], summary: 'Bulk action (close/assign/severity/tag)',
        responses: { '200': { description: 'Updated count' } } },
    },
    '/incidents/import': {
      post: { tags: ['Incidents'], summary: 'Import incidents from CSV',
        requestBody: { content: { 'text/csv': { schema: { type: 'string' } } } },
        responses: { '200': { description: 'Import summary' } } },
    },
    '/incidents/{id}/comments': {
      get:  { tags: ['Comments'], summary: 'List comments',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'OK' } } },
      post: { tags: ['Comments'], summary: 'Add comment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '201': { description: 'Created' } } },
    },
    '/tags': {
      get:  { tags: ['Tags'], summary: 'List tags', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Tags'], summary: 'Create tag', responses: { '201': { description: 'Created' } } },
    },
    '/escalations/policies': {
      get: { tags: ['Escalations'], summary: 'List escalation policies', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Escalations'], summary: 'Create policy', responses: { '201': { description: 'Created' } } },
    },
    '/oncall/schedules': {
      get: { tags: ['On-Call'], summary: 'List on-call schedules', responses: { '200': { description: 'OK' } } },
    },
    '/webhooks': {
      get:  { tags: ['Webhooks'], summary: 'List webhooks', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Webhooks'], summary: 'Create webhook (Slack/Teams URLs auto-formatted)', responses: { '201': { description: 'Created' } } },
    },
    '/api-keys': {
      get:  { tags: ['API Keys'], summary: 'List service tokens', responses: { '200': { description: 'OK' } } },
      post: { tags: ['API Keys'], summary: 'Generate service token', responses: { '201': { description: 'Created (key shown once)' } } },
    },
    '/notification-prefs': {
      get: { tags: ['Notifications'], summary: 'Get my notification prefs', responses: { '200': { description: 'OK' } } },
      put: { tags: ['Notifications'], summary: 'Update my notification prefs', responses: { '200': { description: 'Updated' } } },
    },
    '/presence/incidents/{id}/heartbeat': {
      post: { tags: ['Presence'], summary: 'Heartbeat (call every 25s)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'OK' } } },
    },
    '/ai/postmortem/{id}': {
      post: { tags: ['AI'], summary: 'Generate AI postmortem (Claude)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Markdown postmortem' } } },
    },
    '/metrics': {
      get: { tags: ['Metrics'], summary: 'Tenant metrics (MTTR, MTTA, count by severity)',
        responses: { '200': { description: 'Metrics summary' } } },
    },
  },
};

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

router.get('/docs', (_req: Request, res: Response) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Incident War Room API — Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body{margin:0;background:#fafafa;}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/v1/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
      persistAuthorization: true,
    });
  </script>
</body>
</html>`);
});

export default router;

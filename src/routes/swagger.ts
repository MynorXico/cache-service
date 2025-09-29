/**
 * Swagger UI integration for API documentation
 */

import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { join } from 'path';

export function createSwaggerRoutes(enableSwagger: boolean): Router {
  const router = Router();

  if (!enableSwagger) {
    // Return empty router if Swagger is disabled
    return router;
  }

  try {
    // Load OpenAPI specification
    const openApiPath = join(process.cwd(), 'openapi.yaml');
    const openApiSpec = readFileSync(openApiPath, 'utf8');

    // Parse YAML to JSON (simple YAML parser for basic spec)
    const spec = parseSimpleYaml(openApiSpec);

    // Setup Swagger UI
    router.use('/docs', swaggerUi.serve);
    router.get(
      '/docs',
      swaggerUi.setup(spec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Cache Service API Documentation',
        swaggerOptions: {
          displayRequestDuration: true,
          tryItOutEnabled: true,
          requestInterceptor: (req: any) => {
            // Add API token header for try-it-out functionality
            if (!req.headers['X-API-Token']) {
              req.headers['X-API-Token'] = 'your-api-token-here';
            }
            return req;
          },
        },
      })
    );

    // Serve raw OpenAPI spec
    router.get('/openapi.json', (req, res) => {
      res.json(spec);
    });

    router.get('/openapi.yaml', (req, res) => {
      res.type('text/yaml').send(openApiSpec);
    });
  } catch (error) {
    console.warn('Failed to load OpenAPI spec, Swagger UI disabled:', error.message);
  }

  return router;
}

/**
 * Simple YAML parser for basic OpenAPI specs
 * In production, you'd use a proper YAML library like js-yaml
 */
function parseSimpleYaml(yamlString: string): any {
  // This is a very basic YAML parser - in production use js-yaml
  const lines = yamlString.split('\n');
  const result: any = {};
  let currentPath: string[] = [];
  let currentObject = result;

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();

    if (content.includes(':')) {
      const [key, ...valueParts] = content.split(':');
      const value = valueParts.join(':').trim();

      // Adjust current path based on indentation
      const level = Math.floor(indent / 2);
      currentPath = currentPath.slice(0, level);

      // Navigate to current object
      currentObject = result;
      for (const pathKey of currentPath) {
        currentObject = currentObject[pathKey];
      }

      if (value === '') {
        // Object key
        currentObject[key] = {};
        currentPath.push(key);
      } else {
        // Value key
        currentObject[key] = parseYamlValue(value);
      }
    }
  }

  return result;
}

function parseYamlValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

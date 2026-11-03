import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Vite Dev Server Backend Route for Judge0 API
 * Keeps API keys completely private on the backend server.
 */
function judge0BackendPlugin() {
  return {
    name: 'judge0-backend-plugin',
    configureServer(server) {
      server.middlewares.use('/api/compile', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const { code, stdin = '', language_id = 50 } = JSON.parse(body || '{}');

            // Secure endpoint & key stored on server / environment variables
            const judge0BaseUrl = process.env.JUDGE0_URL || 'https://ce.judge0.com';
            const endpoint = `${judge0BaseUrl.replace(/\/+$/, '')}/submissions?base64_encoded=true&wait=true`;

            const headers = {
              'Content-Type': 'application/json',
            };

            const apiKey = process.env.JUDGE0_KEY || process.env.RAPIDAPI_KEY;
            if (apiKey) {
              headers['X-Auth-Token'] = apiKey;
              headers['X-RapidAPI-Key'] = apiKey;
              headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
            }

            const response = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                source_code: Buffer.from(code || '', 'utf-8').toString('base64'),
                language_id: Number(language_id) || 50,
                stdin: Buffer.from(stdin || '', 'utf-8').toString('base64'),
              }),
            });

            const data = await response.json();

            // Decode base64 responses to UTF-8
            const decodeB64 = (val) => {
              if (!val || typeof val !== 'string') return val;
              try {
                return Buffer.from(val, 'base64').toString('utf-8');
              } catch {
                return val;
              }
            };

            const result = {
              ...data,
              stdout: decodeB64(data.stdout),
              compile_output: decodeB64(data.compile_output),
              stderr: decodeB64(data.stderr),
              message: decodeB64(data.message),
            };

            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/CodeLife-Your-Daily-Coading-Partner/',
  plugins: [react(), judge0BackendPlugin()],
})

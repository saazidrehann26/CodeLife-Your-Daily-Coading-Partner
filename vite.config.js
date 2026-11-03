import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'

/**
 * Vite Dev Server Backend API Plugin
 * Handles /api/compile (Judge0) and /api/auth/* (Supabase Admin)
 * Keeps all SECRET KEYS strictly on the server and NEVER leaks them to the browser client.
 */
function backendApiPlugin() {
  let supabaseAdmin = null;

  return {
    name: 'backend-api-plugin',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      const supabaseUrl = env.SUPABASE_URL || 'https://dbbkdoaemwuoducpvxog.supabase.co';
      const supabaseSecretKey = env.SUPABASE_SECRET_KEY;

      if (supabaseSecretKey) {
        supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      }
    },
    configureServer(server) {
      // Helper to parse JSON body
      const parseJsonBody = (req) =>
        new Promise((resolve) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              resolve(JSON.parse(body || '{}'));
            } catch {
              resolve({});
            }
          });
        });

      // Helper to find user in Supabase
      const findUserInSupabase = async (identifier) => {
        if (!supabaseAdmin || !identifier) return null;
        const clean = identifier.trim().toLowerCase();
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (error || !Array.isArray(users)) return null;
        return (
          users.find(
            (u) =>
              u.email?.toLowerCase() === clean ||
              u.user_metadata?.username?.toLowerCase() === clean
          ) || null
        );
      };

      // 1. /api/auth/check-user
      server.middlewares.use('/api/auth/check-user', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
        res.setHeader('Content-Type', 'application/json');
        const { identifier } = await parseJsonBody(req);
        const user = await findUserInSupabase(identifier);
        if (!user) {
          return res.end(JSON.stringify({ exists: false, user: null }));
        }
        return res.end(
          JSON.stringify({
            exists: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.name || '',
              username: user.user_metadata?.username || '',
              institution: user.user_metadata?.institution || '',
              trustedDevices: Array.isArray(user.user_metadata?.trustedDevices)
                ? user.user_metadata.trustedDevices
                : [],
            },
          })
        );
      });

      // 2. /api/auth/register
      server.middlewares.use('/api/auth/register', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
        res.setHeader('Content-Type', 'application/json');
        if (!supabaseAdmin) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: 'Supabase admin not available' }));
        }

        const { name, username, email, institution, password, deviceId } = await parseJsonBody(req);
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanUser = (username || '').trim().toLowerCase();

        const existing = await findUserInSupabase(cleanEmail);
        if (existing) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Email already registered' }));
        }

        const trustedDevices = deviceId ? [deviceId] : [];
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: password.trim(),
          email_confirm: true,
          user_metadata: {
            name: (name || '').trim(),
            username: cleanUser,
            institution: (institution || '').trim(),
            trustedDevices,
            createdAt: new Date().toISOString(),
          },
        });

        if (error) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: error.message }));
        }

        return res.end(JSON.stringify({ success: true, user: data.user }));
      });

      // 3. /api/auth/trust-device
      server.middlewares.use('/api/auth/trust-device', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
        res.setHeader('Content-Type', 'application/json');
        const { identifier, deviceId } = await parseJsonBody(req);
        const user = await findUserInSupabase(identifier);
        if (!user) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'User not found' }));
        }

        const current = Array.isArray(user.user_metadata?.trustedDevices)
          ? user.user_metadata.trustedDevices
          : [];
        const updated = [...new Set([...current, deviceId])];

        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            trustedDevices: updated,
            lastLoginDevice: deviceId,
            lastLoginAt: new Date().toISOString(),
          },
        });

        if (error) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: error.message }));
        }
        return res.end(JSON.stringify({ success: true, trustedDevices: updated }));
      });

      // 4. /api/auth/update-password
      server.middlewares.use('/api/auth/update-password', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
        res.setHeader('Content-Type', 'application/json');
        const { identifier, newPassword } = await parseJsonBody(req);
        const user = await findUserInSupabase(identifier);
        if (!user) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'User not found' }));
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: newPassword.trim(),
        });

        if (error) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: error.message }));
        }
        return res.end(JSON.stringify({ success: true }));
      });

      // 5. /api/auth/users
      server.middlewares.use('/api/auth/users', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (!supabaseAdmin) {
          return res.end(JSON.stringify({ users: [] }));
        }
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (error) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: error.message }));
        }
        const sanitized = (users || []).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.name || '',
          username: u.user_metadata?.username || '',
          institution: u.user_metadata?.institution || '',
          trustedDevices: Array.isArray(u.user_metadata?.trustedDevices)
            ? u.user_metadata.trustedDevices
            : [],
        }));
        return res.end(JSON.stringify({ users: sanitized }));
      });

      // 6. /api/compile (Judge0 API)
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
  plugins: [react(), backendApiPlugin()],
})

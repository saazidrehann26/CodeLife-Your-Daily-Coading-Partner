import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

/**
 * Vite Dev Server Backend API Plugin
 * Handles all backend endpoints for Vite development server:
 * - /api/compile (Judge0)
 * - /api/auth/* (Supabase Admin & User verification)
 * - /api/users/* (Search & sanitized public profile)
 * - /api/circles, /api/circles/sync, /api/circles/join
 * - /api/invites, /api/invites/:username, /api/invites/respond
 *
 * Keeps all SECRET KEYS strictly on the server and NEVER leaks them to the client.
 */
function backendApiPlugin() {
  let supabaseAdmin = null;

  const CIRCLES_FILE = path.resolve(process.cwd(), 'circles_db.json');
  const INVITES_FILE = path.resolve(process.cwd(), 'invites_db.json');

  function loadCirclesFromFile() {
    try {
      if (fs.existsSync(CIRCLES_FILE)) {
        const data = JSON.parse(fs.readFileSync(CIRCLES_FILE, 'utf8'));
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error('[Vite API] Error reading circles DB file:', err);
    }
    return [];
  }

  function saveCirclesToFile(circles) {
    try {
      fs.writeFileSync(CIRCLES_FILE, JSON.stringify(circles, null, 2), 'utf8');
    } catch (err) {
      console.error('[Vite API] Error saving circles DB file:', err);
    }
  }

  function loadInvitesFromFile() {
    try {
      if (fs.existsSync(INVITES_FILE)) {
        const data = JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error('[Vite API] Error reading invites DB file:', err);
    }
    return [];
  }

  function saveInvitesToFile(invites) {
    try {
      fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), 'utf8');
    } catch (err) {
      console.error('[Vite API] Error saving invites DB file:', err);
    }
  }

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

      // Main API middleware interceptor
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost');
        let pathname = parsedUrl.pathname;

        // Normalize base prefix if present
        if (pathname.startsWith('/CodeLife-Your-Daily-Coading-Partner/api')) {
          pathname = pathname.replace('/CodeLife-Your-Daily-Coading-Partner', '');
        }

        // Only handle /api paths
        if (!pathname.startsWith('/api/')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        try {
          // -----------------------------------------------------------------
          // 1. Auth routes
          // -----------------------------------------------------------------
          if (pathname === '/api/auth/check-user' && req.method === 'POST') {
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
          }

          if (pathname === '/api/auth/register' && req.method === 'POST') {
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
          }

          if (pathname === '/api/auth/trust-device' && req.method === 'POST') {
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
          }

          if (pathname === '/api/auth/update-password' && req.method === 'POST') {
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
          }

          if (pathname === '/api/auth/users' && req.method === 'GET') {
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
                ? user_metadata.trustedDevices
                : [],
            }));
            return res.end(JSON.stringify({ users: sanitized }));
          }

          if (pathname === '/api/auth/delete-user' && req.method === 'POST') {
            const { identifier } = await parseJsonBody(req);
            if (!identifier) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Identifier is required' }));
            }
            if (!supabaseAdmin) {
              return res.end(JSON.stringify({ success: true, message: 'Deleted locally' }));
            }
            const user = await findUserInSupabase(identifier);
            if (user && user.id) {
              const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
              if (error) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: error.message }));
              }
            }
            return res.end(JSON.stringify({ success: true, deleted: true }));
          }

          // -----------------------------------------------------------------
          // 2. User Search & Public Profile routes
          // -----------------------------------------------------------------
          if (pathname === '/api/users/search' && req.method === 'GET') {
            const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
            const offset = Math.max(0, parseInt(parsedUrl.searchParams.get('offset') || '0', 10) || 0);
            const limit = Math.min(25, Math.max(1, parseInt(parsedUrl.searchParams.get('limit') || '10', 10) || 10));

            if (q.length < 2) {
              return res.end(JSON.stringify({ results: [], total: 0, hasMore: false }));
            }

            let users = [];
            if (supabaseAdmin) {
              const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
              if (!error && Array.isArray(data?.users)) {
                users = data.users.map((u) => ({
                  username: u.user_metadata?.username || '',
                  name: u.user_metadata?.name || '',
                  photoUrl: u.user_metadata?.photoUrl || '/codelife_logo_white_bg.png',
                  institution: u.user_metadata?.institution || 'Not specified',
                  classGrade: u.user_metadata?.classGrade || 'Not specified',
                  privacySettings: u.user_metadata?.privacySettings || { showInstitution: true, showStats: true },
                }));
              }
            }

            const matched = users.filter((u) => {
              const uname = (u.username || '').toLowerCase();
              const name = (u.name || '').toLowerCase();
              return uname.includes(q) || name.includes(q);
            });

            const sliced = matched.slice(offset, offset + limit);
            const results = sliced.map((u) => ({
              username: u.username,
              name: u.name,
              photoUrl: u.photoUrl,
              institution: u.privacySettings?.showInstitution !== false ? u.institution : 'Hidden by user',
              classGrade: u.privacySettings?.showInstitution !== false ? u.classGrade : 'Hidden by user',
            }));

            return res.end(
              JSON.stringify({
                results,
                total: matched.length,
                hasMore: offset + limit < matched.length,
              })
            );
          }

          if (pathname.startsWith('/api/users/') && pathname.endsWith('/public-profile') && req.method === 'GET') {
            const parts = pathname.split('/');
            const targetUsername = decodeURIComponent(parts[3] || '').trim().toLowerCase();
            if (!targetUsername) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Username is required' }));
            }

            let found = null;
            if (supabaseAdmin) {
              const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
              if (!error && Array.isArray(data?.users)) {
                found = data.users.find(
                  (u) => (u.user_metadata?.username || '').toLowerCase() === targetUsername
                );
              }
            }

            if (!found) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'User not found' }));
            }

            const uMeta = found.user_metadata || {};
            const privacy = uMeta.privacySettings || { showInstitution: true, showStats: true, allowStrangerInvites: true };

            const sanitized = {
              username: uMeta.username || '',
              name: uMeta.name || uMeta.username || '',
              photoUrl: uMeta.photoUrl || '/codelife_logo_white_bg.png',
              institution: privacy.showInstitution !== false ? (uMeta.institution || 'Not specified') : 'Hidden by user',
              classGrade: privacy.showInstitution !== false ? (uMeta.classGrade || 'Not specified') : 'Hidden by user',
              bio: uMeta.bio || '',
              totalProblemsSolved: privacy.showStats !== false ? (uMeta.totalProblemsSolved || 0) : null,
              currentStreak: privacy.showStats !== false ? (uMeta.currentStreak || 0) : null,
              longestStreak: privacy.showStats !== false ? (uMeta.longestStreak || 0) : null,
              matchesPlayed: privacy.showStats !== false ? (uMeta.matchesPlayed || 0) : null,
              matchesWon: privacy.showStats !== false ? (uMeta.matchesWon || 0) : null,
              memberSince: uMeta.createdAt ? new Date(uMeta.createdAt).toLocaleDateString() : 'Recent member',
              allowStrangerInvites: privacy.allowStrangerInvites !== false,
              showInstitution: privacy.showInstitution !== false,
              showStats: privacy.showStats !== false,
            };

            return res.end(JSON.stringify({ success: true, profile: sanitized }));
          }

          // -----------------------------------------------------------------
          // 3. Circle routes
          // -----------------------------------------------------------------
          if (pathname === '/api/circles' && req.method === 'GET') {
            const circles = loadCirclesFromFile();
            return res.end(JSON.stringify({ success: true, circles }));
          }

          if (pathname === '/api/circles' && req.method === 'POST') {
            const circle = await parseJsonBody(req);
            if (!circle || !circle.id || !circle.name) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Valid circle object required' }));
            }
            const circles = loadCirclesFromFile();
            const idx = circles.findIndex((c) => c.id === circle.id);
            if (idx !== -1) {
              circles[idx] = { ...circles[idx], ...circle };
            } else {
              circles.unshift(circle);
            }
            saveCirclesToFile(circles);
            return res.end(JSON.stringify({ success: true, circle: circles[idx !== -1 ? idx : 0] }));
          }

          if (pathname === '/api/circles/sync' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const incoming = Array.isArray(body?.circles) ? body.circles : [];
            const serverCircles = loadCirclesFromFile();
            const circleMap = new Map();

            for (const c of serverCircles) {
              if (c && c.id) circleMap.set(c.id, c);
            }

            for (const inc of incoming) {
              if (!inc || !inc.id) continue;
              if (!circleMap.has(inc.id)) {
                circleMap.set(inc.id, inc);
              } else {
                const existing = circleMap.get(inc.id);
                const existingMembers = Array.isArray(existing.members) ? existing.members : [];
                const incMembers = Array.isArray(inc.members) ? inc.members : [];
                const memberMap = new Map();
                for (const m of existingMembers) {
                  if (m?.username) memberMap.set(m.username.toLowerCase(), m);
                }
                for (const m of incMembers) {
                  if (m?.username && !memberMap.has(m.username.toLowerCase())) {
                    memberMap.set(m.username.toLowerCase(), m);
                  }
                }
                circleMap.set(inc.id, {
                  ...existing,
                  ...inc,
                  members: Array.from(memberMap.values()),
                });
              }
            }

            const merged = Array.from(circleMap.values());
            saveCirclesToFile(merged);
            return res.end(JSON.stringify({ success: true, circles: merged }));
          }

          if (pathname === '/api/circles/join' && req.method === 'POST') {
            const { username, inviteCode } = await parseJsonBody(req);
            if (!username || !inviteCode) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Username and invite code are required.' }));
            }
            const cleanUser = username.trim().toLowerCase();
            const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

            const circles = loadCirclesFromFile();
            const circleIndex = circles.findIndex((c) => (c.inviteCode || '').toUpperCase() === cleanCode);

            if (circleIndex === -1) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Circle not found. Please verify the 6-character invite code.' }));
            }

            const circle = circles[circleIndex];
            const members = Array.isArray(circle.members) ? circle.members : [];

            if (members.some((m) => (m.username || '').toLowerCase() === cleanUser)) {
              return res.end(JSON.stringify({ success: true, circle, message: 'Already a member' }));
            }

            const max = circle.maxMembers || 50;
            if (members.length >= max) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: `This circle is full (max ${max} members reached).` }));
            }

            const updatedCircle = {
              ...circle,
              members: [
                ...members,
                {
                  username: cleanUser,
                  role: 'member',
                  joinedAt: new Date().toISOString(),
                },
              ],
            };

            circles[circleIndex] = updatedCircle;
            saveCirclesToFile(circles);

            // Clear any pending invite for this user
            const invites = loadInvitesFromFile().filter(
              (inv) => !((inv.targetUsername || '').toLowerCase() === cleanUser && inv.circleId === circle.id)
            );
            saveInvitesToFile(invites);

            return res.end(JSON.stringify({ success: true, circle: updatedCircle }));
          }

          // -----------------------------------------------------------------
          // 4. Invite routes
          // -----------------------------------------------------------------
          if (pathname.startsWith('/api/invites/') && pathname !== '/api/invites/respond' && req.method === 'GET') {
            const clean = pathname.replace('/api/invites/', '').trim().toLowerCase();
            const allInvites = loadInvitesFromFile();
            const userInvites = allInvites.filter(
              (inv) => (inv.targetUsername || '').toLowerCase() === clean && inv.status === 'pending'
            );
            return res.end(JSON.stringify({ success: true, invites: userInvites }));
          }

          if (pathname === '/api/invites' && req.method === 'POST') {
            const invite = await parseJsonBody(req);
            if (!invite || !invite.circleId || !invite.targetUsername) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Valid invite payload required' }));
            }
            const allInvites = loadInvitesFromFile();
            const existingIdx = allInvites.findIndex(
              (i) => i.id === invite.id || (i.circleId === invite.circleId && (i.targetUsername || '').toLowerCase() === (invite.targetUsername || '').toLowerCase())
            );
            if (existingIdx !== -1) {
              allInvites[existingIdx] = invite;
            } else {
              allInvites.unshift(invite);
            }
            saveInvitesToFile(allInvites);
            return res.end(JSON.stringify({ success: true, invite }));
          }

          if (pathname === '/api/invites/respond' && req.method === 'POST') {
            const { username, inviteId, accept } = await parseJsonBody(req);
            if (!username || !inviteId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Username and inviteId are required' }));
            }
            const cleanUser = username.trim().toLowerCase();
            const allInvites = loadInvitesFromFile();
            const invite = allInvites.find((i) => i.id === inviteId);
            const remaining = allInvites.filter((i) => i.id !== inviteId);
            saveInvitesToFile(remaining);

            if (accept && invite) {
              const circles = loadCirclesFromFile();
              const cIdx = circles.findIndex((c) => c.id === invite.circleId);
              if (cIdx !== -1) {
                const circle = circles[cIdx];
                const members = Array.isArray(circle.members) ? circle.members : [];
                if (!members.some((m) => (m.username || '').toLowerCase() === cleanUser)) {
                  circles[cIdx] = {
                    ...circle,
                    members: [...members, { username: cleanUser, role: 'member', joinedAt: new Date().toISOString() }],
                  };
                  saveCirclesToFile(circles);
                  return res.end(JSON.stringify({ success: true, circle: circles[cIdx] }));
                }
                return res.end(JSON.stringify({ success: true, circle }));
              }
            }

            return res.end(JSON.stringify({ success: true }));
          }

          // -----------------------------------------------------------------
          // 5. /api/compile (Judge0 API)
          // -----------------------------------------------------------------
          if (pathname === '/api/compile' && req.method === 'POST') {
            const { code, stdin = '', language_id = 50 } = await parseJsonBody(req);
            const judge0BaseUrl = process.env.JUDGE0_URL || 'https://ce.judge0.com';
            const endpoint = `${judge0BaseUrl.replace(/\/+$/, '')}/submissions?base64_encoded=true&wait=true`;

            const headers = { 'Content-Type': 'application/json' };
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
            return res.end(JSON.stringify(result));
          }

          // Any other unrecognized /api route
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
        } catch (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/CodeLife-Your-Daily-Coading-Partner/',
  plugins: [react(), backendApiPlugin()],
})

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
  const DELETED_CIRCLES_FILE = path.resolve(process.cwd(), 'deleted_circles_db.json');
  const BATTLES_FILE = path.resolve(process.cwd(), 'battles_db.json');
  const BATTLE_REQUESTS_FILE = path.resolve(process.cwd(), 'battle_requests_db.json');

  function loadDeletedCirclesFromFile() {
    try {
      if (fs.existsSync(DELETED_CIRCLES_FILE)) {
        const data = JSON.parse(fs.readFileSync(DELETED_CIRCLES_FILE, 'utf8'));
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error('[Vite API] Error reading deleted circles DB file:', err);
    }
    return [];
  }

  function saveDeletedCirclesToFile(ids) {
    try {
      fs.writeFileSync(DELETED_CIRCLES_FILE, JSON.stringify(ids, null, 2), 'utf8');
    } catch (err) {
      console.error('[Vite API] Error saving deleted circles DB file:', err);
    }
  }

  function loadBattlesFromFile() {
    try {
      if (fs.existsSync(BATTLES_FILE)) {
        const data = JSON.parse(fs.readFileSync(BATTLES_FILE, 'utf8'));
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error('[Vite API] Error reading battles DB file:', err);
    }
    return [];
  }

  function saveBattlesToFile(battles) {
    try {
      fs.writeFileSync(BATTLES_FILE, JSON.stringify(battles, null, 2), 'utf8');
    } catch (err) {
      console.error('[Vite API] Error saving battles DB file:', err);
    }
  }

  function loadBattleRequestsFromFile() {
    try {
      if (fs.existsSync(BATTLE_REQUESTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(BATTLE_REQUESTS_FILE, 'utf8'));
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error('[Vite API] Error reading battle requests DB file:', err);
    }
    return [];
  }

  function saveBattleRequestsToFile(requests) {
    try {
      fs.writeFileSync(BATTLE_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
      console.error('[Vite API] Error saving battle requests DB file:', err);
    }
  }

  const battleSSEConnections = new Map();

  function broadcastBattleEvent(battleId, eventData) {
    const listeners = battleSSEConnections.get(battleId);
    if (listeners && listeners.size > 0) {
      const payload = `data: ${JSON.stringify(eventData)}\n\n`;
      for (const clientRes of listeners) {
        try {
          clientRes.write(payload);
        } catch {
          listeners.delete(clientRes);
        }
      }
    }
  }

  function sanitizeBattleForUser(battle, username) {
    if (!battle) return null;
    const clean = (username || '').trim().toLowerCase().replace(/^@/, '');
    const isTeamAMember = battle.teams?.teamA?.members?.some((m) => m.username?.toLowerCase() === clean);
    const isTeamBMember = battle.teams?.teamB?.members?.some((m) => m.username?.toLowerCase() === clean);
    const isSpectator = !isTeamAMember && !isTeamBMember;
    const userTeamKey = isTeamAMember ? 'teamA' : isTeamBMember ? 'teamB' : null;
    const isBattleFinished = battle.phase === 'FINISHED';

    const clone = JSON.parse(JSON.stringify(battle));

    if (!isBattleFinished) {
      if (userTeamKey === 'teamA') {
        clone.teams.teamB.code = '// Opponent code is hidden to ensure fair competition';
        clone.teams.teamB.output = '';
        for (const r of clone.rounds || []) {
          if (r.teamBChallenge) {
            r.teamBChallenge.referenceSolution = '[Protected]';
            r.teamBChallenge.testCases = (r.teamBChallenge.testCases || []).filter((tc) => tc.isSample);
          }
        }
      } else if (userTeamKey === 'teamB') {
        clone.teams.teamA.code = '// Opponent code is hidden to ensure fair competition';
        clone.teams.teamA.output = '';
        for (const r of clone.rounds || []) {
          if (r.teamAChallenge) {
            r.teamAChallenge.referenceSolution = '[Protected]';
            r.teamAChallenge.testCases = (r.teamAChallenge.testCases || []).filter((tc) => tc.isSample);
          }
        }
      } else if (isSpectator && !battle.settings?.allowSpectators) {
        clone.teams.teamA.code = '// Spectator view disabled by match admin';
        clone.teams.teamB.code = '// Spectator view disabled by match admin';
      }
    }

    clone.viewer = {
      username: clean,
      isTeamAMember,
      isTeamBMember,
      isSpectator,
      teamKey: userTeamKey,
    };

    return clone;
  }

  function checkAndUpdateBattleTimeouts(battle) {
    if (!battle || !battle.phaseEndTime) return false;
    const now = Date.now();
    const end = new Date(battle.phaseEndTime).getTime();
    if (now < end) return false;

    const currentRound = battle.rounds[battle.currentRound - 1];

    if (battle.phase === 'AUTHORING') {
      if (!currentRound.teamAChallenge?.published) {
        currentRound.teamAChallenge = {
          id: `fb_${Date.now()}_teamA`,
          authorTeam: 'teamA',
          authorUsername: 'CodeLife Auto-Judge',
          title: 'Two Sum Problem',
          description: 'Given an array of integers and target, find two numbers summing to target.',
          constraints: 'Time limit: 2s, Memory: 128MB',
          type: 'from_scratch',
          language: battle.language,
          starterCode: '# Python 3\ndef solve():\n    pass\n',
          referenceSolution: '# Solution\n',
          testCases: [{ id: 'tc_1', input: '2 7 11 15\n9', expectedOutput: '0 1', isSample: true, isHidden: false }],
          published: true,
          isFallback: true,
        };
        battle.teams.teamA.status = 'submitted';
      }
      if (!currentRound.teamBChallenge?.published) {
        currentRound.teamBChallenge = {
          id: `fb_${Date.now()}_teamB`,
          authorTeam: 'teamB',
          authorUsername: 'CodeLife Auto-Judge',
          title: 'Palindrome Number',
          description: 'Determine whether an integer is a palindrome without converting to string.',
          constraints: 'Time limit: 2s, Memory: 128MB',
          type: 'from_scratch',
          language: battle.language,
          starterCode: '# Python 3\ndef solve():\n    pass\n',
          referenceSolution: '# Solution\n',
          testCases: [{ id: 'tc_1', input: '121', expectedOutput: 'true', isSample: true, isHidden: false }],
          published: true,
          isFallback: true,
        };
        battle.teams.teamB.status = 'submitted';
      }

      const swapSeconds = battle.settings?.swapCountdownSeconds || 5;
      battle.phase = 'SWAP';
      battle.phaseStartedAt = new Date(now).toISOString();
      battle.phaseDurationSeconds = swapSeconds;
      battle.phaseEndTime = new Date(now + swapSeconds * 1000).toISOString();
      return true;
    }

    if (battle.phase === 'SWAP') {
      const solvingSeconds = (battle.settings?.solvingTimeMinutes || 15) * 60;
      battle.phase = 'SOLVING';
      battle.phaseStartedAt = new Date(now).toISOString();
      battle.phaseDurationSeconds = solvingSeconds;
      battle.phaseEndTime = new Date(now + solvingSeconds * 1000).toISOString();
      battle.teams.teamA.status = 'writing';
      battle.teams.teamB.status = 'writing';
      if (currentRound.teamBChallenge?.starterCode) {
        battle.teams.teamA.code = currentRound.teamBChallenge.starterCode;
      }
      if (currentRound.teamAChallenge?.starterCode) {
        battle.teams.teamB.code = currentRound.teamAChallenge.starterCode;
      }
      return true;
    }

    if (battle.phase === 'SOLVING') {
      battle.phase = 'ROUND_RESULT';
      battle.phaseStartedAt = new Date(now).toISOString();
      battle.phaseDurationSeconds = 15;
      battle.phaseEndTime = new Date(now + 15 * 1000).toISOString();

      const teamAPassed = Boolean(currentRound.teamASubmission?.allPassed);
      const teamBPassed = Boolean(currentRound.teamBSubmission?.allPassed);
      let roundWinner = 'tie';
      if (teamAPassed && !teamBPassed) roundWinner = 'teamA';
      else if (teamBPassed && !teamAPassed) roundWinner = 'teamB';
      else if (teamAPassed && teamBPassed) {
        const timeA = currentRound.teamASubmission?.solveTimeSeconds || 999999;
        const timeB = currentRound.teamBSubmission?.solveTimeSeconds || 999999;
        if (timeA < timeB) roundWinner = 'teamA';
        else if (timeB < timeA) roundWinner = 'teamB';
      }

      currentRound.result = {
        winner: roundWinner,
        teamAPassed,
        teamBPassed,
        teamAScore: battle.teams.teamA.score,
        teamBScore: battle.teams.teamB.score,
      };
      currentRound.status = 'completed';
      return true;
    }

    return false;
  }

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
        const clean = identifier.trim().toLowerCase().replace(/^@/, '');
        try {
          const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          if (error || !Array.isArray(users)) return null;
          return (
            users.find(
              (u) =>
                u.email?.toLowerCase() === clean ||
                (u.user_metadata?.username || '').toLowerCase().replace(/^@/, '') === clean
            ) || null
          );
        } catch {
          return null;
        }
      };

      // Main API middleware interceptor
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost');
        let pathname = parsedUrl.pathname;

        // Only handle /api paths
        if (!pathname.startsWith('/api')) {
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
                ? u.user_metadata.trustedDevices
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
            const circleMap = new Map();

            // PRIMARY: Supabase user_metadata.created_circles & joined_circles
            if (supabaseAdmin) {
              try {
                const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                if (!error && Array.isArray(users)) {
                  for (const u of users) {
                    const uCircles = Array.isArray(u.user_metadata?.created_circles)
                      ? u.user_metadata.created_circles
                      : [];
                    for (const c of uCircles) {
                      if (c && c.id) circleMap.set(c.id, c);
                    }
                    const jCircles = Array.isArray(u.user_metadata?.joined_circles)
                      ? u.user_metadata.joined_circles
                      : [];
                    for (const c of jCircles) {
                      if (c && c.id && !circleMap.has(c.id)) circleMap.set(c.id, c);
                    }
                  }
                }
              } catch (e) {
                console.warn('[Vite API] Could not load Supabase circles:', e.message);
              }
            }

            // FALLBACK: local file
            try {
              for (const c of loadCirclesFromFile()) {
                if (c && c.id && !circleMap.has(c.id)) circleMap.set(c.id, c);
              }
            } catch (_e) { /* no-op */ }

            return res.end(JSON.stringify({ success: true, circles: Array.from(circleMap.values()) }));
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

            // Also backup to Supabase user_metadata if available
            if (supabaseAdmin && circle.adminUsername) {
              try {
                const adminUser = await findUserInSupabase(circle.adminUsername);
                if (adminUser && adminUser.id) {
                  const currentCircles = Array.isArray(adminUser.user_metadata?.created_circles)
                    ? adminUser.user_metadata.created_circles
                    : [];
                  const cIdx = currentCircles.findIndex((c) => c.id === circle.id);
                  if (cIdx !== -1) currentCircles[cIdx] = circle;
                  else currentCircles.unshift(circle);
                  await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
                    user_metadata: { ...adminUser.user_metadata, created_circles: currentCircles },
                  });
                }
              } catch (e) {
                console.warn('[Vite API] Could not backup circle to Supabase:', e.message);
              }
            }

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

            // Also merge circles from Supabase users' created_circles
            if (supabaseAdmin) {
              try {
                const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                if (!error && Array.isArray(users)) {
                  for (const u of users) {
                    const uCircles = Array.isArray(u.user_metadata?.created_circles)
                      ? u.user_metadata.created_circles
                      : [];
                    for (const uc of uCircles) {
                      if (uc && uc.id && !circleMap.has(uc.id)) {
                        circleMap.set(uc.id, uc);
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('[Vite API] Could not load Supabase circles for sync:', e.message);
              }
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
            const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
            const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

            let circles = [];
            let circleIndex = -1;

            // 1. Search Supabase user_metadata.created_circles
            if (supabaseAdmin) {
              try {
                const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                if (!error && Array.isArray(users)) {
                  for (const u of users) {
                    const uCircles = Array.isArray(u.user_metadata?.created_circles)
                      ? u.user_metadata.created_circles
                      : [];
                    const found = uCircles.find(
                      (c) => (c.inviteCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanCode
                    );
                    if (found) {
                      circles = [found];
                      circleIndex = 0;
                      break;
                    }
                  }
                }
              } catch (e) {
                console.warn('[Vite API] Could not search Supabase for circle:', e.message);
              }
            }

            // 2. Search local file
            if (circleIndex === -1) {
              try {
                const fileCircles = loadCirclesFromFile();
                const idx = fileCircles.findIndex(
                  (c) => (c.inviteCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanCode
                );
                if (idx !== -1) {
                  circles = fileCircles;
                  circleIndex = idx;
                }
              } catch (_e) { /* no-op */ }
            }

            if (circleIndex === -1) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Circle not found. Please verify the circle code.' }));
            }

            const circle = circles[circleIndex];
            const members = Array.isArray(circle.members) ? circle.members : [];

            if (members.some((m) => (m.username || '').toLowerCase().replace(/^@/, '') === cleanUser)) {
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
              (inv) => !((inv.targetUsername || '').toLowerCase().replace(/^@/, '') === cleanUser && inv.circleId === circle.id)
            );
            saveInvitesToFile(invites);

            // Also update Supabase for both the member and creator
            if (supabaseAdmin) {
              try {
                const adminUser = await findUserInSupabase(circle.adminUsername);
                if (adminUser && adminUser.id) {
                  const currentCircles = Array.isArray(adminUser.user_metadata?.created_circles)
                    ? adminUser.user_metadata.created_circles
                    : [];
                  const cIdx = currentCircles.findIndex((c) => c.id === circle.id);
                  if (cIdx !== -1) currentCircles[cIdx] = updatedCircle;
                  else currentCircles.unshift(updatedCircle);
                  await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
                    user_metadata: { ...adminUser.user_metadata, created_circles: currentCircles },
                  });
                }
                const joiningUser = await findUserInSupabase(cleanUser);
                if (joiningUser && joiningUser.id) {
                  const pendingInvites = Array.isArray(joiningUser.user_metadata?.pending_invites)
                    ? joiningUser.user_metadata.pending_invites.filter((inv) => inv.circleId !== circle.id)
                    : [];
                  const currentJoined = Array.isArray(joiningUser.user_metadata?.joined_circles)
                    ? joiningUser.user_metadata.joined_circles
                    : [];
                  const jIdx = currentJoined.findIndex((c) => c.id === circle.id);
                  if (jIdx !== -1) currentJoined[jIdx] = updatedCircle;
                  else currentJoined.unshift(updatedCircle);

                  await supabaseAdmin.auth.admin.updateUserById(joiningUser.id, {
                    user_metadata: {
                      ...joiningUser.user_metadata,
                      joined_circles: currentJoined,
                      pending_invites: pendingInvites,
                    },
                  });
                }
              } catch (e) {
                console.warn('[Vite API] Could not sync join to Supabase:', e.message);
              }
            }

            return res.end(JSON.stringify({ success: true, circle: updatedCircle }));
          }

          if (pathname === '/api/circles/delete' && req.method === 'POST') {
            const { adminUsername, circleId } = await parseJsonBody(req);
            if (!adminUsername || !circleId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'adminUsername and circleId required' }));
            }
            const cleanAdmin = adminUsername.trim().toLowerCase().replace(/^@/, '');

            // Delete from local file
            try {
              const circles = loadCirclesFromFile();
              const updated = circles.filter((c) => c.id !== circleId);
              saveCirclesToFile(updated);
            } catch (_e) { /* no-op */ }

            // Delete from Supabase
            if (supabaseAdmin) {
              try {
                const adminUser = await findUserInSupabase(cleanAdmin);
                if (adminUser && adminUser.id) {
                  const currentCircles = Array.isArray(adminUser.user_metadata?.created_circles)
                    ? adminUser.user_metadata.created_circles.filter((c) => c.id !== circleId)
                    : [];
                  await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
                    user_metadata: { ...adminUser.user_metadata, created_circles: currentCircles },
                  });
                }

                const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                if (!error && Array.isArray(users)) {
                  for (const u of users) {
                    if (Array.isArray(u.user_metadata?.joined_circles)) {
                      const filteredJoined = u.user_metadata.joined_circles.filter((c) => c.id !== circleId);
                      if (filteredJoined.length !== u.user_metadata.joined_circles.length) {
                        await supabaseAdmin.auth.admin.updateUserById(u.id, {
                          user_metadata: { ...u.user_metadata, joined_circles: filteredJoined },
                        });
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('[Vite API] Error deleting circle in Supabase:', e.message);
              }
            }

            return res.end(JSON.stringify({ success: true }));
          }

          // -----------------------------------------------------------------
          // 4. Invite routes
          // -----------------------------------------------------------------
          if (pathname.startsWith('/api/invites/') && pathname !== '/api/invites/respond' && req.method === 'GET') {
            const clean = pathname.replace('/api/invites/', '').trim().toLowerCase();
            const allInvites = loadInvitesFromFile();
            let userInvites = allInvites.filter(
              (inv) =>
                ((inv.targetUsername || '').toLowerCase() === clean ||
                 (inv.targetEmail || '').toLowerCase() === clean) &&
                inv.status === 'pending'
            );

            // Also check Supabase user_metadata.pending_invites
            if (supabaseAdmin) {
              try {
                const user = await findUserInSupabase(clean);
                if (user && Array.isArray(user.user_metadata?.pending_invites)) {
                  const sbInvites = user.user_metadata.pending_invites.filter((inv) => inv.status === 'pending');
                  const map = new Map();
                  for (const inv of userInvites) map.set(inv.id, inv);
                  for (const inv of sbInvites) map.set(inv.id, inv);
                  userInvites = Array.from(map.values());
                }
              } catch (e) {
                console.warn('[Vite API] Could not read Supabase pending invites:', e.message);
              }
            }

            return res.end(JSON.stringify({ success: true, invites: userInvites }));
          }

          if (pathname === '/api/invites' && req.method === 'POST') {
            const invite = await parseJsonBody(req);
            if (!invite || !invite.circleId || !invite.targetUsername) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Valid invite payload required' }));
            }

            let resolvedUsername = invite.targetUsername.trim().toLowerCase();
            let resolvedEmail = invite.targetEmail || '';

            // Resolve target user via Supabase if possible (handles email -> username lookup)
            if (supabaseAdmin) {
              try {
                const targetUser = await findUserInSupabase(invite.targetUsername);
                if (targetUser) {
                  resolvedUsername = targetUser.user_metadata?.username?.toLowerCase() || resolvedUsername;
                  resolvedEmail = targetUser.email?.toLowerCase() || resolvedEmail;

                  // Save pending invite into target user's Supabase metadata directly
                  const currentInvites = Array.isArray(targetUser.user_metadata?.pending_invites)
                    ? targetUser.user_metadata.pending_invites
                    : [];
                  const idx = currentInvites.findIndex(
                    (i) => i.id === invite.id || i.circleId === invite.circleId
                  );
                  const normalizedInvite = {
                    ...invite,
                    targetUsername: resolvedUsername,
                    targetEmail: resolvedEmail,
                  };
                  if (idx !== -1) currentInvites[idx] = normalizedInvite;
                  else currentInvites.unshift(normalizedInvite);

                  await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
                    user_metadata: { ...targetUser.user_metadata, pending_invites: currentInvites },
                  });
                }
              } catch (e) {
                console.warn('[Vite API] Could not sync invite to Supabase:', e.message);
              }
            }

            const normalizedInvite = {
              ...invite,
              targetUsername: resolvedUsername,
              targetEmail: resolvedEmail,
            };

            const allInvites = loadInvitesFromFile();
            const existingIdx = allInvites.findIndex(
              (i) =>
                i.id === normalizedInvite.id ||
                (i.circleId === normalizedInvite.circleId &&
                 ((i.targetUsername || '').toLowerCase() === resolvedUsername ||
                  (i.targetEmail && i.targetEmail.toLowerCase() === resolvedEmail)))
            );
            if (existingIdx !== -1) {
              allInvites[existingIdx] = normalizedInvite;
            } else {
              allInvites.unshift(normalizedInvite);
            }
            saveInvitesToFile(allInvites);
            return res.end(JSON.stringify({ success: true, invite: normalizedInvite }));
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

            // Clean invite in Supabase
            if (supabaseAdmin) {
              try {
                const user = await findUserInSupabase(cleanUser);
                if (user && Array.isArray(user.user_metadata?.pending_invites)) {
                  const sbRemaining = user.user_metadata.pending_invites.filter((i) => i.id !== inviteId);
                  await supabaseAdmin.auth.admin.updateUserById(user.id, {
                    user_metadata: { ...user.user_metadata, pending_invites: sbRemaining },
                  });
                }
              } catch (e) {
                console.warn('[Vite API] Could not clean Supabase invite:', e.message);
              }
            }

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
          // 4.5. Battle Zone Endpoints
          // -----------------------------------------------------------------
          const eventsMatch = pathname.match(/^\/api\/battles\/([^/]+)\/events$/);
          if (eventsMatch && req.method === 'GET') {
            const battleId = eventsMatch[1];
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ type: 'connected', battleId })}\n\n`);

            if (!battleSSEConnections.has(battleId)) {
              battleSSEConnections.set(battleId, new Set());
            }
            const set = battleSSEConnections.get(battleId);
            set.add(res);

            const heartbeat = setInterval(() => {
              try {
                res.write(': keep-alive\n\n');
              } catch {
                clearInterval(heartbeat);
                set.delete(res);
              }
            }, 15000);

            req.on('close', () => {
              clearInterval(heartbeat);
              set.delete(res);
              if (set.size === 0) battleSSEConnections.delete(battleId);
            });
            return;
          }

          const battleReqCircleMatch = pathname.match(/^\/api\/battles\/requests\/([^/]+)$/);
          if (battleReqCircleMatch && req.method === 'GET') {
            const circleId = battleReqCircleMatch[1];
            const all = loadBattleRequestsFromFile();
            const filtered = all.filter((r) => r.toCircleId === circleId && r.status === 'pending');
            return res.end(JSON.stringify({ success: true, requests: filtered }));
          }

          const respondReqMatch = pathname.match(/^\/api\/battles\/requests\/([^/]+)\/respond$/);
          if (respondReqMatch && req.method === 'POST') {
            const requestId = respondReqMatch[1];
            const { accept } = await parseJsonBody(req);
            const all = loadBattleRequestsFromFile();
            const idx = all.findIndex((r) => r.id === requestId);
            if (idx === -1) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Request not found' }));
            }
            all[idx].status = accept ? 'accepted' : 'declined';
            saveBattleRequestsToFile(all);
            return res.end(JSON.stringify({ success: true, request: all[idx] }));
          }

          if (pathname === '/api/battles/requests' && req.method === 'POST') {
            const reqData = await parseJsonBody(req);
            if (!reqData || !reqData.fromCircleId || !reqData.toCircleId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Valid request data required' }));
            }
            const all = loadBattleRequestsFromFile();
            all.unshift(reqData);
            saveBattleRequestsToFile(all);
            return res.end(JSON.stringify({ success: true, request: reqData }));
          }

          const settingsMatch = pathname.match(/^\/api\/battles\/([^/]+)\/settings$/);
          if (settingsMatch && req.method === 'POST') {
            const battleId = settingsMatch[1];
            const { username, updates } = await parseJsonBody(req);
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            if (updates) {
              battle.settings = { ...battle.settings, ...updates };
              if (updates.language) battle.language = updates.language;
              battle.teams.teamA.captainReady = false;
              battle.teams.teamB.captainReady = false;
            }
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'settings_updated', battle, updatedBy: username });
            return res.end(JSON.stringify({ success: true, battle }));
          }

          const readyMatch = pathname.match(/^\/api\/battles\/([^/]+)\/ready$/);
          if (readyMatch && req.method === 'POST') {
            const battleId = readyMatch[1];
            const { teamKey, isReady } = await parseJsonBody(req);
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            if (battle.teams[teamKey]) {
              battle.teams[teamKey].captainReady = Boolean(isReady);
            }
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'captain_ready', teamKey, isReady, battle });
            return res.end(JSON.stringify({ success: true, battle }));
          }

          const startMatch = pathname.match(/^\/api\/battles\/([^/]+)\/start$/);
          if (startMatch && req.method === 'POST') {
            const battleId = startMatch[1];
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            const authoringDurationSeconds = (battle.settings?.authoringTimeMinutes || 10) * 60;
            const now = Date.now();
            battle.phase = 'AUTHORING';
            battle.phaseStartedAt = new Date(now).toISOString();
            battle.phaseDurationSeconds = authoringDurationSeconds;
            battle.phaseEndTime = new Date(now + authoringDurationSeconds * 1000).toISOString();
            battle.teams.teamA.status = 'writing';
            battle.teams.teamB.status = 'writing';
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'phase_change', phase: 'AUTHORING', battle });
            return res.end(JSON.stringify({ success: true, battle }));
          }

          const syncCodeMatch = pathname.match(/^\/api\/battles\/([^/]+)\/sync-code$/);
          if (syncCodeMatch && req.method === 'POST') {
            const battleId = syncCodeMatch[1];
            const { username, teamKey, code, stdin } = await parseJsonBody(req);
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            if (battle.teams[teamKey]) {
              battle.teams[teamKey].code = code;
              if (stdin !== undefined) battle.teams[teamKey].stdin = stdin;
              battle.teams[teamKey].status = 'writing';
            }
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'code_sync', teamKey, code, user: username });
            return res.end(JSON.stringify({ success: true }));
          }

          const challengeMatch = pathname.match(/^\/api\/battles\/([^/]+)\/challenge$/);
          if (challengeMatch && req.method === 'POST') {
            const battleId = challengeMatch[1];
            const { teamKey, challenge } = await parseJsonBody(req);
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            const currentRound = battle.rounds[battle.currentRound - 1];
            if (teamKey === 'teamA') {
              currentRound.teamAChallenge = challenge;
              battle.teams.teamA.status = 'submitted';
            } else {
              currentRound.teamBChallenge = challenge;
              battle.teams.teamB.status = 'submitted';
            }
            if (currentRound.teamAChallenge?.published && currentRound.teamBChallenge?.published) {
              const swapSeconds = battle.settings?.swapCountdownSeconds || 5;
              const now = Date.now();
              battle.phase = 'SWAP';
              battle.phaseStartedAt = new Date(now).toISOString();
              battle.phaseDurationSeconds = swapSeconds;
              battle.phaseEndTime = new Date(now + swapSeconds * 1000).toISOString();
            }
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'challenge_published', teamKey, phase: battle.phase, battle });
            return res.end(JSON.stringify({ success: true, battle }));
          }

          const submitMatch = pathname.match(/^\/api\/battles\/([^/]+)\/submit$/);
          if (submitMatch && req.method === 'POST') {
            const battleId = submitMatch[1];
            const { teamKey, submission } = await parseJsonBody(req);
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            const currentRound = battle.rounds[battle.currentRound - 1];
            const team = battle.teams[teamKey];
            if (teamKey === 'teamA') {
              currentRound.teamASubmission = submission;
            } else {
              currentRound.teamBSubmission = submission;
            }
            if (submission.allPassed) {
              team.status = 'passed';
              team.score += 1;
              team.totalSolveTimeSeconds += submission.solveTimeSeconds || 0;
            } else {
              team.status = 'failed';
              team.wrongSubmissionsCount += 1;
            }
            if (currentRound.teamASubmission?.allPassed && currentRound.teamBSubmission?.allPassed) {
              checkAndUpdateBattleTimeouts(battle);
            }
            saveBattlesToFile(battles);
            broadcastBattleEvent(battleId, { type: 'submission_result', teamKey, allPassed: submission.allPassed, battle });
            return res.end(JSON.stringify({ success: true, battle }));
          }

          const singleBattleMatch = pathname.match(/^\/api\/battles\/([^/]+)$/);
          if (singleBattleMatch && req.method === 'GET') {
            const battleId = singleBattleMatch[1];
            const username = parsedUrl.searchParams.get('username');
            const battles = loadBattlesFromFile();
            const battle = battles.find((b) => b.id === battleId);
            if (!battle) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Battle not found' }));
            }
            const updated = checkAndUpdateBattleTimeouts(battle);
            if (updated) {
              saveBattlesToFile(battles);
              broadcastBattleEvent(battleId, { type: 'phase_change', phase: battle.phase, battle });
            }
            const sanitized = sanitizeBattleForUser(battle, username);
            return res.end(JSON.stringify({ success: true, battle: sanitized }));
          }

          if (pathname === '/api/battles' && req.method === 'POST') {
            const battle = await parseJsonBody(req);
            if (!battle || !battle.id) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Valid battle object required' }));
            }
            const battles = loadBattlesFromFile();
            const idx = battles.findIndex((b) => b.id === battle.id);
            if (idx !== -1) battles[idx] = battle;
            else battles.unshift(battle);
            saveBattlesToFile(battles);
            broadcastBattleEvent(battle.id, { type: 'battle_created', battle });
            return res.end(JSON.stringify({ success: true, battle }));
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
  base: '/',
  plugins: [react(), backendApiPlugin()],
})

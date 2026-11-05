import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load .env file securely on server startup if present
if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (e) {
    console.warn('[Server] Could not load .env file:', e.message);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ---------------------------------------------------------------------------
// Supabase Admin Client Initialization (Service Role - Secret Key)
// SECURITY: SUPABASE_SECRET_KEY is strictly private to the backend server.
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dbbkdoaemwuoducpvxog.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

let supabaseAdmin = null;
if (SUPABASE_SECRET_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log('[Server] Supabase Admin client connected securely with private secret key.');
} else {
  console.warn('[Server] Warning: SUPABASE_SECRET_KEY not set in environment.');
}

/**
 * Strict Email Security Validation
 * Only permits:
 *  1. Gmail (domain strictly 'gmail.com')
 *  2. Educational domains (.edu, .edu.xx, .ac.xx)
 */
function isValidApprovedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!basicRegex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [, domainPart] = parts;
  if (!domainPart || domainPart.startsWith('.') || domainPart.endsWith('.')) return false;

  if (domainPart === 'gmail.com') return true;
  return /\.edu(\.[a-z]{2,})?$/.test(domainPart) || /\.ac\.[a-z]{2,}$/.test(domainPart);
}

// ---------------------------------------------------------------------------
// Backend Auth & Supabase Database Routes
// ---------------------------------------------------------------------------

/**
 * Helper: Find user in Supabase by email or username
 */
async function findSupabaseUser(identifier) {
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
}

/**
 * Check if a user exists in the Supabase database
 * Checked on every single login attempt.
 */
app.post('/api/auth/check-user', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const user = await findSupabaseUser(identifier);
    if (!user) {
      return res.json({ exists: false, user: null });
    }

    return res.json({
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
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Register a new user in Supabase
 * Enforces strict approved email policy (Gmail + Educational only)
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    const { name, username, email, institution, password, deviceId } = req.body || {};

    if (!isValidApprovedEmail(email)) {
      return res.status(400).json({
        error:
          'Only Gmail (e.g. xyz@gmail.com) and educational emails (e.g. name@aust.edu) are accepted as credentials.',
      });
    }

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUser = username.trim().toLowerCase();

    // Check if user already exists
    const existing = await findSupabaseUser(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'This email is already registered in our database. Please sign in.' });
    }

    const existingUsername = await findSupabaseUser(cleanUser);
    if (existingUsername) {
      return res.status(400).json({ error: 'This username is already taken. Please choose another username.' });
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
      return res.status(400).json({ error: error.message });
    }

    return res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        username: data.user.user_metadata?.username,
        institution: data.user.user_metadata?.institution,
        trustedDevices,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Multi-device authorization: Add device ID to user's trusted devices in Supabase
 */
app.post('/api/auth/trust-device', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    const { identifier, deviceId } = req.body || {};
    if (!identifier || !deviceId) {
      return res.status(400).json({ error: 'Identifier and deviceId are required' });
    }

    const user = await findSupabaseUser(identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    const currentTrusted = Array.isArray(user.user_metadata?.trustedDevices)
      ? user.user_metadata.trustedDevices
      : [];

    const updatedTrusted = [...new Set([...currentTrusted, deviceId])];

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        trustedDevices: updatedTrusted,
        lastLoginDevice: deviceId,
        lastLoginAt: new Date().toISOString(),
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true, trustedDevices: updatedTrusted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Update user's password in Supabase
 */
app.post('/api/auth/update-password', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    const { identifier, newPassword } = req.body || {};
    if (!identifier || !newPassword) {
      return res.status(400).json({ error: 'Identifier and newPassword are required' });
    }

    const user = await findSupabaseUser(identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword.trim(),
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get sanitized users list from Supabase for syncing
 */
app.get('/api/auth/users', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.json({ users: [] });
    }
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      return res.status(500).json({ error: error.message });
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
      createdAt: u.created_at,
    }));

    return res.json({ users: sanitized });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Delete user from Supabase database
 */
app.post('/api/auth/delete-user', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    if (!supabaseAdmin) {
      return res.json({ success: true, message: 'Deleted locally' });
    }

    const user = await findSupabaseUser(identifier);
    if (user && user.id) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (error) {
        console.error('[Server] Error deleting user from Supabase:', error.message);
        return res.status(500).json({ error: error.message });
      }
      console.log(`[Server] User "${identifier}" (${user.id}) deleted from Supabase database.`);
    }

    return res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[Server] Delete user exception:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Group Challenge & Member Search Routes (Stage 1)
// ---------------------------------------------------------------------------
const searchRateLimitMap = new Map();

function checkSearchRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 30;
  const timestamps = (searchRateLimitMap.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  searchRateLimitMap.set(ip, timestamps);
  return true;
}

/**
 * Member Search: Case-insensitive, prefix/partial match, debounced, min 2 chars
 * Strictly rate-limited and sanitized to protect user privacy.
 */
app.get('/api/users/search', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkSearchRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Search rate limit exceeded. Please wait a minute.' });
  }

  const { q = '', offset = 0, limit = 10 } = req.query || {};
  const query = String(q).trim().toLowerCase();

  if (query.length < 2) {
    return res.json({ results: [], total: 0, hasMore: false });
  }

  try {
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
      return uname.includes(query) || name.includes(query);
    });

    const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);
    const parsedLimit = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));
    const sliced = matched.slice(parsedOffset, parsedOffset + parsedLimit);

    // Sanitized DTO: Never exposes email, password, tokens, phone
    const results = sliced.map((u) => ({
      username: u.username,
      name: u.name,
      photoUrl: u.photoUrl,
      institution: u.privacySettings?.showInstitution !== false ? u.institution : 'Hidden by user',
      classGrade: u.privacySettings?.showInstitution !== false ? u.classGrade : 'Hidden by user',
    }));

    return res.json({
      results,
      total: matched.length,
      hasMore: parsedOffset + parsedLimit < matched.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Public Member Profile Endpoint
 * Strictly sanitized response DTO respecting user's privacy settings.
 */
app.get('/api/users/:username/public-profile', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    let found = null;
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (!error && Array.isArray(data?.users)) {
        found = data.users.find(
          (u) => (u.user_metadata?.username || '').toLowerCase() === username
        );
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    const meta = found.user_metadata || {};
    const privacy = meta.privacySettings || { showInstitution: true, showStats: true, allowStrangerInvites: true };
    const institutionVisible = privacy.showInstitution !== false;
    const statsVisible = privacy.showStats !== false;

    // Strict Sanitized DTO
    const publicProfile = {
      username: meta.username || username,
      name: meta.name || username,
      photoUrl: meta.photoUrl || '/codelife_logo_white_bg.png',
      institution: institutionVisible ? (meta.institution || 'Not specified') : 'Hidden by user',
      classGrade: institutionVisible ? (meta.classGrade || 'Not specified') : 'Hidden by user',
      bio: meta.bio || '',
      totalProblemsSolved: statsVisible ? (meta.total_problems_solved || 0) : null,
      currentStreak: statsVisible ? (meta.current_streak || 0) : null,
      longestStreak: statsVisible ? (meta.longest_streak || 0) : null,
      matchesPlayed: statsVisible ? (meta.matches_played || 0) : null,
      matchesWon: statsVisible ? (meta.matches_won || 0) : null,
      memberSince: found.created_at ? new Date(found.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Member',
      allowStrangerInvites: privacy.allowStrangerInvites !== false,
      showInstitution: institutionVisible,
      showStats: statsVisible,
    };

    return res.json({ user: publicProfile });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Group Challenge Circles & Invitations API (Stage 2 Central Store)
// ---------------------------------------------------------------------------
const CIRCLES_FILE = path.join(__dirname, 'circles_db.json');
const INVITES_FILE = path.join(__dirname, 'invites_db.json');

function loadCirclesFromFile() {
  try {
    if (fs.existsSync(CIRCLES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CIRCLES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Server] Error reading circles DB file:', err);
  }
  return [];
}

function saveCirclesToFile(circles) {
  try {
    fs.writeFileSync(CIRCLES_FILE, JSON.stringify(circles, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving circles DB file:', err);
  }
}

function loadInvitesFromFile() {
  try {
    if (fs.existsSync(INVITES_FILE)) {
      const data = JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Server] Error reading invites DB file:', err);
  }
  return [];
}

function saveInvitesToFile(invites) {
  try {
    fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving invites DB file:', err);
  }
}

app.get('/api/circles', (req, res) => {
  const circles = loadCirclesFromFile();
  return res.json({ success: true, circles });
});

app.post('/api/circles', async (req, res) => {
  const circle = req.body;
  if (!circle || !circle.id || !circle.name) {
    return res.status(400).json({ error: 'Valid circle object required' });
  }
  const circles = loadCirclesFromFile();
  const idx = circles.findIndex((c) => c.id === circle.id);
  if (idx !== -1) {
    circles[idx] = { ...circles[idx], ...circle };
  } else {
    circles.unshift(circle);
  }
  saveCirclesToFile(circles);

  // Backup to Supabase
  if (supabaseAdmin && circle.adminUsername) {
    try {
      const adminUser = await findSupabaseUser(circle.adminUsername);
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
      console.warn('[Server] Could not backup circle to Supabase:', e.message);
    }
  }

  return res.json({ success: true, circle: circles[idx !== -1 ? idx : 0] });
});

app.post('/api/circles/sync', async (req, res) => {
  const incoming = Array.isArray(req.body?.circles) ? req.body.circles : [];
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
      console.warn('[Server] Could not load Supabase circles for sync:', e.message);
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
  return res.json({ success: true, circles: merged });
});

app.post('/api/circles/join', async (req, res) => {
  const { username, inviteCode } = req.body || {};
  if (!username || !inviteCode) {
    return res.status(400).json({ success: false, error: 'Username and invite code are required.' });
  }
  const cleanUser = username.trim().toLowerCase();
  const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  let circles = loadCirclesFromFile();
  let circleIndex = circles.findIndex((c) => (c.inviteCode || '').toUpperCase() === cleanCode);

  // If not found in local file, look through Supabase users' created_circles
  if (circleIndex === -1 && supabaseAdmin) {
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (!error && Array.isArray(users)) {
        for (const u of users) {
          const uCircles = Array.isArray(u.user_metadata?.created_circles)
            ? u.user_metadata.created_circles
            : [];
          const found = uCircles.find((c) => (c.inviteCode || '').toUpperCase() === cleanCode);
          if (found) {
            circles.unshift(found);
            circleIndex = 0;
            saveCirclesToFile(circles);
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[Server] Could not search Supabase for circle:', e.message);
    }
  }

  if (circleIndex === -1) {
    return res.status(404).json({ success: false, error: 'Circle not found. Please verify the 6-character invite code.' });
  }

  const circle = circles[circleIndex];
  const members = Array.isArray(circle.members) ? circle.members : [];

  if (members.some((m) => (m.username || '').toLowerCase() === cleanUser)) {
    return res.json({ success: true, circle, message: 'Already a member' });
  }

  const max = circle.maxMembers || 50;
  if (members.length >= max) {
    return res.status(400).json({ success: false, error: `This circle is full (max ${max} members reached).` });
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

  // Clear pending invite for this user
  const invites = loadInvitesFromFile().filter(
    (inv) => !((inv.targetUsername || '').toLowerCase() === cleanUser && inv.circleId === circle.id)
  );
  saveInvitesToFile(invites);

  // Also update Supabase for both the member and creator
  if (supabaseAdmin) {
    try {
      const adminUser = await findSupabaseUser(circle.adminUsername);
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
      const joiningUser = await findSupabaseUser(cleanUser);
      if (joiningUser && joiningUser.id) {
        const pendingInvites = Array.isArray(joiningUser.user_metadata?.pending_invites)
          ? joiningUser.user_metadata.pending_invites.filter((inv) => inv.circleId !== circle.id)
          : [];
        await supabaseAdmin.auth.admin.updateUserById(joiningUser.id, {
          user_metadata: { ...joiningUser.user_metadata, pending_invites: pendingInvites },
        });
      }
    } catch (e) {
      console.warn('[Server] Could not sync join to Supabase:', e.message);
    }
  }

  return res.json({ success: true, circle: updatedCircle });
});

app.get('/api/invites/:username', async (req, res) => {
  const clean = (req.params.username || '').trim().toLowerCase();
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
      const user = await findSupabaseUser(clean);
      if (user && Array.isArray(user.user_metadata?.pending_invites)) {
        const sbInvites = user.user_metadata.pending_invites.filter((inv) => inv.status === 'pending');
        const map = new Map();
        for (const inv of userInvites) map.set(inv.id, inv);
        for (const inv of sbInvites) map.set(inv.id, inv);
        userInvites = Array.from(map.values());
      }
    } catch (e) {
      console.warn('[Server] Could not read Supabase pending invites:', e.message);
    }
  }

  return res.json({ success: true, invites: userInvites });
});

app.post('/api/invites', async (req, res) => {
  const invite = req.body;
  if (!invite || !invite.circleId || !invite.targetUsername) {
    return res.status(400).json({ error: 'Valid invite payload required' });
  }

  let resolvedUsername = invite.targetUsername.trim().toLowerCase();
  let resolvedEmail = invite.targetEmail || '';

  // Resolve target user via Supabase if possible
  if (supabaseAdmin) {
    try {
      const targetUser = await findSupabaseUser(invite.targetUsername);
      if (targetUser) {
        resolvedUsername = targetUser.user_metadata?.username?.toLowerCase() || resolvedUsername;
        resolvedEmail = targetUser.email?.toLowerCase() || resolvedEmail;

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
      console.warn('[Server] Could not sync invite to Supabase:', e.message);
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
  return res.json({ success: true, invite: normalizedInvite });
});

app.post('/api/invites/respond', async (req, res) => {
  const { username, inviteId, accept } = req.body || {};
  if (!username || !inviteId) {
    return res.status(400).json({ error: 'Username and inviteId are required' });
  }
  const cleanUser = username.trim().toLowerCase();
  const allInvites = loadInvitesFromFile();
  const invite = allInvites.find((i) => i.id === inviteId);
  const remaining = allInvites.filter((i) => i.id !== inviteId);
  saveInvitesToFile(remaining);

  // Clean invite in Supabase
  if (supabaseAdmin) {
    try {
      const user = await findSupabaseUser(cleanUser);
      if (user && Array.isArray(user.user_metadata?.pending_invites)) {
        const sbRemaining = user.user_metadata.pending_invites.filter((i) => i.id !== inviteId);
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, pending_invites: sbRemaining },
        });
      }
    } catch (e) {
      console.warn('[Server] Could not clean Supabase invite:', e.message);
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
        return res.json({ success: true, circle: circles[cIdx] });
      }
      return res.json({ success: true, circle });
    }
  }

  return res.json({ success: true });
});

/**
 * Backend route for Judge0 API
 * Keeps API keys completely private on the server.
 */
app.post('/api/compile', async (req, res) => {
  try {
    const { code, stdin = '', language_id = 50 } = req.body;
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

    const judge0Res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: Buffer.from(code || '', 'utf-8').toString('base64'),
        language_id: Number(language_id) || 50,
        stdin: Buffer.from(stdin || '', 'utf-8').toString('base64'),
      }),
    });

    const data = await judge0Res.json();

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

    res.status(judge0Res.status).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Production fallback to index.html for client routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`C Compiler & Supabase Auth Server running on http://localhost:${PORT}`);
});

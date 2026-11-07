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
  const clean = identifier.trim().toLowerCase().replace(/^@/, '');
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error || !Array.isArray(users)) return null;

  return (
    users.find(
      (u) =>
        u.email?.toLowerCase() === clean ||
        (u.user_metadata?.username || '').toLowerCase().replace(/^@/, '') === clean
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
const DELETED_CIRCLES_FILE = path.join(__dirname, 'deleted_circles_db.json');

function loadDeletedCirclesFromFile() {
  try {
    if (fs.existsSync(DELETED_CIRCLES_FILE)) {
      const data = JSON.parse(fs.readFileSync(DELETED_CIRCLES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Server] Error reading deleted circles DB file:', err);
  }
  return [];
}

function saveDeletedCirclesToFile(ids) {
  try {
    fs.writeFileSync(DELETED_CIRCLES_FILE, JSON.stringify(ids, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving deleted circles DB file:', err);
  }
}

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

app.get('/api/circles', async (req, res) => {
  const deletedSet = new Set(loadDeletedCirclesFromFile());
  const circleMap = new Map();

  // PRIMARY: Supabase user_metadata.created_circles
  if (supabaseAdmin) {
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (!error && Array.isArray(users)) {
        for (const u of users) {
          const uCircles = Array.isArray(u.user_metadata?.created_circles)
            ? u.user_metadata.created_circles
            : [];
          for (const c of uCircles) {
            if (c && c.id && !deletedSet.has(c.id)) circleMap.set(c.id, c);
          }
        }
      }
    } catch (e) {
      console.warn('[Server] Could not load Supabase circles:', e.message);
    }
  }

  // FALLBACK: local file
  try {
    for (const c of loadCirclesFromFile()) {
      if (c && c.id && !deletedSet.has(c.id) && !circleMap.has(c.id)) circleMap.set(c.id, c);
    }
  } catch (_e) { /* no-op */ }

  return res.json({
    success: true,
    circles: Array.from(circleMap.values()),
    deletedCircleIds: Array.from(deletedSet),
  });
});

app.post('/api/circles', async (req, res) => {
  const circle = req.body;
  if (!circle || !circle.id || !circle.name) {
    return res.status(400).json({ error: 'Valid circle object required' });
  }

  // If this circle was previously marked deleted, unmark it
  const deletedSet = new Set(loadDeletedCirclesFromFile());
  if (deletedSet.has(circle.id)) {
    deletedSet.delete(circle.id);
    saveDeletedCirclesToFile(Array.from(deletedSet));
  }

  // PRIMARY: persist to Supabase user_metadata (survives Vercel serverless restarts)
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
      console.warn('[Server] Could not save circle to Supabase:', e.message);
    }
  }

  // FALLBACK: also write to local file for dev
  try {
    const circles = loadCirclesFromFile();
    const idx = circles.findIndex((c) => c.id === circle.id);
    if (idx !== -1) circles[idx] = { ...circles[idx], ...circle };
    else circles.unshift(circle);
    saveCirclesToFile(circles);
    return res.json({ success: true, circle: circles[idx !== -1 ? idx : 0] });
  } catch (_e) {
    return res.json({ success: true, circle });
  }
});

app.post('/api/circles/sync', async (req, res) => {
  const incoming = Array.isArray(req.body?.circles) ? req.body.circles : [];
  const clientDeletedIds = Array.isArray(req.body?.deletedCircleIds) ? req.body.deletedCircleIds : [];

  const deletedSet = new Set(loadDeletedCirclesFromFile());
  let deletedUpdated = false;
  for (const did of clientDeletedIds) {
    if (did && !deletedSet.has(did)) {
      deletedSet.add(did);
      deletedUpdated = true;
    }
  }
  if (deletedUpdated) {
    saveDeletedCirclesToFile(Array.from(deletedSet));
  }

  const serverCircles = loadCirclesFromFile();
  const circleMap = new Map();

  for (const c of serverCircles) {
    if (c && c.id && !deletedSet.has(c.id)) circleMap.set(c.id, c);
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
            if (uc && uc.id && !deletedSet.has(uc.id) && !circleMap.has(uc.id)) {
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
    if (!inc || !inc.id || deletedSet.has(inc.id)) continue;
    if (!circleMap.has(inc.id)) {
      circleMap.set(inc.id, inc);
    } else {
      // Authoritative circle already on server: preserve existing server member list
      const existing = circleMap.get(inc.id);
      circleMap.set(inc.id, {
        ...inc,
        ...existing,
        members: existing.members || inc.members || [],
      });
    }
  }

  const merged = Array.from(circleMap.values());
  saveCirclesToFile(merged);
  return res.json({
    success: true,
    circles: merged,
    deletedCircleIds: Array.from(deletedSet),
  });
});

app.post('/api/circles/join', async (req, res) => {
  const { username, inviteCode } = req.body || {};
  if (!username || !inviteCode) {
    return res.status(400).json({ success: false, error: 'Username and invite code are required.' });
  }
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
  const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // PRIMARY: search Supabase user_metadata.created_circles & joined_circles (works on Vercel serverless)
  let circles = [];
  let circleIndex = -1;

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
      console.warn('[Server] Could not search Supabase for circle:', e.message);
    }
  }

  // FALLBACK: local file (dev only)
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
    return res.status(404).json({ success: false, error: 'Circle not found. Please verify the circle code.' });
  }

  const circle = circles[circleIndex];
  const members = Array.isArray(circle.members) ? circle.members : [];

  if (members.some((m) => (m.username || '').toLowerCase().replace(/^@/, '') === cleanUser)) {
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
    (inv) => !((inv.targetUsername || '').toLowerCase().replace(/^@/, '') === cleanUser && inv.circleId === circle.id)
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
      console.warn('[Server] Could not sync join to Supabase:', e.message);
    }
  }

  return res.json({ success: true, circle: updatedCircle });
});

/**
 * POST /api/circles/delete
 * Delete circle from Supabase and local DB
 */
app.post('/api/circles/delete', async (req, res) => {
  const { adminUsername, circleId } = req.body || {};
  if (!adminUsername || !circleId) {
    return res.status(400).json({ error: 'adminUsername and circleId required' });
  }
  const cleanAdmin = adminUsername.trim().toLowerCase().replace(/^@/, '');

  // Add to deleted set
  const deletedSet = new Set(loadDeletedCirclesFromFile());
  deletedSet.add(circleId);
  saveDeletedCirclesToFile(Array.from(deletedSet));

  // Delete from local file
  try {
    const circles = loadCirclesFromFile();
    const updated = circles.filter((c) => c.id !== circleId);
    saveCirclesToFile(updated);
  } catch (_e) { /* no-op */ }

  // Delete from Supabase
  if (supabaseAdmin) {
    try {
      const adminUser = await findSupabaseUser(cleanAdmin);
      if (adminUser && adminUser.id) {
        const currentCircles = Array.isArray(adminUser.user_metadata?.created_circles)
          ? adminUser.user_metadata.created_circles.filter((c) => c.id !== circleId)
          : [];
        await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
          user_metadata: { ...adminUser.user_metadata, created_circles: currentCircles },
        });
      }

      // Also clean up from any user's joined_circles
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
      console.warn('[Server] Error deleting circle in Supabase:', e.message);
    }
  }

  return res.json({
    success: true,
    deletedCircleId: circleId,
    deletedCircleIds: Array.from(deletedSet),
  });
});

/**
 * POST /api/circles/remove-member
 * Admin removes a member from a circle
 */
app.post('/api/circles/remove-member', async (req, res) => {
  const { adminUsername, circleId, targetUsername } = req.body || {};
  if (!adminUsername || !circleId || !targetUsername) {
    return res.status(400).json({ error: 'adminUsername, circleId, and targetUsername are required' });
  }
  const cleanAdmin = adminUsername.trim().toLowerCase().replace(/^@/, '');
  const cleanTarget = targetUsername.trim().toLowerCase().replace(/^@/, '');

  if (cleanAdmin === cleanTarget) {
    return res.status(400).json({ error: 'Admin cannot be removed from their own circle.' });
  }

  let updatedCircle = null;

  // 1. Update in local file
  try {
    const circles = loadCirclesFromFile();
    const cIdx = circles.findIndex((c) => c.id === circleId);
    if (cIdx !== -1) {
      const c = circles[cIdx];
      const members = Array.isArray(c.members) ? c.members : [];
      const filtered = members.filter((m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanTarget);
      circles[cIdx] = { ...c, members: filtered };
      saveCirclesToFile(circles);
      updatedCircle = circles[cIdx];
    }
  } catch (_e) { /* no-op */ }

  // 2. Update in Supabase
  if (supabaseAdmin) {
    try {
      const adminUser = await findSupabaseUser(cleanAdmin);
      if (adminUser && adminUser.id) {
        const createdCircles = Array.isArray(adminUser.user_metadata?.created_circles)
          ? adminUser.user_metadata.created_circles
          : [];
        const cIdx = createdCircles.findIndex((c) => c.id === circleId);
        if (cIdx !== -1) {
          const c = createdCircles[cIdx];
          const members = Array.isArray(c.members) ? c.members : [];
          const filtered = members.filter((m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanTarget);
          createdCircles[cIdx] = { ...c, members: filtered };
          updatedCircle = createdCircles[cIdx];
          await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
            user_metadata: { ...adminUser.user_metadata, created_circles: createdCircles },
          });
        }
      }

      // Also remove circle from targetUser's joined_circles
      const targetUser = await findSupabaseUser(cleanTarget);
      if (targetUser && targetUser.id) {
        const joinedCircles = Array.isArray(targetUser.user_metadata?.joined_circles)
          ? targetUser.user_metadata.joined_circles.filter((c) => c.id !== circleId)
          : [];
        await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
          user_metadata: { ...targetUser.user_metadata, joined_circles: joinedCircles },
        });
      }
    } catch (e) {
      console.warn('[Server] Error removing member in Supabase:', e.message);
    }
  }

  return res.json({ success: true, circle: updatedCircle });
});

/**
 * POST /api/circles/leave
 * Member leaves a circle
 */
app.post('/api/circles/leave', async (req, res) => {
  const { username, circleId } = req.body || {};
  if (!username || !circleId) {
    return res.status(400).json({ error: 'username and circleId are required' });
  }
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');

  let updatedCircle = null;

  // 1. Update in local file
  try {
    const circles = loadCirclesFromFile();
    const cIdx = circles.findIndex((c) => c.id === circleId);
    if (cIdx !== -1) {
      const c = circles[cIdx];
      const members = Array.isArray(c.members) ? c.members : [];
      const filtered = members.filter((m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanUser);
      circles[cIdx] = { ...c, members: filtered };
      saveCirclesToFile(circles);
      updatedCircle = circles[cIdx];
    }
  } catch (_e) { /* no-op */ }

  // 2. Update in Supabase
  if (supabaseAdmin) {
    try {
      // Find leaving user and remove from joined_circles
      const leavingUser = await findSupabaseUser(cleanUser);
      if (leavingUser && leavingUser.id) {
        const joined = Array.isArray(leavingUser.user_metadata?.joined_circles)
          ? leavingUser.user_metadata.joined_circles.filter((c) => c.id !== circleId)
          : [];
        await supabaseAdmin.auth.admin.updateUserById(leavingUser.id, {
          user_metadata: { ...leavingUser.user_metadata, joined_circles: joined },
        });
      }

      // Find circle admin in Supabase and update created_circles
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (!error && Array.isArray(users)) {
        for (const u of users) {
          const created = Array.isArray(u.user_metadata?.created_circles) ? u.user_metadata.created_circles : [];
          const cIdx = created.findIndex((c) => c.id === circleId);
          if (cIdx !== -1) {
            const members = Array.isArray(created[cIdx].members) ? created[cIdx].members : [];
            const filtered = members.filter((m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanUser);
            created[cIdx] = { ...created[cIdx], members: filtered };
            updatedCircle = created[cIdx];
            await supabaseAdmin.auth.admin.updateUserById(u.id, {
              user_metadata: { ...u.user_metadata, created_circles: created },
            });
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[Server] Error leaving circle in Supabase:', e.message);
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

// ---------------------------------------------------------------------------
// Battle Zone Storage & Real-Time SSE Infrastructure
// ---------------------------------------------------------------------------
const BATTLES_FILE = path.join(__dirname, 'battles_db.json');
const BATTLE_REQUESTS_FILE = path.join(__dirname, 'battle_requests_db.json');

function loadBattlesFromFile() {
  try {
    if (fs.existsSync(BATTLES_FILE)) {
      const data = JSON.parse(fs.readFileSync(BATTLES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Server] Error reading battles DB file:', err);
  }
  return [];
}

function saveBattlesToFile(battles) {
  try {
    fs.writeFileSync(BATTLES_FILE, JSON.stringify(battles, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving battles DB file:', err);
  }
}

function loadBattleRequestsFromFile() {
  try {
    if (fs.existsSync(BATTLE_REQUESTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BATTLE_REQUESTS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[Server] Error reading battle requests DB file:', err);
  }
  return [];
}

function saveBattleRequestsToFile(requests) {
  try {
    fs.writeFileSync(BATTLE_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving battle requests DB file:', err);
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
    // Timeout in authoring: auto-pick fallback challenges
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

    // Advance to SWAP
    const swapSeconds = battle.settings?.swapCountdownSeconds || 5;
    battle.phase = 'SWAP';
    battle.phaseStartedAt = new Date(now).toISOString();
    battle.phaseDurationSeconds = swapSeconds;
    battle.phaseEndTime = new Date(now + swapSeconds * 1000).toISOString();
    return true;
  }

  if (battle.phase === 'SWAP') {
    // Advance to SOLVING
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

    // If final round, advance directly to FINISHED without intermediate "see final result" button
    if (battle.currentRound >= (battle.totalRounds || 1)) {
      battle.phase = 'FINISHED';
      battle.status = 'finished';
      battle.phaseEndTime = null;

      const scoreA = battle.teams.teamA.score || 0;
      const scoreB = battle.teams.teamB.score || 0;
      let overallWinner = 'tie';
      if (scoreA > scoreB) overallWinner = 'teamA';
      else if (scoreB > scoreA) overallWinner = 'teamB';
      else {
        const timeA = battle.teams.teamA.totalSolveTimeSeconds || 0;
        const timeB = battle.teams.teamB.totalSolveTimeSeconds || 0;
        if (timeA < timeB) overallWinner = 'teamA';
        else if (timeB < timeA) overallWinner = 'teamB';
      }
      battle.winner = overallWinner;

      const allMembers = [
        ...(battle.teams.teamA.members || []).map((m) => ({ ...m, team: 'teamA', teamName: battle.teams.teamA.name })),
        ...(battle.teams.teamB.members || []).map((m) => ({ ...m, team: 'teamB', teamName: battle.teams.teamB.name })),
      ];
      if (allMembers.length > 0) {
        const sorted = [...allMembers].sort((a, b) => (b.score || 0) - (a.score || 0));
        battle.mvp = sorted[0];
      }
      return true;
    }

    // Advance to ROUND_RESULT for multi-round battles
    battle.phase = 'ROUND_RESULT';
    battle.phaseStartedAt = new Date(now).toISOString();
    battle.phaseDurationSeconds = 15;
    battle.phaseEndTime = new Date(now + 15 * 1000).toISOString();
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Battle Zone Endpoints
// ---------------------------------------------------------------------------

// Real-Time SSE Stream for Battle Zone
app.get('/api/battles/:battleId/events', (req, res) => {
  const { battleId } = req.params;
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

  // Keep-alive heartbeat every 15s
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
});

// GET /api/battles/:battleId
app.get('/api/battles/:battleId', (req, res) => {
  const { battleId } = req.params;
  const username = req.query.username;
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }

  const updated = checkAndUpdateBattleTimeouts(battle);
  if (updated) {
    saveBattlesToFile(battles);
    broadcastBattleEvent(battleId, { type: 'phase_change', phase: battle.phase, battle });
  }

  const sanitized = sanitizeBattleForUser(battle, username);
  return res.json({ success: true, battle: sanitized });
});

// POST /api/battles (Create battle)
app.post('/api/battles', (req, res) => {
  const battle = req.body;
  if (!battle || !battle.id) {
    return res.status(400).json({ error: 'Valid battle object required' });
  }

  const battles = loadBattlesFromFile();
  const idx = battles.findIndex((b) => b.id === battle.id);
  if (idx !== -1) {
    battles[idx] = battle;
  } else {
    battles.unshift(battle);
  }
  saveBattlesToFile(battles);
  broadcastBattleEvent(battle.id, { type: 'battle_created', battle });

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/settings
app.post('/api/battles/:battleId/settings', (req, res) => {
  const { battleId } = req.params;
  const { username, updates } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  if (updates) {
    battle.settings = { ...battle.settings, ...updates };
    if (updates.language) {
      battle.language = updates.language;
    }
    battle.teams.teamA.captainReady = false;
    battle.teams.teamB.captainReady = false;
  }
  saveBattlesToFile(battles);
  broadcastBattleEvent(battleId, { type: 'settings_updated', battle, updatedBy: username });

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/ready
app.post('/api/battles/:battleId/ready', (req, res) => {
  const { battleId } = req.params;
  const { username, teamKey, isReady } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  if (battle.teams[teamKey]) {
    battle.teams[teamKey].captainReady = Boolean(isReady);
  }
  saveBattlesToFile(battles);
  broadcastBattleEvent(battleId, { type: 'captain_ready', teamKey, isReady, battle });

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/start
app.post('/api/battles/:battleId/start', (req, res) => {
  const { battleId } = req.params;
  const { username } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

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

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/sync-code (Real-time collaborative editing for teammates)
app.post('/api/battles/:battleId/sync-code', (req, res) => {
  const { battleId } = req.params;
  const { username, teamKey, code, stdin } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  if (battle.teams[teamKey]) {
    battle.teams[teamKey].code = code;
    if (stdin !== undefined) battle.teams[teamKey].stdin = stdin;
    battle.teams[teamKey].status = 'writing';
  }
  saveBattlesToFile(battles);
  broadcastBattleEvent(battleId, { type: 'code_sync', teamKey, code, user: username });

  return res.json({ success: true });
});

// POST /api/battles/:battleId/challenge (Publish authoring challenge)
app.post('/api/battles/:battleId/challenge', (req, res) => {
  const { battleId } = req.params;
  const { username, teamKey, challenge } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  const currentRound = battle.rounds[battle.currentRound - 1];
  if (teamKey === 'teamA') {
    currentRound.teamAChallenge = challenge;
    battle.teams.teamA.status = 'submitted';
  } else {
    currentRound.teamBChallenge = challenge;
    battle.teams.teamB.status = 'submitted';
  }

  // If both published, trigger SWAP countdown!
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

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/submit (Submit solution for evaluation)
app.post('/api/battles/:battleId/submit', (req, res) => {
  const { battleId } = req.params;
  const { username, teamKey, submission } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

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

  // Check if both teams completed
  if (currentRound.teamASubmission?.allPassed && currentRound.teamBSubmission?.allPassed) {
    checkAndUpdateBattleTimeouts(battle);
  }

  saveBattlesToFile(battles);
  broadcastBattleEvent(battleId, { type: 'submission_result', teamKey, allPassed: submission.allPassed, battle });

  return res.json({ success: true, battle });
});

// POST /api/battles/:battleId/time (Set or extend custom battle time)
app.post('/api/battles/:battleId/time', (req, res) => {
  const { battleId } = req.params;
  const { minutes, addMinutes, username } = req.body || {};
  const battles = loadBattlesFromFile();
  const battle = battles.find((b) => b.id === battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  const now = Date.now();
  if (minutes !== undefined && minutes !== null) {
    const mins = Math.max(1, Math.min(180, Number(minutes)));
    if (!battle.settings) battle.settings = {};
    battle.settings.solvingTimeMinutes = mins;
    battle.phaseDurationSeconds = mins * 60;
    battle.phaseEndTime = new Date(now + mins * 60 * 1000).toISOString();
  } else if (addMinutes) {
    const curEnd = new Date(battle.phaseEndTime || now).getTime();
    const newEnd = Math.max(now + 30 * 1000, curEnd + Number(addMinutes) * 60 * 1000);
    battle.phaseEndTime = new Date(newEnd).toISOString();
    battle.phaseDurationSeconds = Math.round((newEnd - now) / 1000);
  }

  if (username) {
    if (!battle.events) battle.events = [];
    battle.events.push({
      id: `ev_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'time_updated',
      user: username,
      message: `Battle time adjusted by @${username}`,
    });
  }

  saveBattlesToFile(battles);
  broadcastBattleEvent(battleId, { type: 'time_updated', battle, phaseEndTime: battle.phaseEndTime });
  return res.json({ success: true, battle });
});

// Battle Requests Endpoints
app.get('/api/battles/requests/:circleId', (req, res) => {
  const { circleId } = req.params;
  const all = loadBattleRequestsFromFile();
  const filtered = all.filter((r) => r.toCircleId === circleId && r.status === 'pending');
  return res.json({ success: true, requests: filtered });
});

app.post('/api/battles/requests', (req, res) => {
  const reqData = req.body;
  if (!reqData || !reqData.fromCircleId || !reqData.toCircleId) {
    return res.status(400).json({ error: 'Valid request data required' });
  }
  const all = loadBattleRequestsFromFile();
  all.unshift(reqData);
  saveBattleRequestsToFile(all);
  return res.json({ success: true, request: reqData });
});

app.post('/api/battles/requests/:requestId/respond', (req, res) => {
  const { requestId } = req.params;
  const { username, accept } = req.body || {};
  const all = loadBattleRequestsFromFile();
  const idx = all.findIndex((r) => r.id === requestId);
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });

  all[idx].status = accept ? 'accepted' : 'declined';
  saveBattleRequestsToFile(all);
  return res.json({ success: true, request: all[idx] });
});

/**
 * POST /api/users/save-code
 * Saves the user's code to their Supabase user_metadata.saved_code field.
 * Falls back gracefully if Supabase is unavailable.
 */
app.post('/api/users/save-code', async (req, res) => {
  const { email, code_text } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }
  if (typeof code_text !== 'string') {
    return res.status(400).json({ error: 'code_text is required' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase admin not available' });
  }
  try {
    const user = await findSupabaseUser(email.trim().toLowerCase());
    if (!user || !user.id) {
      return res.status(404).json({ error: 'User not found' });
    }
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, saved_code: code_text },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Production fallback to index.html for client routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`C Compiler & Supabase Auth Server running on http://localhost:${PORT}`);
  });
}

export default app;

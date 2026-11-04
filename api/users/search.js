import { supabaseAdmin, setCorsHeaders } from '../_supabase.js';

// Server-side IP rate limiting map: 30 requests per minute
const ipRateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 30;

  const timestamps = (ipRateMap.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) {
    return false;
  }
  timestamps.push(now);
  ipRateMap.set(ip, timestamps);
  return true;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
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
          id: u.id,
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
    console.error('Search error:', err);
    return res.status(500).json({ error: err.message });
  }
}

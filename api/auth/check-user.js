import { findSupabaseUser, setCorsHeaders } from '../_supabase.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { identifier } = body;

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
        password: user.user_metadata?.password || '',
        trustedDevices: Array.isArray(user.user_metadata?.trustedDevices)
          ? user.user_metadata.trustedDevices
          : [],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

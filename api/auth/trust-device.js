import { supabaseAdmin, findSupabaseUser, setCorsHeaders } from '../_supabase.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin client not configured' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { identifier, deviceId } = body;

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
}

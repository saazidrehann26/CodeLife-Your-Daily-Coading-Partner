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
    const { identifier, newPassword } = body;

    if (!identifier || !newPassword) {
      return res.status(400).json({ error: 'Identifier and newPassword are required' });
    }

    const user = await findSupabaseUser(identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword.trim(),
      user_metadata: {
        ...user.user_metadata,
        password: newPassword.trim(),
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

import { supabaseAdmin, setCorsHeaders } from '../_supabase.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      password: u.user_metadata?.password || '',
      trustedDevices: Array.isArray(u.user_metadata?.trustedDevices)
        ? u.user_metadata.trustedDevices
        : [],
      createdAt: u.created_at,
    }));

    return res.json({ users: sanitized });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

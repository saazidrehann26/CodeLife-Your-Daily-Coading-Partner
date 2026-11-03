import { supabaseAdmin, findSupabaseUser, isValidApprovedEmail, setCorsHeaders } from '../_supabase.js';

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
    const { name, username, email, institution, password, deviceId } = body;

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

    // Check if email already registered
    const existingEmail = await findSupabaseUser(cleanEmail);
    if (existingEmail) {
      return res.status(400).json({ error: 'This email is already registered in our database. Please sign in.' });
    }

    // Check if username already registered
    const existingUser = await findSupabaseUser(cleanUser);
    if (existingUser) {
      return res.status(400).json({ error: 'This username is already taken. Please choose another username.' });
    }

    const trustedDevices = deviceId ? [deviceId] : [];

    // Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password.trim(),
      email_confirm: true,
      user_metadata: {
        name: (name || '').trim(),
        username: cleanUser,
        institution: (institution || '').trim(),
        password: password.trim(),
        trustedDevices,
        createdAt: new Date().toISOString(),
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Also record into 'User Information' table
    try {
      await supabaseAdmin.from('User Information').insert([{ email: cleanEmail }]);
    } catch (e) {
      console.warn('Could not insert to User Information table:', e.message);
    }

    return res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
        username: data.user.user_metadata?.username,
        institution: data.user.user_metadata?.institution,
        password: password.trim(),
        trustedDevices,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

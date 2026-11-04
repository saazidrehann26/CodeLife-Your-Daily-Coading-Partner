import { supabaseAdmin, setCorsHeaders } from '../_supabase.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const username = String(req.query?.username || req.query?.u || '').trim().toLowerCase();
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

    // Strict Sanitized DTO: Never exposes email, phone, password, device IDs
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
    console.error('Public profile error:', err);
    return res.status(500).json({ error: err.message });
  }
}

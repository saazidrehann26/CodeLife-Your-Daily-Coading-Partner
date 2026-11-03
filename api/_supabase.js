import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Automatically load local .env if present and environment variables not yet populated
if (!process.env.SUPABASE_SECRET_KEY && typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Ignore in production environments
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dbbkdoaemwuoducpvxog.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export const supabaseAdmin = SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Strict Email Security Validation
 * Only permits:
 *  1. Gmail (domain strictly 'gmail.com')
 *  2. Educational domains (.edu, .edu.xx, .ac.xx)
 */
export function isValidApprovedEmail(email) {
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

/**
 * Helper to find user in Supabase by email or username
 */
export async function findSupabaseUser(identifier) {
  if (!supabaseAdmin || !identifier) return null;
  const clean = identifier.trim().toLowerCase();

  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error || !Array.isArray(users)) return null;

    return (
      users.find(
        (u) =>
          u.email?.toLowerCase() === clean ||
          u.user_metadata?.username?.toLowerCase() === clean
      ) || null
    );
  } catch (e) {
    console.error('Error finding Supabase user:', e);
    return null;
  }
}

/**
 * Helper to set standard CORS headers on API responses
 */
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

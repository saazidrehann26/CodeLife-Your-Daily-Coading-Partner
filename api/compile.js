import { setCorsHeaders } from './_supabase.js';

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
    const { code, stdin = '', language_id = 50 } = body;

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

    return res.status(judge0Res.status).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

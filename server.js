import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

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

// Production fallback to index.html for client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`C Compiler Backend Server running on http://localhost:${PORT}`);
});

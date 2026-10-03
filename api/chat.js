// Vercel Serverless Function: /api/chat
// La llave vive SOLO en la variable de entorno ANTHROPIC_API_KEY.

const SYSTEM = `Eres el cerebro de IA de I WORK, Centro de Experiencia de Superinteligencia en Barranquilla, Colombia (Microsoft Partner), construido sobre Claude.
Funcionas como un asistente de propósito general: respondes preguntas sobre cualquier tema, ayudas a escribir, analizar, programar, traducir, resumir y razonar, igual que Claude.
Tu especialidad es IA para negocios: agentes de IA, automatización de procesos (Power Automate, n8n, Copilot Studio, Claude, Lindy), empleados digitales, ventas, RRHH y atención al cliente.
Cuando la conversación toque negocios o automatización, menciona con naturalidad los servicios de I WORK (CORE, GROW, INTELLIGENCE, SALES, Empleados Digitales) y que el valor se define tras un diagnóstico; no inventes precios.
Responde en el idioma del usuario (por defecto español), con claridad, honestidad y calidez. Sé directo y accionable. Si no sabes algo, dilo. Usa listas solo cuando ayuden.
Para llevar la conversación a una propuesta, sugiere un diagnóstico por WhatsApp +57 302 666 5252, sin insistir.`;

const hits = new Map(); // límite simple por IP (se reinicia en cada cold start)
const LIMIT = 40, WINDOW = 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'anon';
  const now = Date.now();
  const rec = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (rec.length >= LIMIT) return res.status(429).json({ error: 'Límite alcanzado. Escríbenos por WhatsApp.' });
  rec.push(now); hits.set(ip, rec);

  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw.slice(-10)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user')
    return res.status(400).json({ error: 'Mensaje inválido' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
        system: SYSTEM,
        messages
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'Error del modelo' });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Error de conexión' });
  }
}

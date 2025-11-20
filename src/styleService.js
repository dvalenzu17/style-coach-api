import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase env not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null

function trimSentenceWords(text, maxWords) {
  if (!text) return ''
  const words = String(text).split(/\s+/)
  if (words.length <= maxWords) return text.trim()
  return words.slice(0, maxWords).join(' ').replace(/[.,;:!?]*$/, '') + '…'
}

async function getUserStyleContext(userId) {
  if (!supabase) {
    return {
      summaryText:
        'No database context is available. Suggest outfits based only on the selected pieces, goal, and vibe.',
    }
  }

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
  const fromIso = fromDate.toISOString().slice(0, 10)

  const [logsRes, profileRes] = await Promise.all([
    supabase
      .from('outfit_logs')
      .select('log_date, rating, tags')
      .eq('user_id', userId)
      .gte('log_date', fromIso),
    supabase
      .from('profiles')
      .select('fit_preference, color_comfort, no_go_items')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const logs = logsRes.data || []
  const profile = profileRes.data || null

  let avgRating = null
  let ratingCount = 0
  let ratingSum = 0
  const tagCounts = {}

  for (const log of logs) {
    if (typeof log.rating === 'number') {
      ratingCount += 1
      ratingSum += log.rating
    }
    if (Array.isArray(log.tags)) {
      for (const t of log.tags) {
        const tag = String(t).trim()
        if (!tag) continue
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }
  }

  if (ratingCount > 0) {
    avgRating = ratingSum / ratingCount
  }

  const positiveSignals = []
  const negativeSignals = []

  for (const [tag, count] of Object.entries(tagCounts)) {
    const lower = tag.toLowerCase()
    const entry = `${tag} (${count}x)`
    if (lower.includes('loved') || lower.includes('perfect')) {
      positiveSignals.push(entry)
    } else if (
      lower.includes('too warm') ||
      lower.includes('too cold') ||
      lower.includes('not confident')
    ) {
      negativeSignals.push(entry)
    }
  }

  const lines = []

  if (profile) {
    const { fit_preference, color_comfort, no_go_items } = profile
    if (fit_preference || color_comfort || (no_go_items && no_go_items.length)) {
      lines.push('Style profile:')
      if (fit_preference) {
        lines.push(`- Fit preference: ${fit_preference}`)
      }
      if (color_comfort) {
        lines.push(`- Color comfort: ${color_comfort}`)
      }
      if (Array.isArray(no_go_items) && no_go_items.length) {
        lines.push(`- Avoid these items: ${no_go_items.join(', ')}`)
      }
    }
  }

  if (logs.length > 0) {
    lines.push(
      `Recent history: ${logs.length} outfit log${logs.length === 1 ? '' : 's'} in the last 30 days.`
    )
  } else {
    lines.push('Recent history: no outfit logs in the last 30 days.')
  }

  if (avgRating != null) {
    lines.push(`Average rating: ${avgRating.toFixed(1)} / 5.`)
  }

  if (positiveSignals.length) {
    lines.push(
      `Positive tags (things the user tends to like): ${positiveSignals.join(', ')}.`
    )
  }

  if (negativeSignals.length) {
    lines.push(
      `Negative tags (avoid leaning into these): ${negativeSignals.join(', ')}.`
    )
  }

  if (!lines.length) {
    lines.push(
      'No usable history or profile found. Suggest outfits based only on the selected pieces, goal, and vibe.'
    )
  }

  return {
    summaryText: lines.join('\n'),
  }
}

function buildPrompt({ goal, vibe, items, context }) {
  const safeGoal = goal && goal.trim().length ? goal.trim() : 'everyday wear'
  const safeVibe = vibe && vibe.trim().length ? vibe.trim() : 'casual but put-together'

  const lines = items.map((it, idx) => {
    const name = it.name || it.category || `Item ${idx + 1}`
    const cat = it.category ? `(${it.category})` : ''
    const color = it.color ? `, color: ${it.color}` : ''
    const notes = it.notes ? `, notes: ${it.notes}` : ''
    return `- ${name} ${cat}${color}${notes}`
  })

  const itemsBlock = lines.length
    ? lines.join('\n')
    : '- No specific pieces provided. Suggest a generic outfit within the goal + vibe.'

  const historyBlock =
    context && context.summaryText
      ? context.summaryText
      : 'No historical logs or preferences available.'

  return `
You are a concise, practical personal stylist. Your job is to help the user style the pieces they selected.

User's goal for this outfit:
- ${safeGoal}

User's desired vibe:
- ${safeVibe}

Pieces the user is working with:
${itemsBlock}

What you know about this user from their history and profile:
${historyBlock}

Rules:
- Keep responses short, bullet-based and concrete.
- Respect the user's style profile and avoid "no-go" items or patterns hinted by negative tags.
- If tags like "Too warm" or "Too cold" appear often, adjust layering and fabric weight accordingly.
- If tags like "Loved" or "Perfect" appear often, lean into those silhouettes, colors and combinations.
- If there is very little data, make safe, versatile suggestions.

Respond with 3–5 bullet points.
Each bullet:
- focuses on a single clear idea (e.g., "Pair the trousers with a tucked-in tee and blazer").
- should not exceed ~22 words.
Do not include any preamble or numbering, just the bullet points starting with a dash.
`.trim()
}

async function callModel(prompt) {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a fashion stylist that replies in short, sharp, realistic outfit advice. No fluff, no emojis, no long paragraphs.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 300,
  })

  const raw = completion.choices?.[0]?.message?.content || ''
  return raw
}

function parseSuggestions(rawText) {
  if (!rawText) return []

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const cleaned = []

  for (let line of lines) {
    line = line.replace(/^[-•\d.)\s]+/, '').trim()
    if (!line) continue
    cleaned.push(line)
  }

  const finalSuggestions = cleaned
    .map(s => (typeof s === 'string' ? s.trim() : String(s || '')))
    .filter(s => s.length > 0)
    .map(s => trimSentenceWords(s, 22))
    .slice(0, 5)

  return finalSuggestions
}

export async function getSuggestionsForUser({ userId, goal, vibe, items }) {
  if (!userId) {
    throw new Error('userId is required')
  }

  const context = await getUserStyleContext(userId)
  const prompt = buildPrompt({ goal, vibe, items: items || [], context })
  const raw = await callModel(prompt)
  const suggestions = parseSuggestions(raw)

  if (!suggestions.length) {
    throw new Error('No clean suggestions generated')
  }

  return suggestions
}

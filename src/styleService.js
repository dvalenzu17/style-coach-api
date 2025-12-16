import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { writeLog } from './logger.js'
import { recordInteraction } from './styleHistory.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
const HISTORY_DAYS = 30

function nowUtc() {
  return new Date().toISOString()
}

function toDateDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function safeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return [value]
}

function summariseTags(rows) {
  const tagCounts = {}
  for (const row of rows) {
    const tags = safeArray(row.tags)
    for (const t of tags) {
      const tag = String(t || '').trim().toLowerCase()
      if (!tag) continue
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
  }
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
  return sorted.slice(0, 6).map(([tag]) => tag)
}

function summariseRatings(rows) {
  const ratings = rows
    .map(r => (typeof r.rating === 'number' ? r.rating : null))
    .filter(r => r !== null)
  if (!ratings.length) return { avgRating: null, count: 0 }
  const sum = ratings.reduce((a, b) => a + b, 0)
  const avg = sum / ratings.length
  return { avgRating: avg, count: ratings.length }
}

async function getUserStyleContext(userId) {
  if (!userId) {
    throw Object.assign(new Error('userId is required'), {
      code: 'MISSING_USER_ID',
    })
  }
  if (!supabase) {
    return {
      summaryText:
        'No usage history available. Suggest versatile outfits based only on the provided items and style profile.',
      meta: {
        hasHistory: false,
        logCount: 0,
        avgRating: null,
        topTags: [],
      },
    }
  }

  const fromDate = toDateDaysAgo(HISTORY_DAYS)

  const { data, error } = await supabase
    .from('outfit_logs')
    .select('log_date,rating,tags')
    .eq('user_id', userId)
    .gte('log_date', fromDate)
    .order('log_date', { ascending: false })

  if (error) {
    console.error('Supabase outfit_logs error', error)
    return {
      summaryText:
        'No reliable history due to a data error. Suggest safe, versatile outfits.',
      meta: {
        hasHistory: false,
        logCount: 0,
        avgRating: null,
        topTags: [],
      },
    }
  }

  if (!data || !data.length) {
    return {
      summaryText:
        'No recent outfit history. Suggest simple, easy-to-wear outfits that would suit most people.',
      meta: {
        hasHistory: false,
        logCount: 0,
        avgRating: null,
        topTags: [],
      },
    }
  }

  const { avgRating, count } = summariseRatings(data)
  const topTags = summariseTags(data)

  const parts = []
  parts.push(`There are ${count} logged outfits in the last ${HISTORY_DAYS} days.`)
  if (avgRating != null) {
    parts.push(`Average rating is about ${avgRating.toFixed(1)} out of 5.`)
  }
  if (topTags.length) {
    parts.push(`Frequent feedback tags: ${topTags.join(', ')}.`)
  }
  parts.push(
    'Respect this history: lean into what worked and avoid repeating what did not.'
  )

  return {
    summaryText: parts.join(' '),
    meta: {
      hasHistory: true,
      logCount: count,
      avgRating,
      topTags,
    },
  }
}

function summariseStyleProfile(styleProfile) {
  if (!styleProfile) {
    return 'Style profile: not specified. Default to flattering, confidence-boosting outfits that are easy to wear.'
  }

  const lines = []
  if (styleProfile.bodyType) {
    lines.push(`Body type: ${String(styleProfile.bodyType)}`)
  }
  if (styleProfile.faceShape) {
    lines.push(`Face shape: ${String(styleProfile.faceShape)}`)
  }
  if (styleProfile.skinTone || styleProfile.colorPalette) {
    lines.push(
      `Skin tone / colour palette: ${String(
        styleProfile.skinTone || styleProfile.colorPalette
      )}`
    )
  }
  if (styleProfile.fitPreference) {
    lines.push(`Preferred fit: ${String(styleProfile.fitPreference)}`)
  }
  if (styleProfile.colourPreference) {
    lines.push(`Preferred colours: ${String(styleProfile.colourPreference)}`)
  }
  const noGo = safeArray(styleProfile.noGo || styleProfile.noGoItems)
  if (noGo.length) {
    lines.push(`Avoid: ${noGo.join(', ')}`)
  }

  if (!lines.length) {
    return 'Style profile: basic preferences only. Keep outfits comfortable, modern and not too experimental.'
  }

  return `Style profile: ${lines.join(' | ')}`
}

function summariseWeather(weather) {
  if (!weather)
    return 'Weather: not provided. Assume mild, comfortable conditions.'
  const parts = []
  if (weather.tempBucket) {
    parts.push(`Overall it is ${weather.tempBucket}.`)
  }
  if (typeof weather.temp === 'number') {
    parts.push(`Approx temperature: ${Math.round(weather.temp)}°C.`)
  }
  if (weather.description) {
    parts.push(`Conditions: ${weather.description}.`)
  }
  return `Weather context: ${parts.join(
    ' '
  )} Focus on pieces that feel appropriate for this temperature and conditions.`
}

function buildItemsBlock(items) {
  if (!items || !items.length) {
    return 'Wardrobe items provided: none. Base your advice on generic but realistic pieces.'
  }

  const lines = items.map((it, idx) => {
    const baseName = it.name || it.label || `Item ${idx + 1}`
    const parts = [baseName]
    if (it.category) parts.push(`category: ${it.category}`)
    if (it.color) parts.push(`color: ${it.color}`)
    if (it.notes) parts.push(`notes: ${it.notes}`)
    return `- ${parts.join(', ')}`
  })

  return `Wardrobe items that can be used:\n${lines.join('\n')}`
}

function buildPrompt({ goal, vibe, items, styleProfile, weather, context }) {
  const safeGoal = goal && goal.trim().length ? goal.trim() : 'everyday wear'
  const safeVibe =
    vibe && vibe.trim().length ? vibe.trim() : 'casual but put-together'

  const lines = []

  lines.push(`User goal: ${safeGoal}.`)
  lines.push(`Requested vibe: ${safeVibe}.`)

  lines.push(summariseStyleProfile(styleProfile))
  lines.push(summariseWeather(weather))

  if (context && context.summaryText) {
    lines.push(`Recent outfit history:\n${context.summaryText}`)
  } else {
    lines.push('No meaningful outfit history is available.')
  }

  lines.push(buildItemsBlock(items))

  lines.push(
    'Using only these items and this context, propose 3–5 specific outfit suggestions that match the goal and vibe. Each suggestion should be one concise bullet point, 10–30 words, describing which pieces to combine and any small styling details (e.g. tuck, roll sleeves, add belt). Avoid mentioning items that were not provided.'
  )

  return lines.join('\n\n')
}

function cleanSuggestions(rawText) {
  if (!rawText) return []

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const bullets = []

  for (let line of lines) {
    line = line.replace(/^[\-•\d\.\)]\s*/, '').trim()
    if (!line) continue
    if (line.toLowerCase().startsWith('suggestion')) {
      line = line.replace(/^suggestion\s*\d*[:\-]?\s*/i, '').trim()
    }
    if (!line) continue
    bullets.push(line)
  }

  const unique = []
  const seen = new Set()
  for (const b of bullets) {
    const key = b.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(b)
    if (unique.length >= 5) break
  }

  return unique
}

export async function getStyleSuggestionsLLM(args) {
  const {
    userId,
    items = [],
    goal = '',
    vibe = '',
    styleProfile = null,
    weather = null,
  } = args || {}

  const context = await getUserStyleContext(userId)

  const prompt = buildPrompt({
    goal,
    vibe,
    items,
    styleProfile,
    weather,
    context,
  })

  const systemMessage =
    "You are a concise, practical personal stylist. You only suggest outfits made from the wardrobe items you are given. You always respect the user's stated preferences, body type, colour comfort and no-go items. Your tone is calm, confident and non-judgemental."

  let completion
  try {
    completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 400,
    })
  } catch (err) {
    console.error('OpenAI error in getStyleSuggestionsLLM', err)
    throw Object.assign(new Error('model_error'), { code: 'MODEL_ERROR' })
  }

  const raw = completion?.choices?.[0]?.message?.content?.trim() || ''
  const suggestions = cleanSuggestions(raw)

  if (!suggestions.length) {
    throw Object.assign(new Error('No clean suggestions generated'), {
      code: 'NO_SUGGESTIONS',
    })
  }

  try {
    writeLog({
      type: 'style_suggestion',
      userId: userId || null,
      ts: nowUtc(),
      goal,
      vibe,
      itemCount: items.length,
      hasWeather: !!weather,
    })
  } catch (e) {
    console.error('Failed to write style log', e)
  }

  try {
    recordInteraction({
      userId: userId || null,
      goal,
      vibe,
      items,
      suggestions,
      weather,
      createdAt: nowUtc(),
    })
  } catch (e) {
    console.error('Failed to record style interaction', e)
  }

  const meta = {
    ...(context.meta || {}),
    usedStyleProfile: !!styleProfile,
    usedWeather: !!weather,
  }

  return { suggestions, meta }
}

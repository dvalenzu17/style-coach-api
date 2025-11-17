import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function buildPrompt({ goal, vibe, items, styleProfile }) {
  const safeGoal = goal && goal.trim().length ? goal.trim() : 'everyday wear'
  const safeVibe = vibe && vibe.trim().length ? vibe.trim() : 'casual but put-together'

  const lines = (items || [])
    .map((it, idx) => {
      const name = it.name || it.category || `Item ${idx + 1}`
      const cat = it.category ? `(${it.category})` : ''
      const color = it.color ? `, color: ${it.color}` : ''
      const notes = it.notes ? `, notes: ${it.notes}` : ''
      return `- ${name} ${cat}${color}${notes}`
    })
    .join('\n')

  let profileBlock = ''
  if (styleProfile) {
    const parts = []
    if (Array.isArray(styleProfile.goals) && styleProfile.goals.length) {
      parts.push(`often dressing for: ${styleProfile.goals.join(', ')}`)
    }
    if (Array.isArray(styleProfile.vibes) && styleProfile.vibes.length) {
      parts.push(`prefers vibes: ${styleProfile.vibes.join(', ')}`)
    }
    if (Array.isArray(styleProfile.categories) && styleProfile.categories.length) {
      parts.push(`frequently uses categories: ${styleProfile.categories.join(', ')}`)
    }
    if (Array.isArray(styleProfile.colors) && styleProfile.colors.length) {
      parts.push(`leans toward colors: ${styleProfile.colors.join(', ')}`)
    }
    if (parts.length) {
      profileBlock = '\n\nUser style summary: ' + parts.join('. ') + '.'
    }
  }

  return `
You are a modern, neutral fashion stylist. Give clear, realistic outfit guidance the user can wear in everyday life.${profileBlock}

Goal: ${safeGoal}
Vibe: ${safeVibe}

Selected pieces:
${lines}

Voice and tone:
- Modern, neutral, friendly.
- Direct and practical: focus on what to wear and how to combine pieces.
- No regional references, no slang, no gendered assumptions.
- Assume the user wants comfortable, repeatable outfits, not runway looks.

Output format:
- Return EXACTLY 3 to 5 lines.
- Each line must start with "- " and be ONE short sentence.
- Max about 20–22 words per sentence.
- No introductions, no paragraphs, no closing remarks.
- No emojis, no markdown beyond the "- " at the start.

Each line should be a clear action using the selected pieces plus simple basics (plain tee, jeans, blazer, hoodie, simple accessories).
  `.trim()
}

function splitIntoSentences(text) {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const parts = raw.split(/(?<=[.!?])\s+/g)
  return parts.map(s => s.trim()).filter(Boolean)
}

function trimSentenceWords(sentence, maxWords = 22) {
  const words = sentence.split(/\s+/)
  if (words.length <= maxWords) return sentence
  const cut = words.slice(0, maxWords).join(' ')
  return cut.replace(/[.,;:!?]*$/, '') + '...'
}

export async function getStyleSuggestionsLLM({ goal, vibe, items, styleProfile }) {
  const prompt = buildPrompt({ goal, vibe, items, styleProfile })

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a concise, practical fashion stylist. Give direct outfit actions in a modern, neutral tone, no fluff.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 220
  })

  const text = completion.choices?.[0]?.message?.content || ''
  if (!text.trim()) {
    throw new Error('Empty response from model')
  }

  let lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const bulletLines = lines.filter(l => l.startsWith('-'))
  let suggestions = bulletLines.length ? bulletLines : lines

  suggestions = suggestions
    .map(line => line.replace(/^[-•\d\.\)]\s*/, '').trim())
    .filter(Boolean)

  if (suggestions.length <= 1) {
    const sentences = splitIntoSentences(text)
    suggestions = sentences
      .map(s => s.replace(/^[-•\d\.\)]\s*/, '').trim())
      .filter(Boolean)
  }

  if (!suggestions.length) {
    throw new Error('No suggestions generated')
  }

  const finalSuggestions = suggestions
    .map(s => (typeof s === 'string' ? s.trim() : String(s || '')))
    .filter(s => s.length > 0)
    .map(s => trimSentenceWords(s, 22))
    .slice(0, 5)

  if (!finalSuggestions.length) {
    throw new Error('No clean suggestions generated')
  }

  return finalSuggestions
}

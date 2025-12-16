import { Router } from 'express'
import { getStyleSuggestionsLLM } from './styleService.js'

const router = Router()

router.post('/suggest', async (req, res) => {
  try {
    const { userId, items, goal, vibe, styleProfile, weather } = req.body || {}

    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' })
    }

    const { suggestions, meta } = await getStyleSuggestionsLLM({
      userId,
      items: items || [],
      goal: goal || '',
      vibe: vibe || '',
      styleProfile: styleProfile || null,
      weather: weather || null,
    })

    return res.json({
      suggestions,
      meta: meta || null,
    })
  } catch (err) {
    console.error('Error in /api/style/suggest', err)

    if (err && err.code === 'MODEL_ERROR') {
      return res.status(502).json({ error: 'model_error' })
    }

    if (err && err.code === 'NO_SUGGESTIONS') {
      return res.status(502).json({ error: 'no_suggestions' })
    }

    if (err && err.code === 'MISSING_USER_ID') {
      return res.status(400).json({ error: 'missing_user_id' })
    }

    return res.status(500).json({ error: 'style_suggest_failed' })
  }
})

export default router

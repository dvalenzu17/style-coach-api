// styleRouter.js
import { Router } from 'express'
import { getStyleSuggestionsLLM } from './styleService.js'

const router = Router()

// POST /api/style/suggest
router.post('/suggest', async (req, res) => {
  try {
    const { userId, items, goal, vibe, styleProfile, weather } = req.body || {}

    const { suggestions, meta } = await getStyleSuggestionsLLM({
      userId,
      items: items || [],
      goal: goal || '',
      vibe: vibe || '',
      styleProfile: styleProfile || null,
      weather: weather || null,
    })

    res.json({
      suggestions,
      meta: meta || null,
    })
  } catch (err) {
    console.error('Error in /api/style/suggest', err)
    res.status(500).json({ error: 'style_suggest_failed' })
  }
})

export default router

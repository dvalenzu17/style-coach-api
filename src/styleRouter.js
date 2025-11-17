import express from 'express'
import { getStyleSuggestionsLLM } from './styleService.js'
import { writeLog } from './logger.js'

const router = express.Router()

router.post('/suggest', async (req, res) => {
  const start = Date.now()

  try {
    const { userId, goal, vibe, items } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const normalizedItems = items.map(it => ({
      name: typeof it.name === 'string' ? it.name : '',
      category: typeof it.category === 'string' ? it.category : '',
      color: typeof it.color === 'string' ? it.color : '',
      notes: typeof it.notes === 'string' ? it.notes : ''
    }))

    const suggestions = await getStyleSuggestionsLLM({
      goal: typeof goal === 'string' ? goal : '',
      vibe: typeof vibe === 'string' ? vibe : '',
      items: normalizedItems
    })

    const uid =
      typeof userId === 'string' && userId.trim().length
        ? userId.trim()
        : 'anon'

    res.json({ userId: uid, suggestions })

    writeLog({
      userId: uid,
      goal: goal || '',
      vibe: vibe || '',
      items: normalizedItems,
      suggestions,
      durationMs: Date.now() - start
    })
  } catch (err) {
    console.error('style /suggest error:', err)
    res.status(500).json({ error: 'Failed to generate suggestions' })
  }
})

export default router

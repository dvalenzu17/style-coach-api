import { Router } from 'express'
import { getSuggestionsForUser } from './styleService.js'

const router = Router()

router.post('/suggest', async (req, res) => {
  try {
    const { userId, goal, vibe, items } = req.body || {}

    if (!userId) {
      return res.status(400).json({ error: 'userId_required' })
    }

    const suggestions = await getSuggestionsForUser({
      userId,
      goal: goal || '',
      vibe: vibe || '',
      items: Array.isArray(items) ? items : [],
    })

    res.json({ suggestions })
  } catch (err) {
    console.error('Error generating style suggestions:', err)
    res.status(500).json({ error: 'failed_to_generate_suggestions' })
  }
})

export default router

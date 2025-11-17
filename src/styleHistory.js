import fs from 'fs'
import path from 'path'

const logDir = path.join(process.cwd(), 'logs')
const logFile = path.join(logDir, 'style-requests.log')

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

export function recordInteraction(entry) {
  const payload = {
    ts: new Date().toISOString(),
    ...entry
  }
  const line = JSON.stringify(payload) + '\n'
  fs.appendFile(logFile, line, err => {
    if (err) console.error('recordInteraction error', err)
  })
}

export function getUserStyleProfile(userId) {
  try {
    if (!fs.existsSync(logFile)) return null
    const data = fs.readFileSync(logFile, 'utf8')
    const lines = data.split('\n').filter(Boolean)

    const target = userId && userId !== 'anon' ? userId : null
    const userEntries = []

    for (let i = lines.length - 1; i >= 0 && userEntries.length < 200; i--) {
      const line = lines[i]
      try {
        const obj = JSON.parse(line)
        if (target) {
          if (obj.userId === target) userEntries.push(obj)
        } else {
          userEntries.push(obj)
        }
      } catch (e) {}
    }

    if (!userEntries.length) return null

    const goalCounts = new Map()
    const vibeCounts = new Map()
    const categoryCounts = new Map()
    const colorCounts = new Map()

    for (const entry of userEntries) {
      const g = (entry.goal || '').trim()
      const v = (entry.vibe || '').trim()
      if (g) goalCounts.set(g, (goalCounts.get(g) || 0) + 1)
      if (v) vibeCounts.set(v, (vibeCounts.get(v) || 0) + 1)

      const items = Array.isArray(entry.items) ? entry.items : []
      for (const it of items) {
        const c = (it.category || '').trim()
        const col = (it.color || '').trim()
        if (c) categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1)
        if (col) colorCounts.set(col, (colorCounts.get(col) || 0) + 1)
      }
    }

    function topKeys(map, limit) {
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k]) => k)
    }

    const topGoals = topKeys(goalCounts, 2)
    const topVibes = topKeys(vibeCounts, 2)
    const topCategories = topKeys(categoryCounts, 3)
    const topColors = topKeys(colorCounts, 3)

    return {
      goals: topGoals,
      vibes: topVibes,
      categories: topCategories,
      colors: topColors
    }
  } catch (err) {
    console.error('getUserStyleProfile error:', err)
    return null
  }
}

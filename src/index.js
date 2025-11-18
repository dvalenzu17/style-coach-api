import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import FormData from 'form-data'
import styleRouter from './styleRouter.js'
import { getStyleSuggestionsLLM } from './styleService.js'

const app = express()

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'

app.use(cors({ origin: allowedOrigin, credentials: false }))
app.use(express.json())

app.post('/api/image/remove-bg', async (req, res) => {
  try {
    const { image_file_b64 } = req.body
    if (!image_file_b64) {
      return res.status(400).json({ error: 'image_file_b64 required' })
    }

    const form = new FormData()
    form.append('image_file_b64', image_file_b64)
    form.append('size', 'auto')
    form.append('format', 'png')

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.REMOVE_BG_API_KEY,
      },
      body: form,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('remove.bg error', response.status, errorText)
      return res.status(500).json({ error: 'remove_bg_failed' })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const base64Out = buffer.toString('base64')

    res.json({
      image_file_b64: base64Out,
      mimeType: 'image/png',
    })
  } catch (err) {
    console.error('remove.bg route error', err)
    res.status(500).json({ error: 'internal_error' })
  }
})

async function fetchWeatherForLocation(location) {
  if (!location || !process.env.OPENWEATHER_API_KEY) {
    return null
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    location
  )}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      console.error('OpenWeather error', res.status, text)
      return null
    }

    const data = await res.json()

    const temp =
      data.main && typeof data.main.temp === 'number' ? data.main.temp : null
    const feelsLike =
      data.main && typeof data.main.feels_like === 'number'
        ? data.main.feels_like
        : null
    const desc =
      Array.isArray(data.weather) && data.weather[0]
        ? data.weather[0].description
        : null
    const humidity =
      data.main && typeof data.main.humidity === 'number'
        ? data.main.humidity
        : null

    let tempBucket = 'mild'
    if (typeof temp === 'number') {
      if (temp <= 12) tempBucket = 'cold'
      else if (temp >= 27) tempBucket = 'hot'
    }

    return {
      temp,
      feelsLike,
      desc,
      humidity,
      tempBucket,
    }
  } catch (e) {
    console.error('OpenWeather fetch error', e)
    return null
  }
}

app.post('/api/style/suggest-weather', async (req, res) => {
  try {
    const { items, goal, vibe, location, styleProfile } = req.body
    const weather = await fetchWeatherForLocation(location)
    const suggestions = await getStyleSuggestionsLLM({
      goal: goal || '',
      vibe: vibe || '',
      items: items || [],
      styleProfile: styleProfile || null,
      weather,
    })
    res.json({ suggestions })
  } catch (err) {
    console.error('/api/style/suggest-weather error', err)
    res.status(500).json({ error: 'internal_error' })
  }
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/style', styleRouter)

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Style coach API running on port ${port}`)
})

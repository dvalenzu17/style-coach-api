import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import FormData from 'form-data'
import styleRouter from './styleRouter.js'

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
    form.append('size', 'auto')        // let remove.bg pick size
    form.append('format', 'png')       // transparent PNG

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

    // For now we just send base64 back. Later you can save to S3 and return a URL.
    res.json({
      image_file_b64: base64Out,
      mimeType: 'image/png',
    })
  } catch (err) {
    console.error('remove.bg route error', err)
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

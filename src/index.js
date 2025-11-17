import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import styleRouter from './styleRouter.js'

const app = express()

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'

app.use(cors({ origin: allowedOrigin, credentials: false }))
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api/style', styleRouter)

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Style coach API running on port ${port}`)
})

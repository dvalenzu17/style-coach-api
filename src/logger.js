import fs from 'fs'
import path from 'path'

const logDir = path.join(process.cwd(), 'logs')
const logFile = path.join(logDir, 'style-requests.log')

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

export function writeLog(entry) {
  const record = {
    ts: new Date().toISOString(),
    ...entry
  }

  const line = JSON.stringify(record) + '\n'

  fs.appendFile(logFile, line, err => {
    if (err) console.error('LOG ERROR:', err)
  })
}

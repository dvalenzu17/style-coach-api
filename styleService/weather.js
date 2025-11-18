// styleService/weather.js
import fetch from 'node-fetch'

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY

export async function fetchWeatherForLocation(location) {
  if (!location || !OPENWEATHER_API_KEY) {
    return null
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    location
  )}&units=metric&appid=${OPENWEATHER_API_KEY}`

  const res = await fetch(url)

  if (!res.ok) {
    const text = await res.text()
    console.error('OpenWeather error:', res.status, text)
    return null
  }

  const data = await res.json()

  const temp = data.main?.temp
  const feelsLike = data.main?.feels_like
  const desc = data.weather?.[0]?.description
  const humidity = data.main?.humidity

  // bucket for the model: simple + useful
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
    raw: data,
  }
}

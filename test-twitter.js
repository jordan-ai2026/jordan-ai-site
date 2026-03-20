require('dotenv').config()
const axios  = require('axios')
const crypto = require('crypto')

const KEY     = process.env.TWITTER_API_KEY
const SECRET  = process.env.TWITTER_API_SECRET
const TOKEN   = process.env.TWITTER_ACCESS_TOKEN
const TSECRET = process.env.TWITTER_ACCESS_SECRET

console.log('API Key (first 8):', KEY?.substring(0,8))
console.log('Access Token:', TOKEN?.substring(0,25))

function oauthSign(method, url, params) {
  const oauthParams = {
    oauth_consumer_key:     KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            TOKEN,
    oauth_version:          '1.0',
  }
  const allParams = { ...params, ...oauthParams }
  const sortedKeys = Object.keys(allParams).sort()
  const paramString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&')
  const base = [method, encodeURIComponent(url), encodeURIComponent(paramString)].join('&')
  const sigKey = `${encodeURIComponent(SECRET)}&${encodeURIComponent(TSECRET)}`
  const sig = crypto.createHmac('sha1', sigKey).update(base).digest('base64')
  oauthParams.oauth_signature = sig
  return 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ')
}

async function test() {
  // Test 1: Who am I?
  console.log('\n--- Who am I? ---')
  try {
    const auth = oauthSign('GET', 'https://api.twitter.com/2/users/me', {})
    const r = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: auth }
    })
    console.log('✅ User:', r.data.data?.username, '| ID:', r.data.data?.id)
  } catch(e) {
    console.log('❌', e.response?.status, JSON.stringify(e.response?.data))
  }

  // Test 2: Post
  console.log('\n--- Post test ---')
  try {
    const url  = 'https://api.twitter.com/2/tweets'
    const auth = oauthSign('POST', url, {})
    const r = await axios.post(url, { text: 'Test - will delete' }, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' }
    })
    console.log('✅ Posted! ID:', r.data.data?.id)
    // Delete it
    const delAuth = oauthSign('DELETE', `https://api.twitter.com/2/tweets/${r.data.data.id}`, {})
    await axios.delete(`https://api.twitter.com/2/tweets/${r.data.data.id}`, { headers: { Authorization: delAuth } })
    console.log('✅ Deleted.')
  } catch(e) {
    console.log('❌ Status:', e.response?.status)
    console.log('Full error:', JSON.stringify(e.response?.data, null, 2))
  }
}

test()

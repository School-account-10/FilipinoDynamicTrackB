
const siteListAddress = 'https://raw.githubusercontent.com/soxoj/maigret/main/maigret/resources/data.json'
const requestsAtOnce = 20
const maximumSites = 600

const popularSiteNames = ['Facebook', 'Instagram', 'YouTube', 'Snapchat', 'Twitter', 'TikTok', 'Pinterest', 'LinkedIn', 'Reddit', 'Telegram', 'Twitch', 'Threads', 'Tumblr', 'GitHub', 'Spotify', 'Medium', 'Flickr', 'VK']

let preparedSites = null
let manualSites = []
let shouldStop = false
let helperStopped = false

const helperMessage = 'The helper is not running. On Windows, double-click start.bat. On Linux or macOS, run start.sh. Then open http://localhost:3000 and try again.'

async function helperIsRunning() {
  if (location.protocol === 'file:') return false
  try {
    const response = await fetch('/ping')
    return response.ok
  } catch (error) {
    return false
  }
}

function cannotCheckAutomatically(site) {
  if (site.protection && site.protection.length > 0) return true
  if (site.requestMethod && site.requestMethod !== 'GET') return true
  if (site.requestPayload) return true
  if (site.activation) return true
  return false
}

function popularPosition(entry) {
  return popularSiteNames.indexOf(entry[0])
}

async function loadSiteList() {
  if (preparedSites) return preparedSites

  const response = await fetch(siteListAddress)
  const data = await response.json()
  const popularAutomatic = []
  const popularManual = []
  const otherSites = []

  for (const [siteName, rawSite] of Object.entries(data.sites)) {
    const engine = rawSite.engine ? data.engines[rawSite.engine] : null
    const site = { ...(engine ? engine.site : {}), ...rawSite }

    if (site.disabled) continue
    if (!site.url) continue
    if (site.type && site.type !== 'username') continue
    if (site.tags && site.tags.includes('porn')) continue

    const entry = [siteName, site]

    if (popularSiteNames.includes(siteName)) {
      if (cannotCheckAutomatically(site)) {
        popularManual.push(entry)
      } else {
        popularAutomatic.push(entry)
      }
      continue
    }

    if (!site.alexaRank) continue
    if (cannotCheckAutomatically(site)) continue
    otherSites.push(entry)
  }

  popularAutomatic.sort((first, second) => popularPosition(first) - popularPosition(second))
  popularManual.sort((first, second) => popularPosition(first) - popularPosition(second))
  otherSites.sort((first, second) => first[1].alexaRank - second[1].alexaRank)

  manualSites = popularManual
  preparedSites = popularAutomatic.concat(otherSites).slice(0, maximumSites)
  return preparedSites
}

function fillInAddress(template, site, username) {
  return template
    .replace('{urlMain}', site.urlMain || '')
    .replace('{urlSubpath}', site.urlSubpath || '')
    .replace('{username}', username)
}

async function lookUpUsername(site, username) {
  if (site.regexCheck && !new RegExp(site.regexCheck).test(username)) return null

  const checkAddress = fillInAddress(site.urlProbe || site.url, site, username)
  const requestAddress = '/check?url=' + encodeURIComponent(checkAddress) + '&headers=' + encodeURIComponent(JSON.stringify(site.headers || {}))

  let response
  try {
    response = await fetch(requestAddress)
  } catch (error) {
    helperStopped = true
    return null
  }

  try {
    return await response.json()
  } catch (error) {
    return null
  }
}

function isGenuineHit(site, result) {
  if (!result || result.status === 0) return false

  const text = result.text
  const blockMessages = site.errors ? Object.keys(site.errors) : []
  if (blockMessages.some(message => text.includes(message))) return false

  const successfulStatus = result.status >= 200 && result.status < 300
  const allowedBlockedStatus = site.ignore403 && result.status === 403
  if (!successfulStatus && !allowedBlockedStatus) return false

  if (site.checkType === 'status_code') {
    return successfulStatus
  }

  if (site.checkType === 'message') {
    const missingTexts = site.absenceStrs || []
    const foundTexts = site.presenseStrs || []
    const accountMissing = missingTexts.some(message => text.includes(message))
    const accountPresent = foundTexts.length === 0 || foundTexts.some(message => text.includes(message))
    return !accountMissing && accountPresent
  }

  if (site.checkType === 'response_url') {
    return successfulStatus && !result.redirected
  }

  return false
}

function makeFakeUsername(site) {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let fakeName = ''
  for (let count = 0; count < 12; count++) {
    fakeName += letters[Math.floor(Math.random() * letters.length)]
  }
  if (site.regexCheck && !new RegExp(site.regexCheck).test(fakeName)) {
    return site.usernameUnclaimed || null
  }
  return fakeName
}

async function accountExists(site, username) {
  const result = await lookUpUsername(site, username)
  if (!isGenuineHit(site, result)) return null

  const fakeUsername = makeFakeUsername(site)
  if (fakeUsername) {
    const fakeResult = await lookUpUsername(site, fakeUsername)
    if (isGenuineHit(site, fakeResult)) return null
  }

  return { address: fillInAddress(site.url, site, username), pageText: result.text }
}

function cleanNameWords(typedText) {
  return typedText.trim().split(/\s+/)
    .map(word => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(word => word.length > 0)
}

function makeUsernameVariations(typedText) {
  if (typedText.trim().split(/\s+/).length < 2) return [typedText.trim()]

  const cleanWords = cleanNameWords(typedText)
  if (cleanWords.length < 2) return [cleanWords.join('')]

  const first = cleanWords[0]
  const last = cleanWords[cleanWords.length - 1]

  const variations = [
    first + last,
    first + '.' + last,
    first + '_' + last,
    first + '-' + last,
    last + first,
    last + '.' + first,
    first[0] + last,
    first + last[0]
  ]
  return variations.filter((name, position) => variations.indexOf(name) === position)
}

function describeCloseness(typedText, username, pageText) {
  const levelNames = ['Low', 'Medium', 'High']
  const words = cleanNameWords(typedText)

  if (words.length < 2) {
    return { rank: 2, label: 'High (exactly what you typed)' }
  }

  const first = words[0]
  const last = words[words.length - 1]
  const lettersOnly = username.toLowerCase().replace(/[^a-z0-9]/g, '')

  let points = 0
  let reason = 'shortened version of the name'
  if (lettersOnly === first + last) {
    points = 2
    reason = 'full name in order'
  } else if (lettersOnly === last + first) {
    points = 1
    reason = 'full name reversed'
  }

  const readablePage = pageText
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(username.toLowerCase()).join(' ')
  const mentionsFirst = new RegExp('\\b' + first + '\\b').test(readablePage)
  const mentionsLast = new RegExp('\\b' + last + '\\b').test(readablePage)
  if (mentionsFirst && mentionsLast) {
    points++
    reason += ', and the page mentions both names'
  }

  const rank = Math.min(points, 2)
  return { rank: rank, label: levelNames[rank] + ' (' + reason + ')' }
}

startSearchButton.onclick = async () => {
  const typedText = document.getElementById('usernameInput').value.trim()
  if (!typedText) return

  if (!(await helperIsRunning())) {
    searchStatus.textContent = helperMessage
    return
  }

  const usernames = makeUsernameVariations(typedText)
  variationsTried.textContent = usernames.length > 1 ? 'Trying these usernames: ' + usernames.join(', ') : ''

  searchResults.innerHTML = ''
  shouldStop = false
  helperStopped = false
  startSearchButton.disabled = true
  stopSearchButton.disabled = false
  searchStatus.textContent = 'Loading the list of websites...'

  let sites
  try {
    sites = await loadSiteList()
  } catch (error) {
    searchStatus.textContent = 'Could not load the list of websites. Check your internet connection.'
    startSearchButton.disabled = false
    stopSearchButton.disabled = true
    return
  }

  manualLinks.innerHTML = ''
  manualHeading.hidden = manualSites.length === 0
  manualSites.forEach(([siteName, site]) => {
    const listItem = document.createElement('li')
    let linksText = '<b>' + makeTextSafe(siteName) + '</b>: '
    linksText += usernames.map(username => {
      const profileAddress = fillInAddress(site.url, site, username)
      return '<a href="' + makeTextSafe(profileAddress) + '" target="_blank" rel="noopener noreferrer">' + makeTextSafe(username) + '</a>'
    }).join(' | ')
    listItem.innerHTML = linksText
    manualLinks.appendChild(listItem)
  })

  const checks = []
  sites.forEach(([siteName, site]) => {
    usernames.forEach(username => checks.push([siteName, site, username]))
  })

  let nextCheckNumber = 0
  let checksDone = 0
  let accountsFound = 0

  async function runChecksOneByOne() {
    while (!shouldStop && nextCheckNumber < checks.length) {
      const [siteName, site, username] = checks[nextCheckNumber]
      nextCheckNumber++

      const hit = await accountExists(site, username)
      checksDone++

      if (helperStopped) {
        shouldStop = true
        return
      }

      if (hit) {
        accountsFound++
        const closeness = describeCloseness(typedText, username, hit.pageText)
        const listItem = document.createElement('li')
        listItem.dataset.rank = closeness.rank
        listItem.innerHTML = '<b>' + makeTextSafe(siteName) + '</b> (' + makeTextSafe(username) + ') - Confidence: ' + makeTextSafe(closeness.label) + '<br><a href="' + makeTextSafe(hit.address) + '" target="_blank" rel="noopener noreferrer">' + makeTextSafe(hit.address) + '</a>'

        const lowerItem = Array.from(searchResults.children).find(item => Number(item.dataset.rank) < closeness.rank)
        if (lowerItem) {
          searchResults.insertBefore(listItem, lowerItem)
        } else {
          searchResults.appendChild(listItem)
        }
      }

      searchStatus.textContent = 'Checked ' + checksDone + ' of ' + checks.length + '. Accounts found: ' + accountsFound
    }
  }

  const workers = []
  for (let count = 0; count < requestsAtOnce; count++) {
    workers.push(runChecksOneByOne())
  }
  await Promise.all(workers)

  if (helperStopped) {
    searchStatus.textContent = 'The search stopped because the helper stopped responding. ' + helperMessage
    startSearchButton.disabled = false
    stopSearchButton.disabled = true
    return
  }

  searchStatus.textContent = (shouldStop ? 'Stopped. ' : 'Finished. ') + 'Checked ' + checksDone + ' of ' + checks.length + '. Accounts found: ' + accountsFound
  startSearchButton.disabled = false
  stopSearchButton.disabled = true
}

stopSearchButton.onclick = () => {
  shouldStop = true
}

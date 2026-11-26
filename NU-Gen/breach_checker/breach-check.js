document.getElementById('checkEmailButton').onclick = async () => {
  const email = document.getElementById('emailInput').value.trim()
  const emailStatus = document.getElementById('emailStatus')
  const emailResults = document.getElementById('emailResults')
  emailResults.innerHTML = ''

  if (!email) {
    emailStatus.textContent = 'Please enter an email address.'
    return
  }

  emailStatus.textContent = 'Checking...'

  try {
    const response = await fetch('https://api.xposedornot.com/v1/check-email/' + encodeURIComponent(email))

    if (response.status === 404) {
      emailStatus.textContent = 'Good news: this email was not found in any known breach.'
      return
    }
    if (response.status === 429) {
      emailStatus.textContent = 'Too many requests. Please wait a moment and try again.'
      return
    }
    if (!response.ok) {
      emailStatus.textContent = 'Something went wrong (error ' + response.status + ').'
      return
    }

    const data = await response.json()
    const breachNames = (data.breaches || []).flat()

    if (breachNames.length === 0) {
      emailStatus.textContent = 'Good news: this email was not found in any known breach.'
      return
    }

    emailStatus.textContent = 'This email was found in ' + breachNames.length + ' breach' + (breachNames.length === 1 ? '' : 'es') + ':'

    breachNames.forEach(breachName => {
      const listItem = document.createElement('li')
      listItem.textContent = breachName
      emailResults.appendChild(listItem)
    })
  } catch (error) {
    emailStatus.textContent = 'The request failed. Try opening this page from localhost instead of as a file.'
  }
}

async function makeFingerprint(text) {
  const bytes = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map(number => number.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

document.getElementById('checkPasswordButton').onclick = async () => {
  const password = document.getElementById('passwordInput').value
  const passwordStatus = document.getElementById('passwordStatus')
  if (!password) return

  passwordStatus.textContent = 'Checking...'

  try {
    const fingerprint = await makeFingerprint(password)
    const firstPart = fingerprint.slice(0, 5)
    const secondPart = fingerprint.slice(5)

    const response = await fetch('https://api.pwnedpasswords.com/range/' + firstPart)
    if (!response.ok) {
      passwordStatus.textContent = 'Something went wrong (error ' + response.status + ').'
      return
    }

    const responseText = await response.text()
    const matchingLine = responseText.split('\n').map(line => line.trim().split(':')).find(parts => parts[0] === secondPart)

    if (matchingLine) {
      passwordStatus.textContent = 'This password appeared ' + Number(matchingLine[1]).toLocaleString() + ' times in known breaches. Do not use it.'
    } else {
      passwordStatus.textContent = 'Good news: this password was not found in any known breach.'
    }
  } catch (error) {
    passwordStatus.textContent = 'The request failed.'
  }
}

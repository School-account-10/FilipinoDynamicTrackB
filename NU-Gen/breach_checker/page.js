const pages = {
  usernameSearchPage: document.getElementById('usernameSearchPage'),
  emailCheckPage: document.getElementById('emailCheckPage'),
  passwordCheckPage: document.getElementById('passwordCheckPage')
}

function showPage(pageName) {
  for (const name in pages) {
    pages[name].hidden = name !== pageName
  }
}

document.getElementById('showUsernameSearch').onclick = () => showPage('usernameSearchPage')
document.getElementById('showEmailCheck').onclick = () => showPage('emailCheckPage')
document.getElementById('showPasswordCheck').onclick = () => showPage('passwordCheckPage')

function makeTextSafe(text) {
  const element = document.createElement('div')
  element.textContent = text
  return element.innerHTML
}

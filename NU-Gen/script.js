// NU-Gen: design-only prototype.
// No functionality is implemented yet (no forms, quizzes, audio, search, or data collection).
// Future work could go here: FAQ behavior, hymn audio player, suggestion form handling.

// Keep placeholder links and the demo form from jumping or submitting anywhere.
document.querySelectorAll('a[href="#"], form').forEach(function (el) {
  el.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', function (e) { e.preventDefault(); });
});

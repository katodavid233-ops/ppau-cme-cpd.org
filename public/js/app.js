document.addEventListener('DOMContentLoaded', function () {
  var quizForm = document.getElementById('quizForm');
  if (quizForm) {
    quizForm.addEventListener('submit', function () {
      var btn = document.getElementById('submitQuiz');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Grading your answers...';
      }
    });
  }
});

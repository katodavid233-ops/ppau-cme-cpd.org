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

  var revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealItems.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  }

  var nav = document.querySelector('.main-nav');
  if (nav) {
    var setNavState = function () {
      if (window.scrollY > 12) {
        nav.classList.add('is-scrolled');
      } else {
        nav.classList.remove('is-scrolled');
      }
    };
    setNavState();
    window.addEventListener('scroll', setNavState, { passive: true });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const reveals = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach(el => observer.observe(el));

  if (!('IntersectionObserver' in window)) {
    reveals.forEach(el => el.classList.add('visible'));
  }
});
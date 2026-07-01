// Nav scroll shadow
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
});

// Scroll-in fade animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('is-visible'), i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.scroll-obj').forEach(el => observer.observe(el));

// Trigger hero elements immediately on load
window.addEventListener('load', () => {
  document.querySelectorAll('.hero .scroll-obj').forEach((el, i) => {
    setTimeout(() => el.classList.add('is-visible'), 200 + i * 150);
  });
});

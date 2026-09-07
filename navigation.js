// Shared navigation behavior for the landing page and privacy policy.
(() => {
  const button = document.querySelector('.mobile-menu-btn');
  const links = document.querySelector('.nav-links');
  const mobile = window.matchMedia('(max-width: 900px)');

  function setOpen(open) {
    links.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && links.classList.contains('is-open')) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.navbar')) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
})();

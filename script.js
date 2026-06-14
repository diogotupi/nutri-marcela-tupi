const header = document.querySelector('.header');
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  });
}

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('active', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen);
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* Scroll reveal */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initScrollReveal() {
  const targets = new Set();

  const addReveal = (el, options = {}) => {
    if (!el || targets.has(el)) return;
    const { variant, delay = 0 } = options;
    el.classList.add('reveal');
    if (variant) el.classList.add(variant);
    if (delay) el.style.transitionDelay = `${delay}s`;
    targets.add(el);
  };

  const stagger = (parent, selector, step = 0.08, variant) => {
    parent.querySelectorAll(selector).forEach((el, index) => {
      addReveal(el, { variant, delay: index * step });
    });
  };

  document.querySelectorAll('.sobre-prose').forEach((block) => stagger(block, ':scope > *', 0.07));
  document.querySelectorAll('.section-header').forEach((block) => stagger(block, ':scope > *', 0.08));
  document.querySelectorAll('.belief-grid').forEach((block) => stagger(block, '.belief-col', 0.1, 'reveal--left'));
  document.querySelectorAll('.feature-grid').forEach((block) => stagger(block, '.feature-card', 0.09, 'reveal--scale'));
  document.querySelectorAll('.para-quem-box').forEach((block) => stagger(block, ':scope > *', 0.09));
  document.querySelectorAll('.cta-box').forEach((block) => stagger(block, ':scope > *', 0.1));
  document.querySelectorAll('.credentials').forEach((block) => stagger(block, 'li', 0.08, 'reveal--scale'));
  document.querySelectorAll('.depoimentos .section-header').forEach((block) => stagger(block, ':scope > *', 0.08));

  document.querySelectorAll('.reveal').forEach((el) => targets.add(el));

  if (prefersReducedMotion) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
  );

  targets.forEach((el) => revealObserver.observe(el));
}

initScrollReveal();

/* Depoimentos: marquee + lightbox */

function initMarqueeClone(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const clone = group.parentElement?.querySelector('.marquee-group[aria-hidden="true"]');
  if (!clone) return;
  clone.innerHTML = group.innerHTML;
}

function waitMarqueeImages(root) {
  const imgs = root.querySelectorAll('img');
  return Promise.all(
    [...imgs].map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve();
          else {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }
        })
    )
  );
}

function initDepoimentosMarquee() {
  const marquee = document.querySelector('.marquee--depoimentos');
  const track = marquee?.querySelector('.marquee-track');
  const group = document.getElementById('depoimentosMarqueeGroup');
  if (!marquee || !track || !group) return;

  initMarqueeClone('depoimentosMarqueeGroup');
  marquee.classList.add('is-js-marquee');

  let loopLen = 0;
  let offset = 0;
  let paused = false;
  let rafId = null;
  const speed = 0.6;
  const canHoverPause = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const measure = () => {
    const width = group.getBoundingClientRect().width;
    if (width < 40) return false;
    loopLen = width;
    return true;
  };

  const normalize = () => {
    if (loopLen <= 0) return;
    while (offset <= -loopLen) offset += loopLen;
    while (offset > 0) offset -= loopLen;
  };

  const apply = () => {
    track.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  const tick = () => {
    if (!paused && loopLen > 0) {
      offset -= speed;
      normalize();
      apply();
    }
    rafId = requestAnimationFrame(tick);
  };

  const setPaused = (value) => {
    paused = value;
  };

  if (canHoverPause) {
    marquee.addEventListener('mouseenter', () => setPaused(true));
    marquee.addEventListener('mouseleave', () => {
      const lb = document.getElementById('testimonial-lightbox');
      if (!lb?.classList.contains('is-open')) setPaused(false);
    });
  }

  const boot = async () => {
    await waitMarqueeImages(group);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    if (!measure()) {
      window.setTimeout(boot, 300);
      return;
    }

    normalize();
    apply();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  };

  window.addEventListener('resize', () => measure());
  void boot();

  return { setPaused };
}

const marqueeControls = initDepoimentosMarquee();

const lightbox = document.getElementById('testimonial-lightbox');
const lightboxImg = lightbox?.querySelector('.testimonial-lightbox__img');
let lastFocusedCard = null;

function openLightbox(src, alt) {
  if (!lightbox || !lightboxImg) return;

  lightboxImg.src = src;
  lightboxImg.alt = alt;
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  marqueeControls?.setPaused(true);

  const closeBtn = lightbox.querySelector('.testimonial-lightbox__close');
  closeBtn?.focus();
}

function closeLightbox() {
  if (!lightbox) return;

  lightbox.classList.remove('is-open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  marqueeControls?.setPaused(false);
  lightboxImg?.removeAttribute('src');
  lastFocusedCard?.focus();
}

document.querySelectorAll('.marquee--depoimentos .testimonial-card').forEach((card) => {
  card.addEventListener('click', () => {
    const img = card.querySelector('img');
    const src = card.dataset.full || img?.getAttribute('src');
    const alt = img?.getAttribute('alt') || 'Depoimento ampliado';
    if (!src) return;

    lastFocusedCard = card;
    openLightbox(src, alt);
  });
});

lightbox?.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', closeLightbox);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lightbox?.classList.contains('is-open')) {
    closeLightbox();
  }
});

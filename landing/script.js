document.documentElement.classList.add('js');

const revealNodes = document.querySelectorAll('.reveal-up');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.14 }
);

revealNodes.forEach((node) => revealObserver.observe(node));

const counters = document.querySelectorAll('[data-counter]');
const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const target = Number(entry.target.dataset.counter || 0);
      const start = performance.now();
      const duration = 1200;

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        entry.target.textContent = String(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      counterObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.45 }
);

counters.forEach((counter) => counterObserver.observe(counter));

const noteRange = document.getElementById('note-range');
const rangeValue = document.getElementById('note-range-value');
const manualTime = document.getElementById('manual-time');
const toolTime = document.getElementById('tool-time');
const savedTime = document.getElementById('saved-time');

if (noteRange && rangeValue && manualTime && toolTime && savedTime) {
  const updateCalculator = () => {
    const notes = Number(noteRange.value);
    const manualMinutes = notes * 7;
    const toolMinutes = notes * 1.35;
    const savedMinutes = Math.max(manualMinutes - toolMinutes, 0);

    const toHours = (minutes) => `${(minutes / 60).toFixed(1)} 小时`;

    rangeValue.textContent = String(notes);
    manualTime.textContent = toHours(manualMinutes);
    toolTime.textContent = toHours(toolMinutes);
    savedTime.textContent = toHours(savedMinutes);
  };

  noteRange.addEventListener('input', updateCalculator);
  updateCalculator();
}

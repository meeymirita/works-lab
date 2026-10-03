// Click-to-zoom image lightbox, after GSAP's flip-gallery-modal demo.
// A clone of the clicked <img> is laid out at its final full-screen size, then Flip.fit()
// measures the offset/size back to the thumbnail and gsap.from() plays it out of there.
// Closing runs the same fit the other way, so the image lands back exactly in its slot.
//
// Opt images in with FlipGallery.init(selector). Needs gsap + Flip; without them (or with
// prefers-reduced-motion) the image still opens, just without the morph.
(function () {
  var css =
    '.fg{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:5vh 5vw;cursor:zoom-out}' +
    '.fg.is-off{display:none}' +
    '.fg-backdrop{position:absolute;inset:0;background:rgba(4,3,6,.88);backdrop-filter:blur(8px)}' +
    '.fg-img{position:relative;display:block;object-fit:cover;border-radius:14px;box-shadow:0 40px 120px rgba(0,0,0,.6)}' +
    '.fg-caption{position:relative;font-family:"Space Mono",monospace;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#f7f2f5;opacity:.7}' +
    '.fg-zoomable{cursor:zoom-in}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var overlay = null;
  var clone = null;
  var source = null;
  var busy = false;

  function animated() {
    return window.gsap && window.Flip &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'fg is-off';
    overlay.innerHTML = '<div class="fg-backdrop"></div><div class="fg-caption"></div>';
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    return overlay;
  }

  // Largest size that keeps the image's own aspect ratio inside 90% of the viewport.
  function fitSize(img) {
    var ratio = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 16 / 10;
    var maxW = window.innerWidth * .9;
    var maxH = window.innerHeight * .8;
    var w = Math.min(maxW, maxH * ratio);
    return { w: w, h: w / ratio };
  }

  function open(img) {
    if (busy || clone) return;
    source = img;
    ensureOverlay();

    var size = fitSize(img);
    clone = document.createElement('img');
    clone.className = 'fg-img';
    clone.src = img.dataset.full || img.currentSrc || img.src;
    clone.alt = img.alt;
    clone.style.width = size.w + 'px';
    clone.style.height = size.h + 'px';

    var caption = overlay.querySelector('.fg-caption');
    caption.textContent = img.alt || '';
    overlay.insertBefore(clone, caption);
    overlay.classList.remove('is-off');
    document.body.style.overflow = 'hidden';

    if (!animated()) return;

    busy = true;
    img.style.visibility = 'hidden';
    var fromVars = Flip.fit(clone, img, { scale: false, getVars: true });

    gsap.timeline({ onComplete: function () { busy = false; } })
      .fromTo(overlay.querySelector('.fg-backdrop'), { opacity: 0 }, { opacity: 1, duration: .35, ease: 'none' }, 0)
      .from(clone, Object.assign(fromVars, { borderRadius: getComputedStyle(img).borderRadius, duration: .6, ease: 'power3.inOut' }), 0)
      .fromTo(caption, { opacity: 0, y: 10 }, { opacity: .7, y: 0, duration: .3, ease: 'power2.out' }, .45);
  }

  function finish() {
    if (source) source.style.visibility = '';
    if (clone) clone.remove();
    clone = null;
    source = null;
    busy = false;
    overlay.classList.add('is-off');
    document.body.style.overflow = '';
  }

  function close() {
    if (busy || !clone) return;
    if (!animated() || !source || !source.isConnected) {
      finish();
      return;
    }

    busy = true;
    gsap.timeline({ onComplete: finish })
      .to(overlay.querySelector('.fg-caption'), { opacity: 0, duration: .15 }, 0)
      .add(Flip.fit(clone, source, { scale: false, duration: .5, ease: 'power3.inOut' }), 0)
      .to(clone, { borderRadius: getComputedStyle(source).borderRadius, duration: .5, ease: 'power3.inOut' }, 0)
      .to(overlay.querySelector('.fg-backdrop'), { opacity: 0, duration: .4, ease: 'none' }, .1);
  }

  function init(selector) {
    document.querySelectorAll(selector).forEach(function (img) {
      if (img.dataset.fgBound) return;
      img.dataset.fgBound = '1';
      img.classList.add('fg-zoomable');
      img.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        open(img);
      });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && clone) close();
  });

  window.FlipGallery = { init: init, open: open, close: close };
})();

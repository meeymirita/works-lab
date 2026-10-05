// Page-transition loader shared by the landing page and every lab page.
// Based on GSAP's convertToPath() demo: plain SVG shapes (circle/rect/polygon) are converted
// to <path> with MorphSVGPlugin.convertToPath() so they can morph into one another while the
// lab's name is shown in its accent colour.
//
// Leaving a page:  PageLoader.go(url, name, color) (or any <a data-pl-name data-pl-color>)
//                  covers the screen, then navigates. The target name/colour ride along in
//                  sessionStorage so the next page starts already covered in the same state.
// Arriving:        PageLoader.enter(name, color) plays a short morph and wipes the cover away.
//
// Include this script right after <body> so the cover exists before anything paints.
// Without GSAP/MorphSVG (CDN blocked) or with prefers-reduced-motion it steps aside entirely.
(function () {
  var STORE_KEY = 'page-loader-next';
  var MIN_SHOW = .9;

  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var carried = null;
  try {
    carried = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    sessionStorage.removeItem(STORE_KEY);
  } catch (e) {}

  var css =
    '.pl{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;' +
      'background:#08070a;color:var(--pl-color,#ff2e88);clip-path:inset(0% 0% 0% 0%);padding:24px;text-align:center}' +
    '.pl.is-off{display:none}' +
    '.pl-shapes{width:min(360px,70vw);height:auto;overflow:visible}' +
    '.pl-shapes path,.pl-shapes circle,.pl-shapes rect,.pl-shapes polygon{fill:none;stroke:currentColor;stroke-width:4;stroke-linejoin:round}' +
    '.pl-shapes .pl-fill{fill:currentColor;fill-opacity:.18}' +
    '.pl-name{font-family:"Anton",sans-serif;text-transform:uppercase;font-size:clamp(40px,8vw,96px);line-height:1;letter-spacing:.02em;' +
      'text-shadow:0 0 40px color-mix(in srgb,currentColor 35%,transparent)}' +
    '.pl-label{font-family:"Space Mono",monospace;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#f7f2f5;opacity:.55}' +
    '.pl-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;background:currentColor;transform-origin:0 50%;transform:scaleX(0)}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var el = document.createElement('div');
  el.className = 'pl';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<svg class="pl-shapes" viewBox="0 0 400 100">' +
      '<circle class="pl-fill" cx="50" cy="50" r="38"/>' +
      '<rect x="116" y="12" width="76" height="76" rx="10" ry="10"/>' +
      '<polygon class="pl-fill" points="250,10 290,88 210,88"/>' +
      '<polygon points="350,8 361,38 393,38 367,57 377,90 350,70 323,90 333,57 307,38 339,38"/>' +
    '</svg>' +
    '<div class="pl-name"></div>' +
    '<div class="pl-label">загрузка</div>' +
    '<div class="pl-bar"></div>';
  document.body.insertBefore(el, document.body.firstChild);

  var nameEl = el.querySelector('.pl-name');
  var barEl = el.querySelector('.pl-bar');
  if (carried) setContent(carried.name, carried.color);

  var loop = null;
  var shapes = null;
  var leaving = false;

  function setContent(name, color) {
    if (name) nameEl.textContent = name;
    if (color) el.style.setProperty('--pl-color', color);
  }

  function ready() {
    return !reduced && window.gsap && window.MorphSVGPlugin;
  }

  function hide() {
    if (loop) loop.pause();
    el.classList.add('is-off');
  }

  // Convert the basic shapes to paths once, remember each one's original outline, then
  // loop: every path morphs into the outline of the shape to its right (last -> first).
  function startLoop() {
    if (!shapes) {
      gsap.registerPlugin(MorphSVGPlugin);
      shapes = MorphSVGPlugin.convertToPath(el.querySelectorAll('.pl-shapes circle, .pl-shapes rect, .pl-shapes polygon'));
      var outlines = shapes.map(function (p) { return p.getAttribute('d'); });

      loop = gsap.timeline({ repeat: -1, paused: true });
      for (var step = 1; step <= shapes.length; step++) {
        shapes.forEach(function (p, i) {
          loop.to(p, {
            morphSVG: { shape: outlines[(i + step) % shapes.length], type: 'rotational' },
            duration: .55,
            ease: 'power2.inOut',
          }, (step - 1) * .75 + i * .06);
        });
      }
    }
    loop.play();
  }

  function enter(name, color) {
    if (leaving) return;
    setContent(name, color);

    if (!ready()) {
      hide();
      return;
    }

    startLoop();
    gsap.timeline({ onComplete: hide })
      .fromTo(barEl, { scaleX: carried ? .6 : 0 }, { scaleX: 1, duration: MIN_SHOW, ease: 'power1.inOut' })
      .fromTo(el.querySelectorAll('.pl-name, .pl-label'),
        { y: carried ? 0 : 20, opacity: carried ? 1 : 0 },
        { y: 0, opacity: 1, duration: .4, ease: 'power3.out', stagger: .06 }, 0)
      .to(el.querySelectorAll('.pl-name, .pl-label, .pl-shapes'),
        { y: -30, opacity: 0, duration: .35, ease: 'power2.in', stagger: .04 }, MIN_SHOW)
      .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: .6, ease: 'power4.inOut' }, MIN_SHOW + .15);
  }

  function go(url, name, color) {
    if (!ready()) {
      window.location.href = url;
      return;
    }
    leaving = true;
    setContent(name, color);
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ name: name, color: color })); } catch (e) {}

    gsap.killTweensOf([el, barEl]);
    el.classList.remove('is-off');
    startLoop();

    gsap.timeline({ onComplete: function () { window.location.href = url; } })
      .fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: .55, ease: 'power4.inOut' })
      .fromTo(el.querySelectorAll('.pl-shapes, .pl-name, .pl-label'),
        { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: 'power3.out', stagger: .06 }, .3)
      .fromTo(barEl, { scaleX: 0 }, { scaleX: .6, duration: .7, ease: 'power1.out' }, .3);
  }

  // Any link can opt in with data-pl-name / data-pl-color.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-pl-name]');
    if (!a || a.target === '_blank' || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(a.href, a.getAttribute('data-pl-name'), a.getAttribute('data-pl-color'));
  });

  // Back/forward cache restores the page exactly as it was left: fully covered.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    leaving = false;
    if (window.gsap) gsap.killTweensOf([el, barEl]);
    hide();
    el.style.clipPath = '';
  });

  window.PageLoader = { enter: enter, go: go };
})();

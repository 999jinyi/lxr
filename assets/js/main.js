(function () {
  'use strict';

  /* 图片放大 */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lastFocus = null;

  function openBox(src, cap) {
    lastFocus = document.activeElement;
    lbImg.src = src;
    lbImg.alt = cap || '';
    lbCap.textContent = cap || '';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('lbClose').focus();
  }

  function closeBox() {
    lb.hidden = true;
    lbImg.src = '';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('.shot-btn, .comic-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openBox(btn.dataset.src, btn.dataset.cap);
    });
  });

  document.getElementById('lbClose').addEventListener('click', closeBox);
  lb.addEventListener('click', function (e) {
    if (e.target !== lbImg) closeBox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lb.hidden) closeBox();
  });

  /* 区块滚动入场 */
  var secs = document.querySelectorAll('.sec');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    secs.forEach(function (s) { io.observe(s); });
  } else {
    secs.forEach(function (s) { s.classList.add('in'); });
  }
})();

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

  /* 录音文件缺失时切换为占位提示 */
  var audio = document.getElementById('oralAudio');
  var missing = document.getElementById('audioMissing');

  function showMissing() {
    if (!missing.hidden) return;
    audio.hidden = true;
    missing.hidden = false;
  }

  audio.addEventListener('error', showMissing, true);
  audio.querySelectorAll('source').forEach(function (s) {
    s.addEventListener('error', function () {
      // 所有备选来源都失败时才提示
      if (audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) showMissing();
    });
  });
  // 兜底：加载后仍无可用时长，视为文件缺失
  setTimeout(function () {
    if (audio.readyState === 0 && audio.networkState !== 2) showMissing();
  }, 2500);

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

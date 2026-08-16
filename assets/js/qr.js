/*!
 * QRMini —— 极简二维码编码器（字节模式 / UTF-8 / 版本 1-40），无外部依赖。
 * 用法：QRMini.matrix(text, 'M') -> 二维布尔数组；QRMini.toSVG(text, opts) -> SVG 字符串
 */
(function (root) {
  'use strict';

  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };

  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };

  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function rawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(ver, ecl) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function utf8Bytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var size = ver * 4 + 17;
    var result = [6];
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function encode(text, ecl, forceMask) {
    ecl = ecl || 'M';
    if (!FORMAT_BITS.hasOwnProperty(ecl)) throw new Error('未知纠错级别：' + ecl);

    var bytes = utf8Bytes(String(text));
    var ver = 0, i, j;
    for (i = 1; i <= 40; i++) {
      var lenBits = i < 10 ? 8 : 16;
      if (4 + lenBits + bytes.length * 8 <= dataCodewords(i, ecl) * 8) { ver = i; break; }
    }
    if (!ver) throw new Error('内容过长，二维码无法容纳');

    var size = ver * 4 + 17;
    var capacityBits = dataCodewords(ver, ecl) * 8;

    /* --- 比特流 --- */
    var bits = [];
    function appendBits(val, len) {
      for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1);
    }
    appendBits(4, 4);
    appendBits(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { appendBits(b, 8); });
    appendBits(0, Math.min(4, capacityBits - bits.length));
    appendBits(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) appendBits(pad, 8);

    var dataBytes = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataBytes.push(b);
    }

    /* --- 纠错码与交织 --- */
    var numBlocks = NUM_BLOCKS[ecl][ver];
    var eccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(rawDataModules(ver) / 8);
    var numShort = numBlocks - rawCodewords % numBlocks;
    var shortLen = Math.floor(rawCodewords / numBlocks);
    var divisor = rsDivisor(eccLen);
    var blocks = [];
    for (i = 0, j = 0; i < numBlocks; i++) {
      var take = shortLen - eccLen + (i < numShort ? 0 : 1);
      var dat = dataBytes.slice(j, j + take);
      j += take;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat = dat.concat([0]);
      blocks.push(dat.concat(ecc));
    }
    var codewords = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j][i]);
      }
    }

    /* --- 矩阵 --- */
    var modules = [], isFunc = [];
    for (i = 0; i < size; i++) {
      modules.push(new Array(size).fill(false));
      isFunc.push(new Array(size).fill(false));
    }
    function setFunc(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark;
      isFunc[y][x] = true;
    }
    function drawFinder(x, y) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunc(x + dx, y + dy, dist !== 2 && dist !== 4);
        }
      }
    }
    function drawAlign(x, y) {
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          setFunc(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }

    for (i = 0; i < size; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    var aligns = alignPositions(ver);
    for (i = 0; i < aligns.length; i++) {
      for (j = 0; j < aligns.length; j++) {
        var skip = (i === 0 && j === 0) || (i === 0 && j === aligns.length - 1) || (i === aligns.length - 1 && j === 0);
        if (!skip) drawAlign(aligns[i], aligns[j]);
      }
    }

    function drawFormat(mask) {
      var data = FORMAT_BITS[ecl] << 3 | mask;
      var rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fbits = ((data << 10) | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) setFunc(8, k, getBit(fbits, k));
      setFunc(8, 7, getBit(fbits, 6));
      setFunc(8, 8, getBit(fbits, 7));
      setFunc(7, 8, getBit(fbits, 8));
      for (k = 9; k < 15; k++) setFunc(14 - k, 8, getBit(fbits, k));
      for (k = 0; k < 8; k++) setFunc(size - 1 - k, 8, getBit(fbits, k));
      for (k = 8; k < 15; k++) setFunc(8, size - 15 + k, getBit(fbits, k));
      setFunc(8, size - 8, true);
    }
    drawFormat(0);

    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = ver << 12 | rem;
      for (i = 0; i < 18; i++) {
        var bit = getBit(vbits, i);
        var a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setFunc(a, bb, bit);
        setFunc(bb, a, bit);
      }
    }

    /* --- 数据填充 --- */
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var k = 0; k < 2; k++) {
          var x = right - k;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFunc[y][x] && bi < codewords.length * 8) {
            modules[y][x] = getBit(codewords[bi >>> 3], 7 - (bi & 7));
            bi++;
          }
        }
      }
    }

    /* --- 掩模选择 --- */
    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        case 7: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (!isFunc[y][x] && maskFn(m, x, y)) modules[y][x] = !modules[y][x];
        }
      }
    }
    function penalty() {
      var score = 0, x, y, run, color, dark = 0;
      var P1 = [1, 0, 1, 1, 1, 0, 1];
      function lineScore(get) {
        var s = 0, r = 1, c = get(0), k;
        for (k = 1; k < size; k++) {
          var v = get(k);
          if (v === c) { r++; if (r === 5) s += 3; else if (r > 5) s++; }
          else { c = v; r = 1; }
        }
        // 规则3：1:1:3:1:1 形态两侧带 4 个浅色模块
        for (k = 0; k <= size - 7; k++) {
          var hit = true;
          for (var t = 0; t < 7; t++) if ((get(k + t) ? 1 : 0) !== P1[t]) { hit = false; break; }
          if (!hit) continue;
          var beforeClear = true, afterClear = true, t2;
          for (t2 = 1; t2 <= 4; t2++) if (k - t2 < 0 ? false : get(k - t2)) beforeClear = false;
          for (t2 = 0; t2 < 4; t2++) if (k + 7 + t2 >= size ? false : get(k + 7 + t2)) afterClear = false;
          if (beforeClear || afterClear) s += 40;
        }
        return s;
      }
      for (y = 0; y < size; y++) score += lineScore(function (x2) { return modules[y][x2]; });
      for (x = 0; x < size; x++) score += lineScore(function (y2) { return modules[y2][x]; });
      for (y = 0; y < size - 1; y++) {
        for (x = 0; x < size - 1; x++) {
          color = modules[y][x];
          if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
        }
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (modules[y][x]) dark++;
      var total = size * size;
      var k5 = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      score += Math.max(k5, 0) * 10;
      return score;
    }

    var bestMask = 0, minScore = Infinity;
    if (forceMask != null) {
      bestMask = forceMask;
    } else {
      for (i = 0; i < 8; i++) {
        applyMask(i);
        drawFormat(i);
        var s = penalty();
        if (s < minScore) { minScore = s; bestMask = i; }
        applyMask(i);
      }
    }
    applyMask(bestMask);
    drawFormat(bestMask);

    return { size: size, version: ver, mask: bestMask, ecl: ecl, modules: modules };
  }

  function toSVG(text, opts) {
    opts = opts || {};
    var scale = opts.scale || 8;
    var margin = opts.margin == null ? 4 : opts.margin;
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';
    var qr = encode(text, opts.ecl || 'M');
    var dim = (qr.size + margin * 2) * scale;
    var path = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          path.push('M' + (x + margin) * scale + ',' + (y + margin) * scale + 'h' + scale + 'v' + scale + 'h-' + scale + 'z');
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + dim + '" height="' + dim + '" shape-rendering="crispEdges">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
      '<path d="' + path.join('') + '" fill="' + dark + '"/></svg>';
  }

  root.QRMini = { matrix: encode, toSVG: toSVG };
})(typeof globalThis !== 'undefined' ? globalThis : this);

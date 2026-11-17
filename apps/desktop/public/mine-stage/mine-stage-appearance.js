(function (root) {
  'use strict';
  var light = false;
  var uniform = { value: 0 };
  function rgb(value) {
    var match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
    return match ? [0, 2, 4].map(function (offset) { return parseInt(match[1].slice(offset, offset + 2), 16); }) : null;
  }
  function luminance(channels) {
    var linear = channels.map(function (value) { value /= 255; return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  function readable(value) {
    var channels = rgb(value);
    if (!channels) return value;
    // Use the darkest cover underneath the light scrim, rather than assuming
    // an empty-cover background. Preserve the hue while increasing contrast.
    var background = luminance(light ? [194, 197, 202] : [21, 22, 25]);
    var original = channels.slice(), target = light ? 0 : 255;
    for (var step = 0; step <= 100; step++) {
      var foreground = luminance(channels);
      if ((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= (light ? 7 : 4.5)) break;
      channels = original.map(function (value) { return Math.round(value + (target - value) * (step + 1) / 100); });
    }
    return '#' + channels.map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }
  root.LxMineAppearance = {
    uniform: uniform,
    isLight: function () { return light; },
    apply: function (value) {
      light = value === 'light'; uniform.value = light ? 1 : 0;
      document.body.classList.toggle('light-theme', light);
      // Chromium makes a transparent iframe opaque when its color scheme
      // differs from its embedding document.
      document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    },
    readable: readable,
    colors: function (palette) {
      var result = Object.assign({}, palette);
      ['primary', 'secondary', 'highlight'].forEach(function (key) { if (result[key]) result[key] = readable(result[key]); });
      return result;
    }
  };
})(window);

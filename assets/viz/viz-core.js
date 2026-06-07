/**
 * viz-core.js — shared plumbing for custom D3 visualizations.
 *
 * Exposes two globals:
 *   window.VizCore     — geometry + reusable UI/render helpers
 *   window.VizRegistry — register('name', renderFn) + boot()
 *
 * Each individual viz lives in its own file (e.g. mle.js), registers itself
 * under a name, and is dropped into a post with a single element:
 *
 *   <div class="viz" data-viz="mle" data-mu="63" data-sigma="2"></div>
 *
 * boot() scans the page for [data-viz] elements, reads their data-* attributes
 * as a config object, and calls the matching render(container, config).
 */
(function () {
  'use strict';

  var d3 = window.d3;

  // ---- Shared geometry (inner drawing area, before margins) ----
  var geometry = {
    INNER_W: 424,
    INNER_H: 200,
    margin: { top: 12, right: 12, bottom: 38, left: 44 }
  };

  /**
   * Create a width-responsive <svg> inside `parentEl`. Returns the svg
   * selection plus a `plot` group translated past the margins, so a viz can
   * draw in coordinates 0..INNER_W / 0..INNER_H without worrying about axes
   * spilling outside the frame.
   */
  function createResponsiveSvg(parentEl, className) {
    var m = geometry.margin;
    var totalW = geometry.INNER_W + m.left + m.right;
    var totalH = geometry.INNER_H + m.top + m.bottom;

    var svg = d3.select(parentEl)
      .append('svg')
      .attr('class', className || 'viz-svg')
      .attr('viewBox', '0 0 ' + totalW + ' ' + totalH)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('display', 'block');

    var plot = svg.append('g')
      .attr('transform', 'translate(' + m.left + ',' + m.top + ')');

    return { svg: svg, plot: plot, width: totalW, height: totalH };
  }

  /**
   * Append a labeled range slider to `parent`.
   * opts: { classPrefix, label, min, max, step, value, decimals }
   * Returns { row, input, label, valueSpan }.
   */
  function addSlider(parent, opts) {
    opts = opts || {};
    var prefix = opts.classPrefix || 'viz';
    var decimals = (opts.decimals == null) ? 1 : opts.decimals;

    var row = document.createElement('label');
    row.className = prefix + '-slider';

    var labelSpan = document.createElement('span');
    labelSpan.className = prefix + '-slider-label';
    labelSpan.textContent = opts.label != null ? opts.label : '';

    var input = document.createElement('input');
    input.type = 'range';
    input.className = prefix + '-slider-input';
    input.min = opts.min;
    input.max = opts.max;
    input.step = opts.step;
    input.value = opts.value;

    var valueSpan = document.createElement('span');
    valueSpan.className = prefix + '-slider-value';
    valueSpan.textContent = (+opts.value).toFixed(decimals);

    row.appendChild(labelSpan);
    row.appendChild(input);
    row.appendChild(valueSpan);
    parent.appendChild(row);

    return { row: row, input: input, label: labelSpan, valueSpan: valueSpan };
  }

  /**
   * Coalesce repeated calls into a single requestAnimationFrame redraw.
   * Returns a function you can call as often as you like (e.g. on slider input).
   */
  function createRafScheduler(fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        fn();
      });
    };
  }

  window.VizCore = {
    geometry: geometry,
    createResponsiveSvg: createResponsiveSvg,
    addSlider: addSlider,
    createRafScheduler: createRafScheduler
  };

  // ---- Registry + boot ----
  var registry = {};

  function coerce(v) {
    if (v === '' || v == null) return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    var n = Number(v);
    return isNaN(n) ? v : n;
  }

  function register(name, renderFn) {
    registry[name] = renderFn;
  }

  function mountOne(el) {
    var name = el.getAttribute('data-viz');
    var renderFn = registry[name];
    if (!renderFn) {
      console.warn('[VizRegistry] no viz registered for "' + name + '"');
      return;
    }
    if (el.getAttribute('data-viz-mounted') === '1') return; // idempotent
    el.setAttribute('data-viz-mounted', '1');

    var config = {};
    Object.keys(el.dataset).forEach(function (k) {
      if (k === 'viz' || k === 'vizMounted') return;
      config[k] = coerce(el.dataset[k]);
    });

    try {
      renderFn(el, config);
    } catch (err) {
      console.error('[VizRegistry] render failed for "' + name + '"', err);
    }
  }

  function boot(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-viz]');
    Array.prototype.forEach.call(nodes, mountOne);
  }

  window.VizRegistry = { register: register, boot: boot };

  // Auto-boot once the DOM is ready, so a viz works even without an explicit
  // boot() call. Safe to call boot() again later (it's idempotent).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); });
  } else {
    boot();
  }
})();

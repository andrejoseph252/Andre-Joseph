/**
 * mle.js — Maximum Likelihood Estimation interactive (viz name 'mle').
 *
 * A frozen "truth" normal curve and an adjustable "model" curve the reader
 * fits to an observed sample by dragging μ / σ. A slim meter on the right
 * tracks the log-likelihood from a floor up to its true maximum, locking to a
 * success color when the model reaches the optimum. A faint histogram + rug of
 * the sample, light gridlines, a shaded area under the model curve, and a small
 * legend round out the frame.
 *
 * Per-instance overrides come from data-* attributes on the host element, e.g.
 *   <div class="viz" data-viz="mle" data-mu="62" data-sigma="3"></div>
 *
 * Tweak the CONFIG block below for global look/behavior changes.
 */
(function () {
  'use strict';

  var d3 = window.d3;
  var core = window.VizCore;

  // ----------------------------------------------------------------------
  // CONFIG — the main knobs. Change these to customize the viz.
  // ----------------------------------------------------------------------
  var CONFIG = {
    data: [64.2, 65.5, 66.1, 66.8, 67.3, 68.0, 68.5, 69.1, 69.8, 70.2,
           70.9, 71.5, 72.0, 73.1, 74.3],
    xDomain: [62, 76],
    yMax: 0.25,
    trueMu: 69.15,
    trueSigma: 2.81,
    minLogLik: -200,          // floor of the likelihood meter
    histBins: 8,
    params: [
      { key: 'mu',    label: 'μ', min: 60, max: 78, step: 0.1, def: 63 },
      { key: 'sigma', label: 'σ', min:  2, max:  6, step: 0.1, def:  2 }
    ],
    // Side caption shown to the left of the figure. <em> renders variables in
    // math italic; override per-instance with data-fignum / data-figcaption.
    figure: {
      number: 'Figure 1.',
      html: 'Maximum&#8209;likelihood fit of a normal density to a height sample. ' +
            'Drag <em>&mu;</em> and <em>&sigma;</em> to maximize <em>&#8467;</em>.'
    },
    colors: {
      grid:       'rgba(0,0,0,0.06)',
      axis:       'rgba(0,0,0,0.22)',
      tickText:   'rgba(0,0,0,0.55)',
      axisTitle:  'rgba(0,0,0,0.62)',
      hist:       '#000000',         // used at low fill/stroke opacity
      truth:      '#5f7fae',         // dashed cool reference curve
      model:      '#cf7a3c',         // adjustable curve (matches --accent)
      meterLow:   '#7d9bc4',
      meterHigh:  '#cf7a3c',
      success:    '#3f9d6d',
      meterTrack: 'rgba(0,0,0,0.05)',
      meterEdge:  'rgba(0,0,0,0.12)',
      text:       'rgba(0,0,0,0.8)',
      textMuted:  'rgba(0,0,0,0.55)'
    }
  };

  var INNER_W = core.geometry.INNER_W;
  var INNER_H = core.geometry.INNER_H;
  var PLOT_W  = Math.floor(INNER_W * 0.84);
  var METER_W = 44;
  var METER_X = INNER_W - METER_W;

  // ---- math helpers ----
  function normalPDF(x, mu, sigma) {
    var z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  }

  function totalLogLik(data, mu, sigma) {
    var sum = 0;
    for (var i = 0; i < data.length; i++) sum += Math.log(normalPDF(data[i], mu, sigma));
    return sum;
  }

  function curvePoints(mu, sigma, domain) {
    var pts = [], n = 160, lo = domain[0], hi = domain[1];
    for (var i = 0; i <= n; i++) {
      var x = lo + (hi - lo) * (i / n);
      pts.push([x, normalPDF(x, mu, sigma)]);
    }
    return pts;
  }

  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 8); }

  // ---- render ----
  function render(container, config) {
    config = config || {};
    var C = CONFIG, col = C.colors;

    var muDef = C.params[0].def, sigmaDef = C.params[1].def;
    var mu = +(config.mu != null ? config.mu : muDef);
    var sigma = +(config.sigma != null ? config.sigma : sigmaDef);
    if (!(sigma > 0)) sigma = sigmaDef;

    var MAX_LL = totalLogLik(C.data, C.trueMu, C.trueSigma);
    var MIN_LL = C.minLogLik;

    // figure: light card (plate) with a short caption beneath it.
    var figure = document.createElement('div');
    figure.className = 'viz-mle-figure';
    container.appendChild(figure);

    var card = document.createElement('div');
    card.className = 'viz-mle-card';
    figure.appendChild(card);

    var chart = document.createElement('div');
    chart.className = 'viz-mle-chart';
    card.appendChild(chart);

    var built = core.createResponsiveSvg(chart, 'viz-mle-svg');
    var plot = built.plot;

    var xScale = d3.scaleLinear().domain(C.xDomain).range([0, PLOT_W]);
    var yScale = d3.scaleLinear().domain([0, C.yMax]).range([INNER_H, 0]);

    // ---- defs: gradients + glow ----
    var defs = plot.append('defs');

    var areaGradId = uid('viz-mle-area');
    var ag = defs.append('linearGradient')
      .attr('id', areaGradId).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    ag.append('stop').attr('offset', '0%').attr('stop-color', col.model).attr('stop-opacity', 0.26);
    ag.append('stop').attr('offset', '100%').attr('stop-color', col.model).attr('stop-opacity', 0);

    var meterGradId = uid('viz-mle-meter');
    var mg = defs.append('linearGradient')
      .attr('id', meterGradId).attr('x1', 0).attr('y1', 1).attr('x2', 0).attr('y2', 0);
    mg.append('stop').attr('offset', '0%').attr('stop-color', col.meterLow);
    mg.append('stop').attr('offset', '100%').attr('stop-color', col.meterHigh);

    // ---- gridlines (horizontal) ----
    plot.append('g').attr('class', 'viz-mle-grid')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-PLOT_W).tickFormat(''))
      .call(function (g) { g.select('.domain').remove(); })
      .selectAll('line').attr('stroke', col.grid);

    // ---- histogram (density) ----
    var bins = d3.bin().domain(xScale.domain()).thresholds(C.histBins)(C.data);
    var binWidth = bins[0].x1 - bins[0].x0;
    bins.forEach(function (b) { b.density = b.length / (C.data.length * binWidth); });

    plot.append('g').attr('class', 'viz-mle-histogram')
      .selectAll('rect').data(bins).enter().append('rect')
      .attr('x', function (d) { return xScale(d.x0) + 0.75; })
      .attr('y', function (d) { return yScale(d.density); })
      .attr('width', function (d) { return Math.max(0, xScale(d.x1) - xScale(d.x0) - 1.5); })
      .attr('height', function (d) { return INNER_H - yScale(d.density); })
      .attr('fill', col.hist).attr('fill-opacity', 0.08)
      .attr('stroke', col.hist).attr('stroke-opacity', 0.20).attr('stroke-width', 1);

    // ---- axes ----
    var gx = plot.append('g').attr('class', 'viz-mle-axis')
      .attr('transform', 'translate(0,' + INNER_H + ')')
      .call(d3.axisBottom(xScale).ticks(7).tickSize(4).tickFormat(d3.format('d')));
    gx.select('.domain').attr('stroke', col.axis);
    gx.selectAll('line').attr('stroke', col.axis);
    gx.selectAll('text').attr('fill', col.tickText).attr('class', 'viz-mle-tick');

    var gy = plot.append('g').attr('class', 'viz-mle-axis')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(4).tickFormat(d3.format('.2f')));
    gy.select('.domain').remove();
    gy.selectAll('line').attr('stroke', col.axis);
    gy.selectAll('text').attr('fill', col.tickText).attr('class', 'viz-mle-tick');

    plot.append('text').attr('class', 'viz-mle-axis-title')
      .attr('x', PLOT_W / 2).attr('y', INNER_H + 32).attr('text-anchor', 'middle')
      .attr('fill', col.axisTitle).text('height (inches)');

    plot.append('text').attr('class', 'viz-mle-axis-title')
      .attr('transform', 'rotate(-90)')
      .attr('x', -INNER_H / 2).attr('y', -34).attr('text-anchor', 'middle')
      .attr('fill', col.axisTitle).text('density');

    // ---- rug ----
    plot.append('g').selectAll('line').data(C.data).enter().append('line')
      .attr('x1', function (d) { return xScale(d); })
      .attr('x2', function (d) { return xScale(d); })
      .attr('y1', INNER_H).attr('y2', INNER_H - 7)
      .attr('stroke', col.hist).attr('stroke-opacity', 0.55).attr('stroke-width', 1);

    // ---- curves ----
    var line = d3.line()
      .x(function (p) { return xScale(p[0]); })
      .y(function (p) { return yScale(p[1]); })
      .curve(d3.curveBasis);
    var area = d3.area()
      .x(function (p) { return xScale(p[0]); })
      .y0(yScale(0))
      .y1(function (p) { return yScale(p[1]); })
      .curve(d3.curveBasis);

    // truth (frozen reference)
    plot.append('path')
      .attr('fill', 'none').attr('stroke', col.truth)
      .attr('stroke-dasharray', '3,4').attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round').attr('opacity', 0.75)
      .attr('d', line(curvePoints(C.trueMu, C.trueSigma, C.xDomain)));

    // model (adjustable) — shaded area + crisp line
    var modelArea = plot.append('path').attr('fill', 'url(#' + areaGradId + ')');
    var modelLine = plot.append('path')
      .attr('fill', 'none').attr('stroke', col.model).attr('stroke-width', 2.25)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');

    // ---- legend ----
    var legend = plot.append('g').attr('class', 'viz-mle-legend')
      .attr('transform', 'translate(6,4)');
    function legendRow(y, stroke, dash, label) {
      var row = legend.append('g').attr('transform', 'translate(0,' + y + ')');
      row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 0).attr('y2', 0)
        .attr('stroke', stroke).attr('stroke-width', 2)
        .attr('stroke-dasharray', dash || null).attr('stroke-linecap', 'round');
      row.append('text').attr('x', 24).attr('y', 3.5)
        .attr('fill', col.textMuted).text(label);
    }
    legendRow(2, col.model, null, 'model');
    legendRow(16, col.truth, '3,3', 'truth');

    // ---- likelihood meter ----
    plot.append('text').attr('class', 'viz-mle-meter-cap')
      .attr('x', METER_X + METER_W / 2).attr('y', -3).attr('text-anchor', 'middle')
      .attr('fill', col.textMuted).text('ℓ');

    plot.append('rect')
      .attr('x', METER_X).attr('y', 0).attr('width', METER_W).attr('height', INNER_H)
      .attr('rx', 4).attr('fill', col.meterTrack)
      .attr('stroke', col.meterEdge).attr('stroke-width', 1);

    var meterFill = plot.append('rect')
      .attr('x', METER_X).attr('width', METER_W).attr('rx', 4)
      .attr('fill', 'url(#' + meterGradId + ')');

    var meterValue = plot.append('text').attr('class', 'viz-mle-meter-val')
      .attr('x', METER_X + METER_W / 2).attr('text-anchor', 'middle')
      .attr('fill', col.text);

    // ---- controls (inside the same card) ----
    var controls = document.createElement('div');
    controls.className = 'viz-mle-controls';
    card.appendChild(controls);

    var muCtl = core.addSlider(controls, {
      classPrefix: 'viz-mle', label: C.params[0].label,
      min: C.params[0].min, max: C.params[0].max, step: C.params[0].step,
      value: mu, decimals: 1
    });
    var sigmaCtl = core.addSlider(controls, {
      classPrefix: 'viz-mle', label: C.params[1].label,
      min: C.params[1].min, max: C.params[1].max, step: C.params[1].step,
      value: sigma, decimals: 1
    });

    // short caption beneath the plate
    var figcaption = document.createElement('div');
    figcaption.className = 'viz-mle-figcaption';
    var fignum = (config.fignum != null ? config.fignum : C.figure.number);
    var fightml = (config.figcaption != null ? String(config.figcaption) : C.figure.html);
    figcaption.innerHTML = '<span class="viz-mle-fignum">' + fignum + '</span> ' + fightml;
    figure.appendChild(figcaption);

    function redraw() {
      var pts = curvePoints(mu, sigma, C.xDomain);
      modelLine.attr('d', line(pts));
      modelArea.attr('d', area(pts));
      muCtl.valueSpan.textContent = mu.toFixed(1);
      sigmaCtl.valueSpan.textContent = sigma.toFixed(1);

      var ll = totalLogLik(C.data, mu, sigma);
      var frac = Math.max(0, Math.min(1, (ll - MIN_LL) / (MAX_LL - MIN_LL)));
      var barH = frac * INNER_H;
      var locked = Math.abs(ll - MAX_LL) < 0.05;

      meterFill.attr('y', INNER_H - barH).attr('height', barH)
        .attr('fill', locked ? col.success : 'url(#' + meterGradId + ')');

      var labelY = Math.max(13, Math.min(INNER_H - 4, INNER_H - barH - 6));
      meterValue.attr('y', labelY)
        .attr('fill', locked ? col.success : col.text)
        .text(ll.toFixed(1));
    }

    var scheduleRedraw = core.createRafScheduler(redraw);
    muCtl.input.addEventListener('input', function () {
      mu = +muCtl.input.value; scheduleRedraw();
    });
    sigmaCtl.input.addEventListener('input', function () {
      sigma = +sigmaCtl.input.value || sigmaDef; scheduleRedraw();
    });

    redraw();
  }

  if (window.VizRegistry) window.VizRegistry.register('mle', render);
})();

      const departmentSnapshotGeometries = new WeakMap();
      const departmentTreemapLayouts = new WeakMap();
      const DEPARTMENT_MISSING_COLOR = "#E2E8F0";

      function departmentSnapshotPalette() {
        const { positive: [lightGreen, green], neutral, negative: [lightRed, red] } = treemapPalette();
        return [green, lightGreen, neutral, lightRed, red];
      }

      function buildDepartmentSnapshot(departments, palette = departmentSnapshotPalette()) {
        const records = Array.from(departments.values()).filter(({ value }) => Number.isFinite(value));
        const values = records.map(({ value }) => value).sort(d3.ascending);
        const distinct = [...new Set(values)];
        const classCount = Math.min(distinct.length, palette.length);
        const cuts = d3.range(1, classCount).map((index) => {
          if (distinct.length > 12) return d3.quantileSorted(values, index / classCount);
          const position = Math.round(index * distinct.length / classCount) - 1;
          return (distinct[position] + distinct[position + 1]) / 2;
        });
        const thresholds = [...new Set(cuts)].filter((cut) => cut > values[0]);
        if (!thresholds.length && classCount > 1) thresholds.push(distinct[1]);
        const colors = thresholds.length
          ? d3.range(thresholds.length + 1).map((index) => palette[Math.round(index * (palette.length - 1) / thresholds.length)])
          : [palette[Math.floor(palette.length / 2)]];
        const scale = d3.scaleThreshold(thresholds, colors);
        const fill = ({ value }) => Number.isFinite(value) ? scale(value) : DEPARTMENT_MISSING_COLOR;
        const highest = d3.least(records, (a, b) => b.value - a.value || a.name.localeCompare(b.name, "fr"));
        return { departments, thresholds, colors, values, highest, fill };
      }

      function renderDepartmentSnapshotLegend(legend, { thresholds, colors, values, departments }, formatValue) {
        function makeKey(color, label) {
          const key = textElement("span", "", "trar-color-key");
          const swatch = textElement("i", "");
          swatch.style.backgroundColor = color;
          swatch.setAttribute("aria-hidden", "true");
          key.append(swatch, document.createTextNode(label));
          return key;
        }
        const items = values.length ? colors.map((color, index) => {
          const lower = thresholds[index - 1];
          const upper = thresholds[index];
          let interval = formatValue(values[0]);
          if (upper !== undefined) interval = `${lower === undefined ? "" : `${formatValue(lower)} à `}< ${formatValue(upper)}`;
          else if (lower !== undefined) interval = `≥ ${formatValue(lower)}`;
          return makeKey(color, interval);
        }) : [];
        if (values.length < departments.size) items.push(makeKey(DEPARTMENT_MISSING_COLOR, "Donnée indisponible"));
        legend.replaceChildren(...items);
      }

      function departmentSnapshotGeometry(features) {
        let geometry = departmentSnapshotGeometries.get(features);
        if (geometry) return geometry;
        const collection = { type: "FeatureCollection", features };
        const path = d3.geoPath(d3.geoMercator().fitSize([700, 520], collection));
        const [[x0, y0], [x1, y1]] = path.bounds(collection);
        const pad = 26;
        const viewBox = Number.isFinite(x0)
          ? [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].join(" ")
          : "0 0 700 520";
        const paths = new Map(features.map((feature) => [feature.properties.code, path(feature)]));
        const centroids = new Map(features.map((feature) => [feature.properties.code, path.centroid(feature)]));
        geometry = { viewBox, paths, centroids };
        departmentSnapshotGeometries.set(features, geometry);
        return geometry;
      }

      function renderDepartmentSnapshotMap(svg, features, label, fill) {
        const { viewBox, paths } = departmentSnapshotGeometry(features);
        svg.attr("viewBox", viewBox).attr("aria-label", `Carte départementale · ${label}`);
        let layer = svg.select("g.trar-map-paths");
        if (layer.empty()) layer = svg.append("g").attr("class", "trar-map-paths");
        const marks = layer.selectAll("path").data(features, ({ properties }) => properties.code)
          .join("path").attr("class", "trar-map-department").attr("fill", fill);
        if (layer.datum() !== features) {
          marks.attr("d", ({ properties }) => paths.get(properties.code));
          layer.datum(features);
        }
        return marks;
      }

      function renderDepartmentSnapshotTreemap(svg, features, getDepartment, fill, formatValue) {
        const width = 660;
        const height = 470;
        let layout = departmentTreemapLayouts.get(features);
        if (!layout) {
          const children = d3.groups(features, ({ properties }) => properties.region)
            .map(([code, group]) => ({ code, children: group.map(({ properties }) => ({ code: properties.code })) }));
          const root = d3.hierarchy({ children }).sum((node) => node.children ? 0 : 1)
            .sort((a, b) => b.value - a.value || a.data.code.localeCompare(b.data.code, "fr"));
          d3.treemap().tile(d3.treemapSquarify.ratio(1)).size([width, height])
            .paddingInner((node) => node.depth === 0 ? 4 : 2)
            .paddingLeft(3).paddingRight(3).paddingBottom(3)
            .paddingTop((node) => node.depth === 1 && node.y1 - node.y0 >= 38 ? 18 : 3).round(true)(root);
          layout = root.children || [];
          departmentTreemapLayouts.set(features, layout);
        }
        svg.attr("viewBox", `0 0 ${width} ${height}`);
        const groups = svg.selectAll("g.trar-region-group").data(layout, (node) => node.data.code)
          .join((enter) => {
            const group = enter.append("g").attr("class", "trar-region-group");
            group.append("rect").attr("rx", 4).attr("aria-hidden", "true");
            group.append("text").attr("class", "trar-region-text").attr("aria-hidden", "true");
            return group;
          });
        groups.attr("transform", (node) => `translate(${node.x0},${node.y0})`);
        groups.select("rect").attr("width", (node) => node.x1 - node.x0).attr("height", (node) => node.y1 - node.y0);
        groups.select(".trar-region-text").attr("x", 5).attr("y", 12).text((node) => {
          if (node.y1 - node.y0 < 38) return "";
          const name = regionsByCode.get(node.data.code)?.name || node.data.code;
          const maxChars = Math.floor((node.x1 - node.x0 - 10) / 5.8);
          return name.length <= maxChars ? name : maxChars >= 4 ? `${name.slice(0, maxChars - 1)}…` : "";
        });
        const tiles = groups.selectAll("g.trar-department-tile").data((node) => node.children, (node) => node.data.code)
          .join((enter) => {
            const tile = enter.append("g").attr("class", "trar-department-tile");
            tile.append("rect").attr("rx", 3).attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-code").attr("aria-hidden", "true");
            tile.append("text").attr("class", "trar-tile-rate").attr("aria-hidden", "true");
            return tile;
          });
        tiles.attr("transform", (node) => `translate(${node.x0 - node.parent.x0},${node.y0 - node.parent.y0})`);
        const tileWidth = (node) => node.x1 - node.x0;
        const tileHeight = (node) => node.y1 - node.y0;
        const showValue = (node) => tileWidth(node) >= 44 && tileHeight(node) >= 30;
        tiles.select("rect").attr("width", tileWidth).attr("height", tileHeight).attr("fill", fill);
        tiles.select(".trar-tile-code").attr("x", (node) => tileWidth(node) / 2)
          .attr("y", (node) => tileHeight(node) / 2 - (showValue(node) ? 5 : 0))
          .text((node) => tileWidth(node) >= 18 && tileHeight(node) >= 14 ? node.data.code : "");
        tiles.select(".trar-tile-rate").attr("x", (node) => tileWidth(node) / 2)
          .attr("y", (node) => tileHeight(node) / 2 + 8)
          .text((node) => showValue(node) ? formatValue(getDepartment(node).value) : "");
        return tiles;
      }

      function renderDepartmentSnapshotLabels(svg, features, departments, selected, formatValue) {
        const { centroids } = departmentSnapshotGeometry(features);
        const labels = features.flatMap(({ properties: { code } }) => {
          const { value } = departments.get(code);
          const [x, y] = centroids.get(code);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          if (code !== selected || !Number.isFinite(value)) return [{ code, x, y, text: code, className: "trar-map-label" }];
          return [
            { code, x, y: y - 7, text: code, className: "trar-map-label" },
            { code, x, y: y + 9, text: formatValue(value), className: "trar-map-sublabel" },
          ];
        });
        svg.selectAll("g.trar-map-labels").data([null]).join("g").attr("class", "trar-map-labels")
          .attr("aria-hidden", "true").selectAll("text").data(labels, ({ code, className }) => `${code}:${className}`)
          .join("text").attr("class", ({ className }) => className)
          .attr("x", ({ x }) => x).attr("y", ({ y }) => y).text(({ text }) => text);
      }

      function renderDepartmentSnapshot({
        mapSvg, treemapSvg, legend, features, national, label, selected, departments, palette,
        formatValue, formatLegendValue = formatValue, describe, onSelect,
        snapshot = buildDepartmentSnapshot(departments, palette),
      }) {
        const { departments: records, highest, values, fill } = snapshot;
        let active = records.get(selected)?.hasHistory ? selected
          : highest?.code || Array.from(records.values()).find(({ hasHistory }) => hasHistory)?.code;
        const svg = d3.select(national ? treemapSvg : mapSvg);
        const getDepartment = national
          ? (node) => records.get(node.data.code)
          : ({ properties }) => records.get(properties.code);
        const fillMark = (item) => fill(getDepartment(item));
        dismissVizTooltip(national ? mapSvg : treemapSvg);
        const marks = national
          ? renderDepartmentSnapshotTreemap(svg, features, getDepartment, fillMark, formatValue)
          : renderDepartmentSnapshotMap(svg, features, label, fillMark);
        marks.attr("data-code", (item) => getDepartment(item).code)
          .attr("aria-disabled", (item) => getDepartment(item).hasHistory ? null : "true");

        function updateSelection() {
          marks.classed("is-selected", (item) => getDepartment(item).code === active)
            .attr("aria-pressed", (item) => String(getDepartment(item).code === active));
          if (!national) renderDepartmentSnapshotLabels(svg, features, records, active, formatValue);
        }

        bindVizTooltip(marks, {
          label: (item) => {
            const { place, details } = describe(getDepartment(item));
            return `${place} · ${details}`;
          },
          show: (position, item) => {
            const { place, details } = describe(getDepartment(item));
            showTooltip(position, place, details, true);
          },
          hide: hideTooltip,
          arrowNavigation: true,
          activate: (item) => {
            const { code, hasHistory } = getDepartment(item);
            if (!hasHistory || active === code) return;
            active = code;
            updateSelection();
            onSelect(code);
          },
        });
        updateSelection();
        renderDepartmentSnapshotLegend(legend, snapshot, formatLegendValue);
        return { selected: active, highest, hasValues: values.length > 0 };
      }

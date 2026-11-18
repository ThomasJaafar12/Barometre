      const europeBackdrop = __EUROPE_CONTEXT__;

      function cockpitCenter() {
        const [left, top, right, bottom] = mapLayout.mainlandExtent;
        return [(left + right) / 2, (top + bottom) / 2];
      }

      function activateByKeyboard(event, activate) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) activate();
      }

      function mountCockpitMap(refs) {
        const svg = landingMapSvg.node();
        const frame = document.getElementById("cockpitMainlandFrame");
        const obstacles = [document.getElementById("cockpitReadout"), document.getElementById("cockpitTerritories")];
        const mainland = refs.featureLayer.select(".mainland-layer");
        const regionPaths = mainland.selectAll(".path-region");
        const projection = refs.mainlandProjection;
        landingMapSvg.classed("cockpit-geo", true).attr("preserveAspectRatio", "none");
        const context = refs.featureLayer.insert("g", ":first-child").attr("aria-hidden", "true").attr("pointer-events", "none");
        // Les tracés voisins sont déjà projetés en Mercator. La même transformation
        // les aligne sur les régions, quelle que soit l’étendue du jeu français.
        const land = context.append("g").attr("transform",
          `translate(${projection(europeBackdrop.origin).join(",")}) scale(${projection.scale() / europeBackdrop.scale})`);
        land.append("path").attr("class", "land-side").attr("d", europeBackdrop.countries.map(item => item.shape).join(""));
        land.selectAll("path.land-face").data(europeBackdrop.countries).join("path")
          .attr("class", "land-face").attr("d", item => item.shape);
        const countryLabels = europeBackdrop.countries.filter(item => item.anchor)
          .map(item => ({ name: item.name, anchor: projection(item.anchor) }));
        const labels = context.selectAll("text").data(countryLabels).join("text")
          .attr("class", "country-name").attr("x", item => item.anchor[0]).attr("y", item => item.anchor[1])
          .text(item => item.name);
        context.append("path").attr("class", "france-side").attr("d", regionPaths.nodes().map(node => node.getAttribute("d")).join(""));
        regionPaths.classed("region-face", true).attr("role", "button").attr("tabindex", 0)
          .attr("aria-label", f => regionsByCode.get(f.properties.code).name)
          .on("click", (_, feature) => selectRegion(feature.properties.code))
          .on("keydown", (event, feature) => activateByKeyboard(event, () => selectRegion(feature.properties.code)));

        let mainlandBounds;
        const [centerX, centerY] = cockpitCenter();
        function resize() {
          if (state.phase !== "landing") return;
          const box = svg.getBoundingClientRect();
          if (!box.width || !box.height) return;
          const target = frame.getBoundingClientRect();
          if (!target.width || !target.height) return;
          mainlandBounds ??= mainland.node().getBBox();
          const blocked = obstacles.map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
          const unit = Math.max(mainlandBounds.width / target.width, mainlandBounds.height / target.height) / .91;
          const x = centerX - (target.left - box.left + target.width / 2) * unit;
          const y = centerY - (target.top - box.top + target.height / 2) * unit;
          landingMapSvg.attr("viewBox", [x, y, box.width * unit, box.height * unit].join(" "));
          const regionSize = Math.max(8.3, Math.min(12.3, target.width * .019));
          const countrySize = Math.max(9, Math.min(12, target.width * .021));
          landingMapSvg.style("--region-type", regionSize * unit + "px").style("--country-type", countrySize * unit + "px");
          labels.attr("display", item => {
            const cx = box.left + (item.anchor[0] - x) / unit, cy = box.top + (item.anchor[1] - y) / unit;
            const half = item.name.length * countrySize * .34;
            const clipped = cx - half < box.left + 6 || cx + half > box.right - 6 || cy - countrySize < box.top + 4 || cy > box.bottom - 5;
            const covered = blocked.some(r => cx + half > r.left - 6 && cx - half < r.right + 6
              && cy > r.top - 6 && cy - countrySize < r.bottom + 6);
            return clipped || covered ? "none" : null;
          });
        }
        const cockpitResizeObserver = new ResizeObserver(resize);
        [svg, frame, ...obstacles].forEach(node => cockpitResizeObserver.observe(node));
      }

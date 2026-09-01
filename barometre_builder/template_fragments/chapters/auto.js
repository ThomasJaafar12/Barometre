      let autoDepartmentByCode = null;
      let autoDepartmentFeaturesByRegion = null;

      const AUTO_SECTOR_GROUPS = [
        {
          key: "industry",
          label: "Production & bâtiment",
          codes: ["AZ", "CZ1", "CZ2", "F1", "F2", "F3"],
        },
        {
          key: "trade",
          label: "Commerce, transport & restauration",
          codes: ["G1", "G2", "G3", "G4", "G5", "G6", "HZ1", "HZ2", "HZ3", "HZ4", "IZ1", "IZ2"],
        },
        {
          key: "business",
          label: "Services aux entreprises",
          codes: ["JZ", "KZ", "LZ", "M1", "M2", "M3", "M4", "M5", "N1", "N2"],
        },
        {
          key: "collective",
          label: "Services aux personnes",
          codes: ["PZ", "QZ", "R1", "R2", "S1", "S2", "S3", "UZ"],
        },
      ];

      function metricValueForDepartment(department, sectorKey, metricKey) {
        const sectorValues = department.values[sectorKey];
        return sectorValues ? sectorValues[metricKey] : null;
      }

      function getAutoDepartmentIndex() {
        if (!autoDepartmentByCode) {
          autoDepartmentByCode = new Map(DATA.modules.auto.departments.map((department) => [department.code, department]));
        }
        return autoDepartmentByCode;
      }

      function getAutoDepartmentFeaturesByRegion() {
        if (!autoDepartmentFeaturesByRegion) {
          autoDepartmentFeaturesByRegion = new Map();
          DATA.geography.departments.features.forEach((feature) => {
            const regionCode = feature.properties.region;
            const features = autoDepartmentFeaturesByRegion.get(regionCode) || [];
            features.push(feature);
            autoDepartmentFeaturesByRegion.set(regionCode, features);
          });
        }
        return autoDepartmentFeaturesByRegion;
      }

      function renderAutoModule() {
        const mapMeta = document.getElementById("autoMapMeta");
        const rankingMeta = document.getElementById("autoRankingMeta");
        const autoPanel = document.getElementById("autoMapPanel");
        const autoRanking = document.getElementById("autoRanking");
        const mapGrid = document.querySelector(".auto-department-card .department-map-grid");
        const departmentIndex = getAutoDepartmentIndex();
        const featuresByRegion = getAutoDepartmentFeaturesByRegion();
        const scopeDepartmentCodes = state.phase === "national"
          ? new Set(DATA.modules.auto.departments.map((department) => department.code))
          : new Set((DATA.modules.auto.regions[state.selectedRegion] && DATA.modules.auto.regions[state.selectedRegion].departmentCodes) || []);
        const departments = DATA.modules.auto.departments.filter((department) => scopeDepartmentCodes.has(department.code));

        renderMetricSwitch("autoMetricSwitch", DATA.modules.auto.metrics, state.autoMetric, (key) => {
          state.autoMetric = key;
          renderAutoModule();
        });

        renderEmploymentSectorPicker(
          "autoSectorPicker",
          DATA.modules.auto.sectors,
          "autoSector",
          renderAutoModule,
          AUTO_SECTOR_GROUPS,
        );

        if (!departments.length) {
          renderEmptyState(autoPanel, "Données manquantes", "Les auto-entrepreneurs ne sont pas documentés ici dans les CSV fournis.");
          autoRanking.innerHTML = "";
          syncDepartmentRankingHeight(mapGrid);
          return;
        }

        const activeSector = DATA.modules.auto.sectors.find((sector) => sector.key === state.autoSector);
        const activeMetric = DATA.modules.auto.metrics.find((metric) => metric.key === state.autoMetric);

        mapMeta.textContent = `${scopeLabel()} / ${quarterLabel(DATA.modules.auto.latestDate)} / ${activeSector.label}`;
        rankingMeta.textContent = activeMetric.label;

        const values = departments.map((department) => metricValueForDepartment(department, state.autoSector, state.autoMetric)).filter((value) => value != null);
        const scale = values.length
          ? buildScale(d3.extent(values), [paletteToken("chart-auto-low", "#BFE8CF"), paletteToken("chart-auto-high", "#16A34A")])
          : () => paletteToken("chart-auto-low", "#BFE8CF");
        const svg = d3.select("#autoMapSvg");
        svg.selectAll("*").remove();

        if (state.phase === "national") {
          drawCompositeMap(svg, DATA.geography.departments, {
            clickable: false,
            keyResolver: (feature) => feature.properties.code,
            regionResolver: (feature) => feature.properties.region,
            className: (feature) => `path-department${departmentIndex.has(feature.properties.code) ? "" : " is-unavailable"}`,
            fillResolver: (feature) => {
              const department = departmentIndex.get(feature.properties.code);
              const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
              return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
            },
            tooltipResolver: (feature) => {
              const department = departmentIndex.get(feature.properties.code);
              const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
              return { label: department ? department.name : feature.properties.nom, value: state.autoMetric === "turnover" ? formatCurrency(value) : formatCount(value) };
            },
          });
        } else {
          const features = featuresByRegion.get(state.selectedRegion) || [];
          const projection = d3.geoMercator().fitExtent([[32, 32], [868, 588]], { type: "FeatureCollection", features });
          const path = d3.geoPath(projection);
          const root = svg.append("g");
          root.selectAll("path")
            .data(features)
            .join("path")
            .attr("class", (feature) => `path-department${departmentIndex.has(feature.properties.code) ? "" : " is-unavailable"}`)
            .attr("d", path)
            .attr("fill", (feature) => {
              const department = departmentIndex.get(feature.properties.code);
              const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
              return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
            })
            .on("mouseenter", (event, feature) => {
              const department = departmentIndex.get(feature.properties.code);
              const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
              showTooltip(event, department ? department.name : feature.properties.nom, state.autoMetric === "turnover" ? formatCurrency(value) : formatCount(value));
            })
            .on("mousemove", (event, feature) => {
              const department = departmentIndex.get(feature.properties.code);
              const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
              showTooltip(event, department ? department.name : feature.properties.nom, state.autoMetric === "turnover" ? formatCurrency(value) : formatCount(value));
            })
            .on("mouseleave", hideTooltip);
        }

        const domain = d3.extent(values);
        const legend = document.getElementById("autoLegend");
        legend.innerHTML = `<span>${state.autoMetric === "turnover" ? formatCurrency(domain[0]) : formatCount(domain[0])}</span><span>→</span><span>${state.autoMetric === "turnover" ? formatCurrency(domain[1]) : formatCount(domain[1])}</span>`;
        autoRanking.innerHTML = "";
        departments
          .map((department) => ({ ...department, metric: metricValueForDepartment(department, state.autoSector, state.autoMetric) }))
          .filter((department) => department.metric != null)
          .sort((a, b) => b.metric - a.metric)
          .slice(0, 10)
          .forEach((department) => {
            const article = document.createElement("article");
            article.className = "ranking-item";
            article.innerHTML = `<div class="topline"><strong>${department.name}</strong><strong>${state.autoMetric === "turnover" ? formatCurrency(department.metric) : formatCount(department.metric)}</strong></div><span>${regionsByCode.get(department.regionCode).name}</span>`;
            autoRanking.appendChild(article);
          });
        syncDepartmentRankingHeight(mapGrid);
      }

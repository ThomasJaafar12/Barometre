      const autoDepartmentIndexes = new WeakMap();
      const autoScopeDepartments = new WeakMap();
      let autoMapScope = null;

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
        const departments = DATA.modules.auto.departments;
        let index = autoDepartmentIndexes.get(departments);
        if (!index) {
          index = new Map(departments.map((department) => [department.code, department]));
          autoDepartmentIndexes.set(departments, index);
        }
        return index;
      }

      function getAutoDepartmentFeaturesByRegion() {
        return geographyIndex(DATA.geography).departmentsByRegion;
      }

      function getAutoScopeDepartments() {
        const data = DATA.modules.auto;
        if (state.phase === "national") return data.departments;
        const scope = data.regions[state.selectedRegion];
        if (!scope) return [];
        let cached = autoScopeDepartments.get(scope);
        if (!cached || cached.source !== data.departments) {
          const codes = new Set(scope.departmentCodes || []);
          cached = { source: data.departments, departments: data.departments.filter((department) => codes.has(department.code)) };
          autoScopeDepartments.set(scope, cached);
        }
        return cached.departments;
      }

      function renderAutoModule() {
        const mapMeta = document.getElementById("autoMapMeta");
        const rankingMeta = document.getElementById("autoRankingMeta");
        const autoRanking = document.getElementById("autoRanking");
        const mapGrid = document.querySelector(".auto-department-card .department-map-grid");
        const departmentIndex = getAutoDepartmentIndex();
        const featuresByRegion = getAutoDepartmentFeaturesByRegion();
        const departments = getAutoScopeDepartments();

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
          mapMeta.textContent = `${scopeLabel()} / données indisponibles`;
          rankingMeta.textContent = "Données indisponibles";
          document.getElementById("autoLegend").replaceChildren();
          const emptySvg = d3.select("#autoMapSvg");
          dismissVizTooltip(emptySvg.node());
          emptySvg.selectAll("*").remove();
          autoMapScope = null;
          emptySvg.append("text")
            .attr("x", 450).attr("y", 310).attr("text-anchor", "middle")
            .attr("fill", paletteToken("employment-chart-muted", "#64748B"))
            .style("font-size", "18px")
            .text("Aucune donnée disponible pour ce territoire.");
          autoRanking.replaceChildren();
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
        const nextMapScope = state.phase === "national" ? "national" : state.selectedRegion;
        if (autoMapScope !== nextMapScope) {
          dismissVizTooltip(svg.node());
          svg.selectAll("*").remove();
        }
        autoMapScope = nextMapScope;
        const formatValue = state.autoMetric === "turnover" ? formatCurrency : formatCount;
        const tooltipResolver = (feature) => {
          const department = departmentIndex.get(feature.properties.code);
          const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
          return { label: department ? department.name : feature.properties.nom, value: formatValue(value) };
        };
        const className = (feature) => `path-department${departmentIndex.has(feature.properties.code) ? "" : " is-unavailable"}`;
        const fillResolver = (feature) => {
          const department = departmentIndex.get(feature.properties.code);
          const value = department ? metricValueForDepartment(department, state.autoSector, state.autoMetric) : null;
          return value != null ? scale(value) : paletteToken("map-empty", "rgba(255,255,255,0.05)");
        };

        if (state.phase === "national") {
          drawCompositeMap(svg, DATA.geography.departments, {
            clickable: false,
            keyResolver: (feature) => feature.properties.code,
            regionResolver: (feature) => feature.properties.region,
            className,
            fillResolver,
            tooltipResolver,
          });
        } else {
          const features = featuresByRegion.get(state.selectedRegion) || [];
          const paths = renderDepartmentMapPaths(svg, features).attr("class", className).attr("fill", fillResolver);
          bindDepartmentTooltip(paths, tooltipResolver);
        }

        const domain = d3.extent(values);
        const legend = document.getElementById("autoLegend");
        rangeLegend(legend, state.autoMetric === "turnover" ? formatCurrency(domain[0]) : formatCount(domain[0]), state.autoMetric === "turnover" ? formatCurrency(domain[1]) : formatCount(domain[1]));
        const articles = departments
          .map((department) => ({ ...department, metric: metricValueForDepartment(department, state.autoSector, state.autoMetric) }))
          .filter((department) => department.metric != null)
          .sort((a, b) => b.metric - a.metric)
          .slice(0, 10)
          .map((department) => rankingArticle(department.name, state.autoMetric === "turnover" ? formatCurrency(department.metric) : formatCount(department.metric), regionsByCode.get(department.regionCode).name));
        autoRanking.replaceChildren(...articles);
        syncDepartmentRankingHeight(mapGrid);
      }

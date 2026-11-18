      // Les mêmes formats servent à l’aperçu, à l’en-tête du territoire et aux graphiques.
      const decimalNumberFormatters = new Map();
      const monthDateFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });

      function frNumber(value, digits = 1) {
        if (value == null || Number.isNaN(value)) return "—";
        let formatter = decimalNumberFormatters.get(digits);
        if (!formatter) {
          formatter = new Intl.NumberFormat("fr-FR", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          });
          decimalNumberFormatters.set(digits, formatter);
        }
        return formatter.format(Number(value));
      }

      function formatCount(value) {
        if (value == null || Number.isNaN(value)) return "—";
        const magnitude = Math.abs(value);
        if (magnitude >= 1e6) return `${frNumber(value / 1e6, 2)} M`;
        if (magnitude >= 1e3) return `${frNumber(value / 1e3, 1)} k`;
        return frNumber(value, 0);
      }

      function formatCurrency(value) {
        if (value == null || Number.isNaN(value)) return "—";
        const magnitude = Math.abs(value);
        if (magnitude >= 1e9) return `${frNumber(value / 1e9, 1)} Md€`;
        if (magnitude >= 1e6) return `${frNumber(value / 1e6, 1)} M€`;
        return `${frNumber(value, 0)} €`;
      }

      function monthLabel(dateValue) {
        if (!dateValue) return "—";
        const date = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(date.valueOf()) ? "—" : monthDateFormatter.format(date);
      }

      function quarterLabel(dateValue) {
        if (!dateValue) return "—";
        const date = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(date.valueOf()) ? "—" : `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
      }

      function createIndicatorCard(indicator) {
        const card = document.createElement("article");
        card.className = "kpi-card";
        card.dataset.indicator = indicator.key;
        const label = document.createElement("span");
        label.className = "label";
        const highlight = document.createElement("span");
        highlight.className = `text-highlight text-highlight--${indicator.key}`;
        highlight.textContent = indicator.label;
        label.append(highlight);
        const meta = document.createElement("span");
        meta.className = "meta";
        card.append(label, document.createElement("strong"), meta);
        return card;
      }

      function updateIndicatorCard(card, indicator, point) {
        const period = indicator.frequency === "quarter" ? quarterLabel(point?.date) : monthLabel(point?.date);
        card.querySelector("strong").textContent = indicator.format === "currency" ? formatCurrency(point?.value) : formatCount(point?.value);
        card.querySelector(".meta").textContent = point?.value == null
          ? `Donnée indisponible${point?.date ? ` · ${period}` : ""}` : period;
        return period;
      }

      const cockpitTitle = document.getElementById("cockpitScopeName");
      const cockpitCards = document.getElementById("cockpitKpis");
      const territoryButtons = new Map();
      let previewCode = null;
      let pointerScope = null;
      let focusScope = null;

      function previewTerritory(code) {
        const next = code || "national";
        if (state.phase !== "landing" || state.mapHoverLocked || next === previewCode) return;
        const region = regionsByCode.get(next);
        const hero = region ? region.hero : DATA.nationalHero;
        cockpitTitle.textContent = region ? region.name : "France entière";
        detail.indicators.forEach((indicator, index) => {
          updateIndicatorCard(cockpitCards.children[index], indicator, hero[indicator.key]);
        });
        const map = chartRefs.regionMap;
        map?.pathByCode.get(previewCode)?.classed("is-hovered", false);
        map?.labelByCode.get(previewCode)?.classed("is-active", false);
        map?.pathByCode.get(next)?.classed("is-hovered", true);
        map?.labelByCode.get(next)?.classed("is-active", true);
        territoryButtons.get(previewCode)?.classList.remove("is-active");
        territoryButtons.get(next)?.classList.add("is-active");
        previewCode = next;
      }

      function resetTerritoryPreview() {
        pointerScope = focusScope = null;
        previewTerritory(null);
      }

      function initCockpitReadout() {
        cockpitCards.replaceChildren(...detail.indicators.map(createIndicatorCard));
        const rail = document.getElementById("cockpitTerritories");
        for (const code of ["national", "01", "02", "03", "04"]) {
          const region = regionsByCode.get(code);
          if (code !== "national" && !region) continue;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "territory-link";
          button.dataset.scope = code;
          if (code === "national") {
            const flag = document.createElement("span");
            flag.className = "territory-symbol territory-flag";
            flag.setAttribute("aria-hidden", "true");
            button.append(flag);
          } else {
            const feature = DATA.geography.regions.features.find(item => item.properties.code === code);
            const icon = d3.select(button).append("svg").attr("class", "territory-symbol")
              .attr("viewBox", "0 0 36 32").attr("aria-hidden", "true").attr("focusable", "false");
            if (feature) {
              const projection = d3.geoMercator().fitExtent([[1, 1], [35, 31]], feature);
              icon.append("path").attr("d", d3.geoPath(projection).digits(1)(feature));
            }
          }
          const name = document.createElement("span");
          name.className = "territory-name";
          name.textContent = region ? region.name : "France entière";
          const arrow = document.createElement("span");
          arrow.className = "territory-arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "↗";
          button.append(name, arrow);
          button.addEventListener("click", () => selectTerritory(code));
          territoryButtons.set(code, button);
          rail.append(button);
        }
        // Une seule prévisualisation pour le clavier, la carte et les raccourcis ultramarins.
        const stage = document.getElementById("stageShell");
        function territoryAt(target) {
          const item = target?.closest?.("#cockpitTerritories [data-scope], #landingMap.cockpit-geo .region-face");
          return item?.dataset.scope || item?.dataset.code || null;
        }
        const trackPointer = event => {
          if (state.phase !== "landing" || event.pointerType === "touch") return;
          pointerScope = territoryAt(event.type === "pointerover" ? event.target : event.relatedTarget);
          previewTerritory(pointerScope || focusScope);
        };
        const trackFocus = event => {
          if (state.phase !== "landing") return;
          focusScope = territoryAt(event.type === "focusin" ? event.target : event.relatedTarget);
          if (event.type === "focusin" && focusScope) pointerScope = null;
          previewTerritory(pointerScope || focusScope);
        };
        stage.addEventListener("pointerover", trackPointer);
        stage.addEventListener("pointerout", trackPointer);
        stage.addEventListener("focusin", trackFocus);
        stage.addEventListener("focusout", trackFocus);
        resetTerritoryPreview();
      }

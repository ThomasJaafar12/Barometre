      const employmentPickerContexts = new WeakMap();

      function treemapPalette() {
        return {
          negative: ["#FF967D", paletteToken("employment-treemap-negative", "#ED4766")],
          positive: ["#62DDB1", paletteToken("employment-treemap-positive", "#10AD8D")],
          neutral: paletteToken("employment-treemap-neutral", "#F6C65B"),
        };
      }

      function treemapVariationColorScale(values, valueOf) {
        const maxAbs = Math.max(1.5, d3.max(values, (row) => {
          const value = valueOf(row);
          return Number.isFinite(value) ? Math.abs(value) : 0;
        }) || 0);
        const { negative, positive, neutral } = treemapPalette();
        const interpolateNegative = d3.interpolateRgb(...negative);
        const interpolatePositive = d3.interpolateRgb(...positive);
        return (value) => {
          if (!Number.isFinite(value)) return "#E2E8F0";
          if (Math.abs(value) <= 0.05) return neutral;
          const intensity = Math.sqrt(Math.min(1, Math.abs(value) / maxAbs));
          return value < 0 ? interpolateNegative(intensity) : interpolatePositive(intensity);
        };
      }

      function treemapVariationLegend({ negative, positive, missing }) {
        const entries = [
          ["negative", negative], ["neutral", "Quasi stable"], ["positive", positive],
        ];
        if (missing) entries.push(["unknown", missing]);
        return entries.map(([direction, label]) => {
          const chip = textElement("span", "", "legend-chip");
          chip.append(textElement("i", "", `employment-treemap-swatch is-${direction}`), document.createTextNode(label));
          return chip;
        });
      }

      const vizTooltipMarks = new WeakMap();
      const vizTooltipViews = new WeakMap();
      let activeVizTooltip = null;
      let vizTooltipFrame = null;

      function dismissVizTooltip(svg = null) {
        if (!activeVizTooltip || (svg && activeVizTooltip.view.svg !== svg)) return;
        const { element, view } = activeVizTooltip;
        activeVizTooltip = null;
        if (vizTooltipFrame != null) cancelAnimationFrame(vizTooltipFrame);
        vizTooltipFrame = null;
        element.classList.remove("is-viz-tooltip-active");
        view.options.hide?.();
      }

      function paintVizTooltip() {
        vizTooltipFrame = null;
        if (!activeVizTooltip) return;
        const { element, view, position } = activeVizTooltip;
        if (!element.isConnected || view.options.enabled?.() === false) {
          dismissVizTooltip();
          return;
        }
        const bounds = position ? null : element.getBoundingClientRect();
        view.options.show(position || { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }, element.__data__, element);
      }

      function openVizTooltip(element, mode, position = null) {
        const view = vizTooltipMarks.get(element);
        if (view.options.enabled?.() === false) return;
        if (activeVizTooltip?.element !== element) dismissVizTooltip();
        if (vizTooltipFrame != null) cancelAnimationFrame(vizTooltipFrame);
        element.classList.add("is-viz-tooltip-active");
        activeVizTooltip = { element, view, mode, position };
        paintVizTooltip();
      }

      function markVizTabStop(view, element) {
        if (view.options.arrowNavigation && view.current !== element) {
          view.current?.setAttribute("tabindex", "-1");
          element.setAttribute("tabindex", "0");
          view.current = element;
        }
      }

      function activateVizMark(element, position = null) {
        const view = vizTooltipMarks.get(element);
        if (view.options.enabled?.() === false) return;
        markVizTabStop(view, element);
        openVizTooltip(element, "activation", position);
        if (element.getAttribute("aria-disabled") !== "true") view.options.activate?.(element.__data__, element);
      }

      function onVizMarkKeyDown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const view = vizTooltipMarks.get(this);
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) activateVizMark(this);
          return;
        }
        if (!view.options.arrowNavigation) return;
        const index = view.elements.indexOf(this);
        const offsets = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
        const lastIndex = view.elements.length - 1;
        const next = event.key === "Home" ? 0 : event.key === "End" ? lastIndex : index + offsets[event.key];
        if (Number.isNaN(next)) return;
        event.preventDefault();
        view.elements[Math.max(0, Math.min(next, lastIndex))].focus({ preventScroll: true });
      }

      function bindVizTooltip(selection, options) {
        const elements = selection.nodes();
        if (!elements.length) return;
        const svg = elements[0].ownerSVGElement;
        let view = vizTooltipViews.get(svg);
        if (!view) {
          view = { svg };
          vizTooltipViews.set(svg, view);
        }
        const newMarks = selection.filter(function() { return !vizTooltipMarks.has(this); });
        view.options = options;
        view.elements = elements;
        if (!elements.includes(view.current)) view.current = elements[0];
        selection.each(function() { vizTooltipMarks.set(this, view); })
          .attr("tabindex", function() { return !options.arrowNavigation || this === view.current ? 0 : -1; })
          .attr("role", options.activate ? "button" : "img")
          .attr("aria-label", options.label);
        newMarks
          .on("pointerenter.vizTooltip", function(event) {
            if (event.pointerType !== "touch") openVizTooltip(this, "hover", event);
          })
          .on("pointermove.vizTooltip", function(event) {
            if (activeVizTooltip?.element !== this || activeVizTooltip.mode !== "hover") return;
            activeVizTooltip.position = event;
            if (vizTooltipFrame == null) vizTooltipFrame = requestAnimationFrame(paintVizTooltip);
          })
          .on("pointerleave.vizTooltip", function() {
            if (activeVizTooltip?.element === this && activeVizTooltip.mode === "hover") dismissVizTooltip();
          })
          .on("focus.vizTooltip", function() {
            markVizTabStop(vizTooltipMarks.get(this), this);
            openVizTooltip(this, "focus");
          })
          .on("blur.vizTooltip", function() {
            if (activeVizTooltip?.element === this) dismissVizTooltip();
          })
          .on("click.vizTooltip", function(event) {
            activateVizMark(this, event.detail ? event : null);
          })
          .on("keydown.vizTooltip", onVizMarkKeyDown);
        if (activeVizTooltip?.view === view) {
          if (elements.includes(activeVizTooltip.element)) {
            if (vizTooltipFrame == null) paintVizTooltip();
          } else dismissVizTooltip();
        }
      }

      document.addEventListener("pointerdown", (event) => {
        if (activeVizTooltip && !activeVizTooltip.element.contains(event.target)) dismissVizTooltip();
      }, true);
      document.addEventListener("keydown", (event) => {
        if (activeVizTooltip && event.key === "Escape") dismissVizTooltip();
      });

      function employmentSectorCode(option) {
        return option.label.trim().split(/\s+/, 1)[0];
      }

      function employmentSectorDisplayLabel(option) {
        if (option.key === "population-entiere") return option.label;
        const code = employmentSectorCode(option);
        const description = option.label
          .slice(code.length)
          .trim()
          .replace(/^[-–—:]\s*/, "");
        return description ? `${code} — ${description}` : option.label;
      }

      function setEmploymentSectorPickerOpen(control, isOpen, focusPosition = "active") {
        const trigger = control.querySelector(".employment-sector-trigger");
        const menu = control.querySelector(".employment-sector-menu");
        control.closest(".employment-main, .trar-panel-head")?.classList.toggle("has-open-sector-picker", isOpen);
        control.classList.toggle("is-open", isOpen);
        trigger.setAttribute("aria-expanded", String(isOpen));
        if (!isOpen) return;
        requestAnimationFrame(() => {
          const options = [...menu.querySelectorAll(".employment-sector-option")];
          const target = focusPosition === "last"
            ? options[options.length - 1]
            : options.find((option) => option.getAttribute("aria-selected") === "true") || options[0];
          target?.focus();
        });
      }

      function closeEmploymentSectorPickers(except = null) {
        document.querySelectorAll(".employment-sector-picker.is-open").forEach((control) => {
          if (control !== except) setEmploymentSectorPickerOpen(control, false);
        });
      }

      function renderEmploymentSectorPicker(controlId, sectorOptions, stateKey, onRender, groups) {
        const control = document.getElementById(controlId);
        const trigger = control.querySelector(".employment-sector-trigger");
        const triggerValue = control.querySelector(".employment-sector-trigger-value");
        const menu = control.querySelector(".employment-sector-menu");
        const selectedOption = sectorOptions.find((option) => option.key === state[stateKey]) || sectorOptions[0];
        const aggregateOption = sectorOptions.find((option) => option.key === "population-entiere");
        const previousContext = employmentPickerContexts.get(control);
        employmentPickerContexts.set(control, { sectorOptions, groups, stateKey, onRender });

        const selectedDisplayLabel = employmentSectorDisplayLabel(selectedOption);
        triggerValue.textContent = selectedDisplayLabel;
        trigger.setAttribute("aria-label", `Choisir le secteur, actuellement ${selectedDisplayLabel}`);
        menu.id = `${controlId}Menu`;
        trigger.setAttribute("aria-controls", menu.id);
        if (!previousContext || previousContext.sectorOptions !== sectorOptions || previousContext.groups !== groups) {
          menu.replaceChildren();

          const createOptionButton = (option, extraClass = "") => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `employment-sector-option${extraClass ? ` ${extraClass}` : ""}${option.key === state[stateKey] ? " is-active" : ""}`;
            button.dataset.sectorKey = option.key;
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(option.key === state[stateKey]));
            const label = document.createElement("span");
            label.textContent = employmentSectorDisplayLabel(option);
            const dot = document.createElement("span");
            dot.className = "employment-sector-active-dot";
            dot.setAttribute("aria-hidden", "true");
            button.append(label, dot);
            return button;
          };

          const header = document.createElement("div");
          header.className = "employment-sector-menu-header";
          const title = document.createElement("span");
          title.className = "employment-sector-menu-title";
          title.textContent = "Sélection du secteur d’activité";
          header.appendChild(title);
          if (aggregateOption) header.appendChild(createOptionButton(aggregateOption, "employment-sector-all-option"));
          menu.appendChild(header);

          const grid = document.createElement("div");
          grid.className = "employment-sector-grid";
          menu.appendChild(grid);
          groups.forEach((group) => {
            const options = sectorOptions
              .filter((option) => group.codes.includes(employmentSectorCode(option)))
              .sort((left, right) => group.codes.indexOf(employmentSectorCode(left)) - group.codes.indexOf(employmentSectorCode(right)));
            if (!options.length) return;
            const column = document.createElement("section");
            column.className = `employment-sector-column employment-sector-column--${group.key}`;
            column.setAttribute("role", "group");
            const groupTitleId = `${controlId}-${group.key}-title`;
            column.setAttribute("aria-labelledby", groupTitleId);

            const columnHeader = document.createElement("div");
            columnHeader.className = "employment-sector-column-header";
            const badge = document.createElement("span");
            badge.className = "employment-sector-badge";
            badge.id = groupTitleId;
            badge.textContent = group.label;
            const count = document.createElement("span");
            count.className = "employment-sector-count";
            count.textContent = String(options.length);
            columnHeader.append(badge, count);

            const list = document.createElement("ul");
            list.className = "employment-sector-list";
            options.forEach((option) => {
              const item = document.createElement("li");
              item.appendChild(createOptionButton(option));
              list.appendChild(item);
            });
            column.append(columnHeader, list);
            grid.appendChild(column);
          });

        }
        menu.querySelectorAll(".employment-sector-option").forEach((option) => {
          const isSelected = option.dataset.sectorKey === state[stateKey];
          option.classList.toggle("is-active", isSelected);
          option.setAttribute("aria-selected", String(isSelected));
        });

        if (!control.dataset.bound) {
          trigger.addEventListener("click", () => {
            const shouldOpen = !control.classList.contains("is-open");
            closeEmploymentSectorPickers(control);
            setEmploymentSectorPickerOpen(control, shouldOpen);
          });
          trigger.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            closeEmploymentSectorPickers(control);
            setEmploymentSectorPickerOpen(control, true, event.key === "ArrowUp" ? "last" : "active");
          });
          menu.addEventListener("click", (event) => {
            const option = event.target.closest(".employment-sector-option");
            if (!option) return;
            const context = employmentPickerContexts.get(control);
            state[context.stateKey] = option.dataset.sectorKey;
            setEmploymentSectorPickerOpen(control, false);
            context.onRender();
            requestAnimationFrame(() => control.querySelector(".employment-sector-trigger")?.focus());
          });
          menu.addEventListener("keydown", (event) => {
            const options = [...menu.querySelectorAll(".employment-sector-option")];
            const currentIndex = options.indexOf(document.activeElement);
            let nextIndex = null;
            if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = Math.min(currentIndex + 1, options.length - 1);
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = Math.max(currentIndex - 1, 0);
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = options.length - 1;
            if (nextIndex != null) {
              event.preventDefault();
              options[nextIndex]?.focus();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEmploymentSectorPickerOpen(control, false);
              trigger.focus();
            }
          });
          document.addEventListener("click", (event) => {
            if (!control.contains(event.target)) setEmploymentSectorPickerOpen(control, false);
          });
          control.dataset.bound = "true";
        }
      }

      function employmentTrendState(value) {
        if (value == null || Number.isNaN(value)) return "unknown";
        if (value > 0.05) return "positive";
        if (value < -0.05) return "negative";
        return "neutral";
      }

      function employmentSignedPercent(value) {
        if (value == null || Number.isNaN(value)) return "—";
        return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
      }

      function renderEmploymentTrend(elementId, value) {
        const element = document.getElementById(elementId);
        const stateName = employmentTrendState(value);
        element.classList.remove("is-positive", "is-negative", "is-neutral", "is-unknown");
        element.classList.add(`is-${stateName}`);
        element.querySelector("span").textContent = employmentSignedPercent(value);
        element.setAttribute("aria-label", employmentSignedPercent(value));
      }


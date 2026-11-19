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

      function renderAutoModule() {
        const data = DATA.modules.auto;
        renderEmploymentDepartment({
          prefix: "auto", data, sectors: data.sectors, groups: AUTO_SECTOR_GROUPS,
          sectorState: "autoSector", metricState: "autoMetric",
          endpoints: [paletteToken("chart-auto-low", "#BFE8CF"), paletteToken("chart-auto-high", "#16A34A")],
          color: "#167643",
        });
      }

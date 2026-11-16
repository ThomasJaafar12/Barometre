      function renderPayrollModule() {
        document.getElementById("payrollSubtitle").textContent = `Suivez les procédures collectives, les déclarations préalables à l’embauche, les accords de délais de paiement et le taux de reste à recouvrer en ${scopeLabel()}.`;
        renderPcolModule();
        renderDpaeModule();
        renderDelaiModule();
        renderTrarModule();
      }

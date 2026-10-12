      function renderPayrollModule() {
        document.getElementById("payrollSubtitle").textContent = `Suivez les procédures collectives et les accords de délais de paiement en ${scopeLabel()}.`;
        renderPcolModule();
        renderDelaiModule();
      }

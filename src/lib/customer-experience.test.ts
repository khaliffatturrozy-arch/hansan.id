export {};

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { CustomerExperienceService } = require("./customer-experience");

describe("customer experience", () => {
  it("builds a page, validates content config, and versions published changes", () => {
    const service = new CustomerExperienceService();
    const site = service.createExperience({
      id: "site-1",
      organizationId: "org-1",
      outletId: "outlet-1",
      name: "Casual Dining",
      theme: { colors: { primary: "#1a73e8" } },
    });

    const page = service.addPage(site.id, {
      id: "page-home",
      name: "Home",
      slug: "/",
      sections: [{ type: "hero", config: { headline: "Welcome" } }],
    });

    service.reorderSection(page.id, "hero", 0);
    const version = service.saveVersion(site.id, { label: "Initial launch", published: false });

    assert.equal(page.slug, "/");
    assert.equal(site.currentVersion, "v1");
    assert.equal(version.version, "v1");

    const invalid = service.addPage(site.id, {
      id: "page-bad",
      name: "Bad",
      slug: "javascript:alert(1)",
      sections: [],
    });

    assert.equal(invalid.valid, false);
  });

  it("supports responsive nav and blocks unsafe custom code", () => {
    const service = new CustomerExperienceService();
    const site = service.createExperience({ id: "site-2", organizationId: "org-1", outletId: "outlet-1", name: "Brand", theme: { colors: { primary: "#000" } } });
    const nav = service.updateNavbar(site.id, {
      logo: true,
      menu: true,
      reservation: true,
      account: true,
      mobile: { collapsed: true },
    });

    const blocked = service.setCustomCss(site.id, "body { background: url(javascript:alert(1)); }");
    assert.equal(nav.mobile.collapsed, true);
    assert.equal(blocked.allowed, false);
  });
});
